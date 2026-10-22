import { vi, describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type { Server } from "socket.io";

const { UraReverseCampaign, UraReverseContact, emitCampaignStats } = vi.hoisted(() => ({
  UraReverseCampaign: { findByPk: vi.fn() },
  UraReverseContact: { count: vi.fn() },
  emitCampaignStats: vi.fn(),
}));
vi.mock("../db", () => ({
  UraReverseCampaign,
  UraReverseContact,
  UraReverseOption: {},
  UraLog: {},
  VoipLine: {},
  Extension: {},
}));
vi.mock("../ami", () => ({ originateReverseIvr: vi.fn() }));
vi.mock("../services/uraReverseWorker", () => ({ emitCampaignStats }));
vi.mock("../middleware/auth", () => ({
  requireSupervisor: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../middleware/rateLimit", () => ({
  actionLimiter: (_req: any, _res: any, next: any) => next(),
}));

import { createUraReverseRouter } from "./uraReverse.router";

const io = { emit: vi.fn() } as unknown as Server;
const app = express();
app.use(express.json());
app.use(createUraReverseRouter(io));

describe("POST /ura-reverse/campaigns/:id/start", () => {
  beforeEach(() => vi.clearAllMocks());

  it("recusa iniciar sem contatos pendentes", async () => {
    const campaign = { id: 7, status: "draft", save: vi.fn() };
    UraReverseCampaign.findByPk.mockResolvedValue(campaign);
    UraReverseContact.count.mockResolvedValue(0);
    const res = await request(app).post("/ura-reverse/campaigns/7/start");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/contatos/);
    expect(campaign.save).not.toHaveBeenCalled();
  });

  it("inicia quando há contatos pendentes", async () => {
    const campaign = { id: 7, status: "draft", save: vi.fn() };
    UraReverseCampaign.findByPk.mockResolvedValue(campaign);
    UraReverseContact.count.mockResolvedValue(3);
    const res = await request(app).post("/ura-reverse/campaigns/7/start");
    expect(res.status).toBe(200);
    expect(campaign.status).toBe("running");
  });
});
