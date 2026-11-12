import "express-async-errors";
import { vi, describe, it, expect, beforeEach } from "vitest";
import express, { NextFunction, Request, Response } from "express";
import request from "supertest";

const { ModuleRegistration, listEvents, latestEventId, forwardRequest } = vi.hoisted(() => ({
  ModuleRegistration: { findByPk: vi.fn(), findAll: vi.fn(), create: vi.fn() },
  listEvents: vi.fn(),
  latestEventId: vi.fn(),
  forwardRequest: vi.fn(async (_req: any, res: any, url: string, headers: any) => {
    res.json({ forwardedTo: url, headers });
  }),
}));

vi.mock("../db", () => ({ ModuleRegistration }));
vi.mock("../services/domainEvents", () => ({ listEvents, latestEventId }));
vi.mock("../utils/proxy", () => ({ forwardRequest }));
vi.mock("../logger", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../config", () => ({ default: { modulesSecret: "segredo-dos-modulos" } }));

import { createModulesInternalRouter, createModulesRouter, validateManifest } from "./modules.router";

const KEY = { "x-edacall-module-key": "segredo-dos-modulos" };
const manifest = {
  name: "Ligação perdida",
  version: "1.0.0",
  internalUrl: "http://mod-ligacao-perdida:4100",
  ui: { entry: "index.js", style: "index.css", minRole: "supervisor", menu: { label: "Ligação perdida" } },
};
const alive = (extra: any = {}) => ({
  id: "ligacao-perdida",
  name: manifest.name,
  version: "1.0.0",
  internalUrl: manifest.internalUrl,
  manifest,
  lastSeenAt: new Date(),
  save: vi.fn(),
  ...extra,
});

const app = (role?: string) => {
  const a = express();
  a.use(express.json());
  a.use(createModulesInternalRouter());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    if (role) req.user = { id: 1, role, username: role };
    next();
  });
  a.use(createModulesRouter());
  return a;
};

describe("rotas de módulos", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registro exige a chave de módulo", async () => {
    const res = await request(app()).put("/internal/modules/ligacao-perdida").send(manifest);
    expect(res.status).toBe(401);
    expect(ModuleRegistration.create).not.toHaveBeenCalled();
  });

  it("registra um módulo novo com a chave", async () => {
    ModuleRegistration.findByPk.mockResolvedValue(null);
    const res = await request(app()).put("/internal/modules/ligacao-perdida").set(KEY).send(manifest);
    expect(res.status).toBe(200);
    expect(ModuleRegistration.create).toHaveBeenCalledWith(expect.objectContaining({ id: "ligacao-perdida" }));
  });

  it("recusa internalUrl com caminho ou outro esquema", () => {
    expect(validateManifest({ ...manifest, internalUrl: "https://x:1/api" }).error).toBeTruthy();
    expect(validateManifest({ ...manifest, internalUrl: "http://x:1/evil" }).error).toBeTruthy();
    expect(validateManifest({ ...manifest, ui: { entry: "../../etc/passwd.js" } }).error).toBeTruthy();
  });

  it("eventos exigem a chave e respeitam after/types", async () => {
    listEvents.mockResolvedValue([{ id: 5, type: "call.missed", payload: {} }]);
    expect((await request(app()).get("/internal/modules/events")).status).toBe(401);
    const res = await request(app()).get("/internal/modules/events?after=4&types=call.missed").set(KEY);
    expect(res.status).toBe(200);
    expect(listEvents).toHaveBeenCalledWith({ after: 4, types: ["call.missed"], limit: 100 });
  });

  it("lista só módulos que o papel do usuário pode ver", async () => {
    ModuleRegistration.findAll.mockResolvedValue([alive()]);
    expect((await request(app("agent")).get("/modules")).body.modules).toHaveLength(0);
    expect((await request(app("supervisor")).get("/modules")).body.modules).toHaveLength(1);
  });

  it("API do módulo: papel abaixo do mínimo recebe 403", async () => {
    ModuleRegistration.findByPk.mockResolvedValue(alive());
    const res = await request(app("agent")).get("/modules/ligacao-perdida/api/status");
    expect(res.status).toBe(403);
    expect(forwardRequest).not.toHaveBeenCalled();
  });

  it("API do módulo: repassa com a chave e a identidade do usuário", async () => {
    ModuleRegistration.findByPk.mockResolvedValue(alive());
    const res = await request(app("admin")).get("/modules/ligacao-perdida/api/history?limit=5");
    expect(res.body.forwardedTo).toBe("http://mod-ligacao-perdida:4100/api/history?limit=5");
    expect(res.body.headers["x-edacall-module-key"]).toBe("segredo-dos-modulos");
    const user = JSON.parse(Buffer.from(res.body.headers["x-edacall-user"], "base64").toString());
    expect(user.role).toBe("admin");
  });

  it("módulo sem heartbeat recente não é servido", async () => {
    ModuleRegistration.findByPk.mockResolvedValue(alive({ lastSeenAt: new Date(Date.now() - 10 * 60 * 1000) }));
    expect((await request(app("admin")).get("/modules/ligacao-perdida/api/status")).status).toBe(404);
    expect((await request(app()).get("/modules/ligacao-perdida/ui/index.js")).status).toBe(404);
  });

  it("arquivos da tela não aceitam caminho com ..", async () => {
    ModuleRegistration.findByPk.mockResolvedValue(alive());
    const res = await request(app()).get("/modules/ligacao-perdida/ui/..%2F..%2Fsegredo");
    expect(res.status).toBe(400);
  });
});
