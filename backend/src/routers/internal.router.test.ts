import { vi, describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const { UraLog, handleUraReverseDtmfEvent } = vi.hoisted(() => ({
  UraLog: { findOne: vi.fn(), create: vi.fn() },
  handleUraReverseDtmfEvent: vi.fn(),
}));
vi.mock("../db", () => ({ UraLog }));
vi.mock("../services/uraReverseWorker", () => ({ handleUraReverseDtmfEvent }));
vi.mock("../logger", () => ({ default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { createInternalRouter } from "./internal.router";
import { signUraCallback } from "../utils/network";

const app = express();
app.use(express.json());
app.use(createInternalRouter());

const body = { uraRef: "uracamp-1-2-123", phoneNumber: "11999990000", result: "opcao_1" };

describe("POST /internal/ura/log — callback do Asterisk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    UraLog.findOne.mockResolvedValue(null);
    UraLog.create.mockResolvedValue({ id: 1 });
  });

  it("aceita callback com assinatura válida", async () => {
    const res = await request(app)
      .post(`/internal/ura/log?sig=${signUraCallback(body.uraRef)}`)
      .send(body);
    expect(res.status).toBe(201);
    expect(UraLog.create).toHaveBeenCalled();
  });

  it("rejeita callback sem assinatura", async () => {
    const res = await request(app).post("/internal/ura/log").send(body);
    expect(res.status).toBe(403);
    expect(UraLog.create).not.toHaveBeenCalled();
  });

  it("rejeita assinatura de outro uraRef", async () => {
    const res = await request(app)
      .post(`/internal/ura/log?sig=${signUraCallback("outro-ref")}`)
      .send(body);
    expect(res.status).toBe(403);
  });

  it("rejeita chamada vinda por proxy reverso mesmo com assinatura válida", async () => {
    const res = await request(app)
      .post(`/internal/ura/log?sig=${signUraCallback(body.uraRef)}`)
      .set("X-Forwarded-For", "203.0.113.5")
      .send(body);
    expect(res.status).toBe(403);
  });
});
