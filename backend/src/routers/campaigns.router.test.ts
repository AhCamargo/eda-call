import { vi, describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type { Server } from "socket.io";

const { Campaign, CampaignContact, runCampaign } = vi.hoisted(() => ({
  Campaign: { findByPk: vi.fn() },
  CampaignContact: { bulkCreate: vi.fn() },
  runCampaign: vi.fn(),
}));
vi.mock("../db", () => ({
  Campaign,
  CampaignContact,
  CallLog: {},
  Extension: {},
  VoipLine: {},
}));
vi.mock("../services/campaignRunner", () => ({ runCampaign }));
vi.mock("../middleware/auth", () => ({
  requireSupervisor: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../middleware/rateLimit", () => ({
  actionLimiter: (_req: any, _res: any, next: any) => next(),
}));

import { createCampaignsRouter } from "./campaigns.router";

const app = express();
app.use(express.json());
app.use(createCampaignsRouter({ emit: vi.fn() } as unknown as Server));

const campaignWith = (parts: { contacts?: number; extensions?: number; voipLines?: number }) => ({
  id: 1,
  contacts: Array(parts.contacts ?? 0).fill({ id: 1 }),
  extensions: Array(parts.extensions ?? 0).fill({ id: 1 }),
  voipLines: Array(parts.voipLines ?? 0).fill({ id: 1 }),
});

describe("POST /campaigns/:id/start", () => {
  beforeEach(() => vi.clearAllMocks());

  it("recusa e diz o que falta quando a campanha não está configurada", async () => {
    Campaign.findByPk.mockResolvedValue(campaignWith({ contacts: 3 }));
    const res = await request(app).post("/campaigns/1/start");
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("ramal");
    expect(res.body.message).toContain("linha telefônica");
    expect(res.body.message).not.toContain("contatos");
    expect(runCampaign).not.toHaveBeenCalled();
  });

  it("inicia quando tem contatos, ramal e linha", async () => {
    Campaign.findByPk.mockResolvedValue(campaignWith({ contacts: 3, extensions: 1, voipLines: 1 }));
    const res = await request(app).post("/campaigns/1/start");
    expect(res.status).toBe(200);
    expect(runCampaign).toHaveBeenCalledWith(1, expect.anything());
  });
});

describe("POST /campaigns/:id/upload-phones", () => {
  beforeEach(() => vi.clearAllMocks());

  it("importa a coluna telefone de um CSV com ;", async () => {
    Campaign.findByPk.mockResolvedValue({ id: 1 });
    const res = await request(app)
      .post("/campaigns/1/upload-phones")
      .attach("file", Buffer.from("Nome;Telefone\nAna;(11) 99999-0000\n"), "lista.csv");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(CampaignContact.bulkCreate).toHaveBeenCalledWith([
      { campaignId: 1, phoneNumber: "11999990000" },
    ]);
  });

  it("recusa arquivo sem nenhum telefone em vez de dizer que importou", async () => {
    Campaign.findByPk.mockResolvedValue({ id: 1 });
    const res = await request(app)
      .post("/campaigns/1/upload-phones")
      .attach("file", Buffer.from("nome\nAna\n"), "lista.csv");
    expect(res.status).toBe(400);
    expect(CampaignContact.bulkCreate).not.toHaveBeenCalled();
  });
});
