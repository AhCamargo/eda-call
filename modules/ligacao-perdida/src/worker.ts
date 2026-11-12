import type { Pool } from "pg";
import type { CoreClient, CoreEvent } from "./core";
import type { WhatsAppConnector } from "./connector";
import { ConnectorError } from "./connector";
import { SCHEMA, getSettings, getState, setState } from "./db";
import { normalizeBrPhone } from "./phone";
import { decide, renderMessage } from "./rules";

const CURSOR_KEY = "events_cursor";
const MAX_ATTEMPTS = 3;
const RETRY_MS = 5 * 60 * 1000;

const log = (msg: string) => console.log(`[ligacao-perdida] ${msg}`);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Pausa aleatória entre envios: número mandando em rajada é o que o WhatsApp bloqueia. */
const jitter = () => sleep(3000 + Math.floor(Math.random() * 5000));

export interface WorkerDeps {
  pool: Pool;
  core: CoreClient;
  whatsapp: WhatsAppConnector;
  timeZone: string;
  now?: () => Date;
  pause?: () => Promise<void>;
}

// ── 1. Ler os fatos do núcleo ────────────────────────────────────────────────
export const ingestEvents = async ({ pool, core, now = () => new Date() }: WorkerDeps): Promise<number> => {
  const cursorRaw = await getState(pool, CURSOR_KEY);
  if (cursorRaw === null) {
    // Primeira vez: começa do agora. Não manda mensagem para ligações antigas.
    const latest = await core.latestEventId();
    await setState(pool, CURSOR_KEY, String(latest));
    log(`primeira execução — lendo eventos a partir do id ${latest}`);
    return 0;
  }

  const events = await core.fetchEvents(Number(cursorRaw));
  if (!events.length) return 0;

  const settings = await getSettings(pool);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const event of events) await applyEvent(client, event, settings.defaultAreaCode, settings.delayMinutes, now);
    await setState(client, CURSOR_KEY, String(events[events.length - 1].id));
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return events.length;
};

const applyEvent = async (
  client: { query: Pool["query"] },
  event: CoreEvent,
  defaultAreaCode: string,
  delayMinutes: number,
  now: () => Date,
) => {
  const p = event.payload;
  const phone = normalizeBrPhone(p.phoneNumber, defaultAreaCode);
  const endedAt = new Date(p.endedAt || event.createdAt || now());

  if (event.type === "call.ended" && p.answeredByPerson && phone) {
    // Alguém conversou com este número (recebida ou retorno): não incomodar.
    await client.query(
      `INSERT INTO ${SCHEMA}.contacts (phone, last_answered_at) VALUES ($1, $2)
       ON CONFLICT (phone) DO UPDATE SET last_answered_at = GREATEST(${SCHEMA}.contacts.last_answered_at, EXCLUDED.last_answered_at)`,
      [phone.digits, endedAt],
    );
    return;
  }

  if (event.type === "call.missed") {
    await client.query(
      `INSERT INTO ${SCHEMA}.missed_calls (event_id, unique_id, phone_raw, phone, is_mobile, missed_at, due_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (event_id) DO NOTHING`,
      [
        event.id,
        p.uniqueId,
        p.phoneNumber || "",
        phone?.digits ?? null,
        phone?.isMobile ?? false,
        endedAt,
        new Date(endedAt.getTime() + delayMinutes * 60 * 1000),
      ],
    );
  }
};

// ── 2. Decidir e mandar ─────────────────────────────────────────────────────
export const processPending = async (deps: WorkerDeps): Promise<{ sent: number; skipped: number }> => {
  const { pool, whatsapp, timeZone, now = () => new Date(), pause = jitter } = deps;
  const settings = await getSettings(pool);
  const { rows } = await pool.query(
    `SELECT * FROM ${SCHEMA}.missed_calls WHERE status = 'pending' AND due_at <= $1 ORDER BY due_at LIMIT 20`,
    [now()],
  );
  let sent = 0;
  let skipped = 0;

  for (const row of rows) {
    const [{ rows: answered }, { rows: lastSent }] = await Promise.all([
      pool.query(`SELECT last_answered_at FROM ${SCHEMA}.contacts WHERE phone = $1`, [row.phone]),
      pool.query(`SELECT MAX(sent_at) AS at FROM ${SCHEMA}.missed_calls WHERE phone = $1 AND status = 'sent' AND NOT is_test`, [row.phone]),
    ]);
    const decision = decide({
      call: { phone: row.phone, isMobile: row.is_mobile, missedAt: new Date(row.missed_at), dueAt: new Date(row.due_at) },
      settings,
      lastAnsweredAt: answered[0]?.last_answered_at ? new Date(answered[0].last_answered_at) : null,
      lastSentAt: lastSent[0]?.at ? new Date(lastSent[0].at) : null,
      now: now(),
      timeZone,
    });

    if (decision.action === "skip") {
      await pool.query(`UPDATE ${SCHEMA}.missed_calls SET status = 'skipped', reason = $2 WHERE id = $1`, [row.id, decision.reason]);
      skipped++;
      continue;
    }
    if (decision.action === "wait") {
      await pool.query(`UPDATE ${SCHEMA}.missed_calls SET due_at = $2, reason = $3 WHERE id = $1`, [row.id, decision.until, decision.reason]);
      continue;
    }

    const text = renderMessage(settings.message, {
      companyName: settings.companyName,
      phone: row.phone,
      missedAt: new Date(row.missed_at),
      timeZone,
    });
    try {
      const chatId = await whatsapp.resolveChat(row.phone);
      if (!chatId) {
        await pool.query(`UPDATE ${SCHEMA}.missed_calls SET status = 'skipped', reason = 'Número sem WhatsApp' WHERE id = $1`, [row.id]);
        skipped++;
        continue;
      }
      await whatsapp.sendText(chatId, text);
      await pool.query(
        `UPDATE ${SCHEMA}.missed_calls SET status = 'sent', reason = NULL, message = $2, sent_at = $3 WHERE id = $1`,
        [row.id, text, now()],
      );
      sent++;
      log(`mensagem enviada para ${row.phone}`);
      await pause();
    } catch (error: any) {
      const notConnected = error instanceof ConnectorError && ["not_connected", "unreachable", "timeout"].includes(error.code);
      const attempts = row.attempts + (notConnected ? 0 : 1);
      if (attempts >= MAX_ATTEMPTS) {
        await pool.query(`UPDATE ${SCHEMA}.missed_calls SET status = 'failed', reason = $2, attempts = $3 WHERE id = $1`, [
          row.id,
          error.message,
          attempts,
        ]);
      } else {
        // WhatsApp desconectado não gasta tentativa: espera reconectar (até a idade máxima).
        await pool.query(`UPDATE ${SCHEMA}.missed_calls SET due_at = $2, reason = $3, attempts = $4 WHERE id = $1`, [
          row.id,
          new Date(now().getTime() + RETRY_MS),
          error.message,
          attempts,
        ]);
      }
      if (notConnected) break; // sem WhatsApp não adianta tentar os próximos agora
    }
  }
  return { sent, skipped };
};

export const startWorker = (deps: WorkerDeps) => {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await ingestEvents(deps);
      await processPending(deps);
    } catch (error: any) {
      log(`erro no ciclo: ${error.message}`);
    } finally {
      running = false;
    }
  };
  tick();
  return setInterval(tick, 5000);
};
