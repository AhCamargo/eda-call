import { vi, describe, it, expect, beforeEach } from "vitest";
import type { Server } from "socket.io";

const { originateCall, watchOriginate, waitForHangup, nextOutcome } = vi.hoisted(() => {
  // Desfecho que o próximo OriginateResponse vai trazer (padrão: não atendeu).
  const nextOutcome = { value: { outcome: "no_answer", uniqueid: null as string | null } };
  return {
    nextOutcome,
    originateCall: vi.fn().mockResolvedValue(undefined),
    watchOriginate: vi.fn(() => ({
      result: Promise.resolve(nextOutcome.value),
      cancel: vi.fn(),
    })),
    waitForHangup: vi.fn().mockResolvedValue(undefined),
  };
});
vi.mock("../ami", () => ({
  originateCall,
  watchOriginate,
  waitForHangup,
  newActionId: (prefix: string) => `${prefix}-test`,
}));

const { Campaign, CallLog, UraLog } = vi.hoisted(() => ({
  Campaign: { findByPk: vi.fn() },
  CallLog: { create: vi.fn() },
  UraLog: { create: vi.fn() },
}));

vi.mock("../db", () => ({
  Campaign,
  CampaignContact: {},
  CallLog,
  UraLog,
  Extension: {},
  VoipLine: {},
}));

import { runCampaign } from "./campaignRunner";

function makeIo() {
  return { emit: vi.fn() } as unknown as Server;
}

function makeCampaign(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    status: "pending",
    intervalSeconds: 0,
    contacts: [],
    extensions: [],
    voipLines: [],
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("runCampaign", () => {
  beforeEach(() => {
    originateCall.mockClear();
    originateCall.mockResolvedValue(undefined);
    CallLog.create.mockClear();
    CallLog.create.mockResolvedValue({});
    UraLog.create.mockClear();
    UraLog.create.mockResolvedValue({});
    Campaign.findByPk.mockClear();
    waitForHangup.mockClear();
    nextOutcome.value = { outcome: "no_answer", uniqueid: null };
  });

  it("completes immediately when the campaign has no contacts", async () => {
    const campaign = makeCampaign();
    Campaign.findByPk.mockResolvedValue(campaign);

    await runCampaign(1, makeIo());

    expect(campaign.status).toBe("completed");
  });

  it("marks the campaign in_progress at start and completed at the end", async () => {
    const campaign = makeCampaign();
    const statuses: string[] = [];
    campaign.save.mockImplementation(async () => {
      statuses.push(campaign.status as string);
    });
    Campaign.findByPk.mockResolvedValue(campaign);

    await runCampaign(2, makeIo());

    expect(statuses).toEqual(["in_progress", "completed"]);
  });

  it("calls originateCall once per contact", async () => {
    const campaign = makeCampaign({
      contacts: [{ phoneNumber: "111" }, { phoneNumber: "222" }],
    });
    Campaign.findByPk.mockResolvedValue(campaign);

    await runCampaign(3, makeIo());

    expect(originateCall).toHaveBeenCalledTimes(2);
  });

  it("still creates a CallLog when originateCall throws", async () => {
    originateCall.mockRejectedValueOnce(new Error("AMI indisponível"));
    const campaign = makeCampaign({ contacts: [{ phoneNumber: "333" }] });
    Campaign.findByPk.mockResolvedValue(campaign);

    await runCampaign(4, makeIo());

    expect(CallLog.create).toHaveBeenCalledTimes(1);
    expect(CallLog.create.mock.calls[0][0]).toMatchObject({ phoneNumber: "333" });
  });

  it("is idempotent when called concurrently for the same campaign id", async () => {
    const campaign = makeCampaign({ contacts: [{ phoneNumber: "444" }] });
    Campaign.findByPk.mockResolvedValue(campaign);
    const io = makeIo();

    await Promise.all([runCampaign(5, io), runCampaign(5, io)]);

    expect(Campaign.findByPk).toHaveBeenCalledTimes(1);
  });

  it("marks answered from the OriginateResponse and waits for the call to end", async () => {
    nextOutcome.value = { outcome: "answered", uniqueid: "77.1" };
    const campaign = makeCampaign({ contacts: [{ phoneNumber: "555" }] });
    Campaign.findByPk.mockResolvedValue(campaign);

    await runCampaign(6, makeIo());

    expect(originateCall.mock.calls[0][3]).toBe("dialer-1-test");
    expect(CallLog.create.mock.calls[0][0]).toMatchObject({ phoneNumber: "555", result: "atendida" });
    expect(waitForHangup).toHaveBeenCalledWith("77.1", expect.any(Number));
  });

  it.each([
    ["no_answer", "nao_atendida"],
    ["busy", "rejeitada"],
    ["invalid", "numero_nao_existe"],
  ])("maps outcome %s to %s", async (outcome, expected) => {
    nextOutcome.value = { outcome, uniqueid: null };
    const campaign = makeCampaign({ contacts: [{ phoneNumber: "666" }] });
    Campaign.findByPk.mockResolvedValue(campaign);

    await runCampaign(7, makeIo());

    expect(CallLog.create.mock.calls[0][0]).toMatchObject({ result: expected });
    expect(waitForHangup).not.toHaveBeenCalled();
  });
});
