import express, { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "crypto";
import type { Pool } from "pg";
import type { WhatsAppConnector } from "./connector";
import { SCHEMA, getSettings, saveSettings } from "./db";
import { normalizeBrPhone } from "./phone";
import { renderMessage } from "./rules";
import { validateSettings } from "./settings";

interface CoreUser {
  id: number;
  username: string;
  role: "admin" | "supervisor" | "agent";
}

declare global {
  namespace Express {
    interface Request {
      coreUser?: CoreUser;
    }
  }
}

// Só o núcleo do EdaCall chama esta API: ele confere o login do usuário e
// repassa quem é no header X-EdaCall-User, junto com a chave dos módulos.
export const requireCore = (secret: string) => (req: Request, res: Response, next: NextFunction) => {
  const key = req.headers["x-edacall-module-key"];
  const a = Buffer.from(typeof key === "string" ? key : "");
  const b = Buffer.from(secret);
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(401).json({ message: "Acesso só pelo EdaCall" });
  }
  try {
    const raw = String(req.headers["x-edacall-user"] || "");
    req.coreUser = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    return res.status(401).json({ message: "Usuário não informado" });
  }
  if (!req.coreUser?.role) return res.status(401).json({ message: "Usuário não informado" });
  return next();
};

const requireAdmin = (req: Request, res: Response, next: NextFunction) =>
  req.coreUser?.role === "admin" ? next() : res.status(403).json({ message: "Só o administrador pode alterar isto" });

const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response) =>
    fn(req, res).catch((error: any) => {
      console.error(`[ligacao-perdida] ${req.method} ${req.path}: ${error.message}`);
      res.status(error.status || 502).json({ message: error.message || "Erro no módulo" });
    });

export const createApi = (deps: { pool: Pool; whatsapp: WhatsAppConnector; secret: string; timeZone: string }) => {
  const { pool, whatsapp, secret, timeZone } = deps;
  const router = express.Router();
  router.use(express.json({ limit: "32kb" }));
  router.use(requireCore(secret));

  router.get(
    "/status",
    handle(async (_req, res) => {
      const [connection, settings, stats] = await Promise.all([
        whatsapp.getStatus(),
        getSettings(pool),
        pool.query(
          `SELECT status, COUNT(*)::int AS n FROM ${SCHEMA}.missed_calls
           WHERE NOT is_test AND (status = 'pending' OR created_at > NOW() - INTERVAL '24 hours') GROUP BY status`,
        ),
      ]);
      const counts: Record<string, number> = { pending: 0, sent: 0, skipped: 0, failed: 0 };
      for (const r of stats.rows) counts[r.status] = r.n;
      res.json({ connection, provider: whatsapp.provider, settings, last24h: counts });
    }),
  );

  router.get(
    "/settings",
    handle(async (_req, res) => {
      res.json(await getSettings(pool));
    }),
  );

  router.put(
    "/settings",
    requireAdmin,
    handle(async (req, res) => {
      let next;
      try {
        next = validateSettings(req.body, await getSettings(pool));
      } catch (error: any) {
        return res.status(400).json({ message: error.message });
      }
      await saveSettings(pool, next);
      return res.json(next);
    }),
  );

  router.post(
    "/whatsapp/connect",
    requireAdmin,
    handle(async (_req, res) => {
      await whatsapp.connect();
      res.json(await whatsapp.getStatus());
    }),
  );

  router.get(
    "/whatsapp/qr",
    requireAdmin,
    handle(async (_req, res) => {
      res.json({ image: await whatsapp.getQrDataUrl() });
    }),
  );

  router.post(
    "/whatsapp/logout",
    requireAdmin,
    handle(async (_req, res) => {
      await whatsapp.logout();
      res.json(await whatsapp.getStatus());
    }),
  );

  router.get(
    "/history",
    handle(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const { rows } = await pool.query(
        `SELECT id, phone_raw, phone, missed_at, status, reason, sent_at, is_test
         FROM ${SCHEMA}.missed_calls ORDER BY missed_at DESC, id DESC LIMIT $1`,
        [limit],
      );
      res.json({ items: rows });
    }),
  );

  router.post(
    "/test",
    requireAdmin,
    handle(async (req, res) => {
      const settings = await getSettings(pool);
      const phone = normalizeBrPhone(String(req.body?.phone || ""), settings.defaultAreaCode);
      if (!phone) return res.status(400).json({ message: "Número inválido. Use DDD + número." });
      const chatId = await whatsapp.resolveChat(phone.digits);
      if (!chatId) return res.status(400).json({ message: "Este número não tem WhatsApp" });
      const text = `[Teste] ${renderMessage(settings.message, {
        companyName: settings.companyName || "sua empresa",
        phone: phone.digits,
        missedAt: new Date(),
        timeZone,
      })}`;
      await whatsapp.sendText(chatId, text);
      await pool.query(
        `INSERT INTO ${SCHEMA}.missed_calls (phone_raw, phone, is_mobile, missed_at, due_at, status, reason, message, sent_at, is_test)
         VALUES ($1, $2, $3, NOW(), NOW(), 'sent', 'Mensagem de teste', $4, NOW(), TRUE)`,
        [String(req.body?.phone || ""), phone.digits, phone.isMobile, text],
      );
      return res.json({ ok: true });
    }),
  );

  return router;
};
