/**
 * EdaCall — Serviço de Log de Status dos Agentes
 * ────────────────────────────────────────────────
 * Registra cada transição de status de um ramal no banco,
 * permitindo calcular tempo online, em pausa, em chamada e em treinamento.
 *
 * Fluxo:
 *   1. logStatusChange() é chamado toda vez que o status de um ramal muda
 *   2. Fecha a entrada aberta anterior (define endedAt + durationSeconds)
 *   3. Abre nova entrada com o novo status (endedAt = null)
 *
 * Relatórios:
 *   - getDailyReport()  → resumo por agente agrupado por dia
 *   - getTimeline()     → sequência de estados de um agente em um dia
 */

import { Op, QueryTypes } from "sequelize";
import { AgentStatusLog, Extension, sequelize } from "../db";
import logger from "../logger";

// ── Statuses que valem a pena logar (filtramos "ringing" pois é transitório) ─
const LOGGABLE_STATUSES = new Set([
  "online", "offline", "paused", "in_call", "in_campaign", "training",
]);

// ── Log de uma transição de status ───────────────────────────────────────────
export async function logStatusChange(
  extensionId: number,
  extensionNumber: string,
  extensionName: string,
  newStatus: string,
  pauseReason?: string | null,
): Promise<void> {
  if (!LOGGABLE_STATUSES.has(newStatus)) return;

  const now = new Date();

  // Fecha entrada aberta anterior (se existir)
  const openEntry = await (AgentStatusLog as any).findOne({
    where: { extensionId, endedAt: null },
    order: [["startedAt", "DESC"]],
  });

  if (openEntry) {
    // Não regrava o mesmo status seguido (evita duplicatas do polling)
    if (openEntry.status === newStatus && openEntry.pauseReason === (pauseReason ?? null)) {
      return;
    }

    const durationSeconds = Math.round(
      (now.getTime() - new Date(openEntry.startedAt).getTime()) / 1000,
    );
    await openEntry.update({ endedAt: now, durationSeconds });
  }

  // Abre nova entrada
  await (AgentStatusLog as any).create({
    extensionId,
    extensionNumber,
    extensionName,
    status:      newStatus,
    pauseReason: pauseReason ?? null,
    startedAt:   now,
    endedAt:     null,
    durationSeconds: null,
  });
}

// ── Fecha todas as entradas abertas (chamado no bootstrap para limpar restarts) ─
export async function closeAllOpenEntries(): Promise<void> {
  const now = new Date();
  const openEntries = await (AgentStatusLog as any).findAll({
    where: { endedAt: null },
  });

  for (const entry of openEntries) {
    const durationSeconds = Math.round(
      (now.getTime() - new Date(entry.startedAt).getTime()) / 1000,
    );
    await entry.update({ endedAt: now, durationSeconds });
  }

  if (openEntries.length > 0) {
    logger.info(`[AgentStatusLogger] ${openEntries.length} entradas abertas fechadas no restart.`);
  }
}

// ── Inicializa logs para todos os ramais ativos (chamado no bootstrap) ────────
export async function initStatusLogsFromCurrentState(): Promise<void> {
  await closeAllOpenEntries();

  const extensions = await (Extension as any).findAll() as any[];
  const now = new Date();

  for (const ext of extensions) {
    if (!LOGGABLE_STATUSES.has(ext.status)) continue;

    await (AgentStatusLog as any).create({
      extensionId:     ext.id,
      extensionNumber: ext.number,
      extensionName:   ext.name,
      status:          ext.status,
      pauseReason:     ext.status === "paused" ? (ext.pauseReason ?? null) : null,
      startedAt:       now,
      endedAt:         null,
      durationSeconds: null,
    });
  }
}

// ── Tipos dos relatórios ──────────────────────────────────────────────────────
export interface DailyAgentReport {
  extensionId:       number;
  extensionNumber:   string;
  extensionName:     string;
  date:              string;           // "YYYY-MM-DD"
  onlineSeconds:     number;
  offlineSeconds:    number;
  pausedSeconds:     number;
  inCallSeconds:     number;
  inCampaignSeconds: number;
  trainingSeconds:   number;
  totalTrackedSeconds: number;
}

export interface TimelineEntry {
  id:              number;
  extensionNumber: string;
  extensionName:   string;
  status:          string;
  pauseReason:     string | null;
  startedAt:       string;
  endedAt:         string | null;
  durationSeconds: number | null;
}

// ── Relatório diário por agente ───────────────────────────────────────────────
export async function getDailyReport(params: {
  from: string;       // "YYYY-MM-DD"
  to: string;         // "YYYY-MM-DD"
  extensionId?: number;
}): Promise<DailyAgentReport[]> {
  const { from, to, extensionId } = params;

  // Calcula o tempo efetivo de cada entrada dentro do intervalo solicitado,
  // mesmo que a entrada comece antes de `from` ou termine depois de `to`.
  const rows = await sequelize.query<any>(
    `SELECT
       "extensionId",
       "extensionNumber",
       "extensionName",
       DATE(TIMEZONE('America/Sao_Paulo', "startedAt")) AS date,
       "status",
       "pauseReason",
       EXTRACT(EPOCH FROM (
         LEAST(COALESCE("endedAt", NOW()), :toEnd) -
         GREATEST("startedAt", :fromStart)
       ))::INTEGER AS effective_seconds
     FROM "AgentStatusLogs"
     WHERE
       "startedAt" < :toEnd
       AND COALESCE("endedAt", NOW()) > :fromStart
       AND (:extensionId IS NULL OR "extensionId" = :extensionId)
     ORDER BY "extensionId", date`,
    {
      replacements: {
        fromStart:   `${from} 00:00:00-03`,
        toEnd:       `${to} 23:59:59-03`,
        extensionId: extensionId ?? null,
      },
      type: QueryTypes.SELECT,
    },
  );

  // Agrupa por extensão + dia
  const map = new Map<string, DailyAgentReport>();

  for (const row of rows) {
    const key = `${row.extensionId}_${row.date}`;
    if (!map.has(key)) {
      map.set(key, {
        extensionId:       Number(row.extensionId),
        extensionNumber:   row.extensionNumber,
        extensionName:     row.extensionName,
        date:              String(row.date),
        onlineSeconds:     0,
        offlineSeconds:    0,
        pausedSeconds:     0,
        inCallSeconds:     0,
        inCampaignSeconds: 0,
        trainingSeconds:   0,
        totalTrackedSeconds: 0,
      });
    }

    const report = map.get(key)!;
    const secs = Math.max(0, Number(row.effective_seconds) || 0);

    switch (row.status) {
      case "online":      report.onlineSeconds     += secs; break;
      case "offline":     report.offlineSeconds    += secs; break;
      case "paused":      report.pausedSeconds     += secs; break;
      case "in_call":     report.inCallSeconds     += secs; break;
      case "in_campaign": report.inCampaignSeconds += secs; break;
      case "training":    report.trainingSeconds   += secs; break;
    }
    report.totalTrackedSeconds += secs;
  }

  return Array.from(map.values()).sort((a, b) =>
    a.date.localeCompare(b.date) || a.extensionName.localeCompare(b.extensionName),
  );
}

// ── Timeline detalhada de um agente num dia ───────────────────────────────────
export async function getTimeline(params: {
  extensionId: number;
  date: string; // "YYYY-MM-DD"
}): Promise<TimelineEntry[]> {
  const { extensionId, date } = params;

  const entries = await (AgentStatusLog as any).findAll({
    where: {
      extensionId,
      startedAt: {
        [Op.lt]: `${date} 23:59:59-03`,
      },
      [Op.or]: [
        { endedAt: { [Op.gt]: `${date} 00:00:00-03` } },
        { endedAt: null },
      ],
    },
    order: [["startedAt", "ASC"]],
  }) as any[];

  return entries.map((e: any) => ({
    id:              e.id,
    extensionNumber: e.extensionNumber,
    extensionName:   e.extensionName,
    status:          e.status,
    pauseReason:     e.pauseReason ?? null,
    startedAt:       e.startedAt,
    endedAt:         e.endedAt ?? null,
    durationSeconds: e.durationSeconds ?? null,
  }));
}

// ── Resumo de pausas por motivo num período ───────────────────────────────────
export async function getPauseReasonSummary(params: {
  from: string;
  to: string;
  extensionId?: number;
}): Promise<Array<{ pauseReason: string; extensionName: string; totalSeconds: number; occurrences: number }>> {
  const { from, to, extensionId } = params;

  return await sequelize.query<any>(
    `SELECT
       "extensionName",
       COALESCE("pauseReason", 'Sem motivo') AS "pauseReason",
       COUNT(*)::INTEGER                      AS occurrences,
       SUM(COALESCE("durationSeconds", 0))::INTEGER AS "totalSeconds"
     FROM "AgentStatusLogs"
     WHERE
       "status" = 'paused'
       AND "startedAt" >= :fromStart
       AND "startedAt" <  :toEnd
       AND (:extensionId IS NULL OR "extensionId" = :extensionId)
     GROUP BY "extensionName", "pauseReason"
     ORDER BY "totalSeconds" DESC`,
    {
      replacements: {
        fromStart:   `${from} 00:00:00-03`,
        toEnd:       `${to} 23:59:59-03`,
        extensionId: extensionId ?? null,
      },
      type: QueryTypes.SELECT,
    },
  );
}
