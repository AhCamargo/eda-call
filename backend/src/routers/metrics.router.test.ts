import { vi, describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";

const { Extension, runCommand } = vi.hoisted(() => ({
  Extension: { count: vi.fn().mockResolvedValue(0) },
  runCommand: vi.fn().mockResolvedValue({}),
}));
vi.mock("../db", () => ({ Extension }));
vi.mock("../ami", () => ({ runCommand }));

import { createMetricsRouter } from "./metrics.router";

function appWithRemoteAddress(remoteAddress: string) {
  const app = express();
  // Supertest conecta via socket local (127.0.0.1) por padrão; sobrescreve
  // o remoteAddress reportado para simular um IP externo chegando por trás
  // de um proxy, sem precisar de uma conexão de rede real.
  app.use((req, _res, next) => {
    Object.defineProperty(req.socket, "remoteAddress", { value: remoteAddress, configurable: true });
    next();
  });
  app.use(createMetricsRouter());
  return app;
}

describe("GET /metrics — restrito à rede interna (achado R6 da auditoria)", () => {
  it("rejeita chamada de IP público com 403", async () => {
    const res = await request(appWithRemoteAddress("203.0.113.5")).get("/metrics");
    expect(res.status).toBe(403);
  });

  it("aceita chamada de loopback", async () => {
    const res = await request(appWithRemoteAddress("127.0.0.1")).get("/metrics");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("recordingsDisk");
    expect(res.body).toHaveProperty("ami");
  });

  it("aceita chamada de rede privada Docker (172.17.x.x)", async () => {
    const res = await request(appWithRemoteAddress("172.17.0.5")).get("/metrics");
    expect(res.status).toBe(200);
  });

  it("rejeita chamada de IP privado que passou por proxy reverso (X-Forwarded-For)", async () => {
    const res = await request(appWithRemoteAddress("172.17.0.5"))
      .get("/metrics")
      .set("X-Forwarded-For", "203.0.113.5");
    expect(res.status).toBe(403);
  });
});
