import express, { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "crypto";
import { Op } from "sequelize";
import config from "../config";
import logger from "../logger";
import { ModuleRegistration } from "../db";
import { listEvents, latestEventId } from "../services/domainEvents";
import { forwardRequest } from "../utils/proxy";

// ── Módulos "Lego" ──────────────────────────────────────────────────────────
// Cada módulo é um container opcional (ativado por profile do Docker Compose)
// que fala com o núcleo só por estas rotas:
//
//   módulo → núcleo (chave MODULES_SECRET no header X-EdaCall-Module-Key)
//     PUT /internal/modules/:id            registra e renova (heartbeat)
//     GET /internal/modules/events         lê a fila de fatos a partir de um id
//     GET /internal/modules/events/latest  id mais recente (ponto de partida)
//
//   navegador → núcleo → módulo
//     GET /modules                 módulos ativos que o usuário pode ver (login)
//     GET /modules/:id/ui/*        arquivos da tela do módulo (JS/CSS, públicos)
//     ALL /modules/:id/api/*       API do módulo (login + papel mínimo do manifesto)
//
// O núcleo repassa a identidade do usuário no header X-EdaCall-User e prova
// que é ele com a mesma chave — o módulo nunca recebe o JWT nem acessa a
// internet por conta própria para autenticar ninguém.

export const MODULE_ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const INTERNAL_URL_RE = /^http:\/\/[a-z0-9][a-z0-9.-]*(:\d{1,5})?$/i;
export const ACTIVE_WINDOW_MS = 3 * 60 * 1000;

const ROLE_RANK: Record<string, number> = { agent: 0, supervisor: 1, admin: 2 };
type Role = "agent" | "supervisor" | "admin";

export interface ModuleManifest {
  name: string;
  version?: string;
  internalUrl: string;
  ui?: {
    entry: string;
    style?: string;
    minRole?: Role;
    menu?: { label: string; hint?: string; icon?: string; section?: string };
  };
  consumes?: string[];
}

const safeEqual = (a: string, b: string) => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};

export const requireModuleKey = (req: Request, res: Response, next: NextFunction) => {
  if (!config.modulesSecret) {
    return res.status(503).json({ message: "Módulos desativados nesta instalação (MODULES_SECRET vazio)" });
  }
  const key = req.headers["x-edacall-module-key"];
  if (typeof key !== "string" || !safeEqual(key, config.modulesSecret)) {
    logger.warn(`[modules] chave de módulo inválida de ${req.socket.remoteAddress}`);
    return res.status(401).json({ message: "Chave de módulo inválida" });
  }
  return next();
};

export const validateManifest = (body: any): { manifest?: ModuleManifest; error?: string } => {
  if (!body || typeof body !== "object") return { error: "Manifesto ausente" };
  const { name, version, internalUrl, ui, consumes } = body;
  if (typeof name !== "string" || !name.trim() || name.length > 255) return { error: "name inválido" };
  if (typeof internalUrl !== "string" || !INTERNAL_URL_RE.test(internalUrl)) {
    return { error: "internalUrl deve ser http://host:porta, sem caminho" };
  }
  if (version !== undefined && (typeof version !== "string" || version.length > 50)) return { error: "version inválida" };
  if (ui !== undefined) {
    if (typeof ui !== "object" || typeof ui.entry !== "string" || !/^[\w./-]+\.js$/.test(ui.entry) || ui.entry.includes("..")) {
      return { error: "ui.entry deve ser um arquivo .js" };
    }
    if (ui.style !== undefined && (typeof ui.style !== "string" || !/^[\w./-]+\.css$/.test(ui.style) || ui.style.includes(".."))) {
      return { error: "ui.style deve ser um arquivo .css" };
    }
    if (ui.minRole !== undefined && !(ui.minRole in ROLE_RANK)) return { error: "ui.minRole inválido" };
    if (ui.menu !== undefined && (typeof ui.menu?.label !== "string" || !ui.menu.label.trim())) {
      return { error: "ui.menu.label obrigatório" };
    }
  }
  if (consumes !== undefined && (!Array.isArray(consumes) || consumes.some((c: any) => typeof c !== "string"))) {
    return { error: "consumes deve ser uma lista de tipos de evento" };
  }
  return {
    manifest: {
      name: name.trim(),
      version: version || "0.0.0",
      internalUrl: internalUrl.replace(/\/$/, ""),
      ui,
      consumes,
    },
  };
};

const findActiveModule = async (id: string) => {
  if (!MODULE_ID_RE.test(id)) return null;
  const mod = (await (ModuleRegistration as any).findByPk(id)) as any;
  if (!mod) return null;
  if (Date.now() - new Date(mod.lastSeenAt).getTime() > ACTIVE_WINDOW_MS) return null;
  return mod;
};

const minRoleOf = (mod: any): Role => (mod.manifest?.ui?.minRole as Role) || "admin";

export const canSee = (role: string | undefined, minRole: Role) =>
  (ROLE_RANK[role ?? ""] ?? -1) >= ROLE_RANK[minRole];

// Rotas sem login de usuário: chamadas pelos próprios módulos (com a chave)
// e os arquivos estáticos da tela (só JS/CSS, sem dados).
export const createModulesInternalRouter = () => {
  const router = express.Router();

  router.put("/internal/modules/:id", requireModuleKey, async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!MODULE_ID_RE.test(id)) return res.status(400).json({ message: "id de módulo inválido" });
    const { manifest, error } = validateManifest(req.body);
    if (!manifest) return res.status(400).json({ message: error });

    const now = new Date();
    const existing = (await (ModuleRegistration as any).findByPk(id)) as any;
    if (existing) {
      existing.name = manifest.name;
      existing.version = manifest.version;
      existing.internalUrl = manifest.internalUrl;
      existing.manifest = manifest;
      existing.lastSeenAt = now;
      await existing.save();
    } else {
      await (ModuleRegistration as any).create({
        id,
        name: manifest.name,
        version: manifest.version,
        internalUrl: manifest.internalUrl,
        manifest,
        lastSeenAt: now,
      });
      logger.info(`[modules] módulo registrado: ${id} (${manifest.name} ${manifest.version})`);
    }
    return res.json({ ok: true });
  });

  router.get("/internal/modules/events", requireModuleKey, async (req: Request, res: Response) => {
    const after = Number(req.query.after ?? 0);
    const limit = Math.min(Math.max(Number(req.query.limit ?? 100), 1), 500);
    if (!Number.isFinite(after) || after < 0) return res.status(400).json({ message: "after inválido" });
    const types = typeof req.query.types === "string" && req.query.types
      ? req.query.types.split(",").map((t) => t.trim()).filter(Boolean)
      : undefined;
    const events = await listEvents({ after, types, limit });
    return res.json({ events });
  });

  router.get("/internal/modules/events/latest", requireModuleKey, async (_req: Request, res: Response) => {
    return res.json({ id: await latestEventId() });
  });

  router.get("/modules/:id/ui/*", async (req: Request, res: Response) => {
    const mod = await findActiveModule(String(req.params.id));
    if (!mod) return res.status(404).json({ message: "Módulo não encontrado ou parado" });
    const file = String((req.params as any)[0] || "");
    if (!file || file.includes("..") || !/^[\w./-]+$/.test(file)) {
      return res.status(400).json({ message: "Arquivo inválido" });
    }
    return forwardRequest(req, res, `${mod.internalUrl}/ui/${file}`);
  });

  return router;
};

// Rotas com login (montadas depois do verifyToken em routes.ts).
export const createModulesRouter = () => {
  const router = express.Router();

  router.get("/modules", async (req: Request, res: Response) => {
    const since = new Date(Date.now() - ACTIVE_WINDOW_MS);
    const rows = (await (ModuleRegistration as any).findAll({
      where: { lastSeenAt: { [Op.gte]: since } },
      order: [["name", "ASC"]],
    })) as any[];
    const modules = rows
      .filter((m) => m.manifest?.ui && canSee(req.user?.role, minRoleOf(m)))
      .map((m) => ({
        id: m.id,
        name: m.name,
        version: m.version,
        ui: {
          entry: m.manifest.ui.entry,
          style: m.manifest.ui.style ?? null,
          menu: m.manifest.ui.menu ?? { label: m.name },
        },
      }));
    return res.json({ modules });
  });

  router.all("/modules/:id/api/*", async (req: Request, res: Response) => {
    const mod = await findActiveModule(String(req.params.id));
    if (!mod) return res.status(404).json({ message: "Módulo não encontrado ou parado" });
    if (!canSee(req.user?.role, minRoleOf(mod))) return res.status(403).json({ message: "Acesso negado" });

    const rest = String((req.params as any)[0] || "");
    const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
    const user = Buffer.from(JSON.stringify(req.user ?? {})).toString("base64");
    return forwardRequest(req, res, `${mod.internalUrl}/api/${rest}${query}`, {
      "x-edacall-module-key": config.modulesSecret,
      "x-edacall-user": user,
    });
  });

  return router;
};
