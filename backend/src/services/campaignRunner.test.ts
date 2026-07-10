import { vi, describe, it, expect, beforeEach } from "vitest";
import type { Server } from "socket.io";

const { originateCall, getAmiClient, queueManagerEvent, resetManagerEventQueue } = vi.hoisted(() => {
  let queuedEvent: any = null;
  const fakeAmi = {
    on: (_event: string, handler: (event: any) => void) => {
      if (queuedEvent) {
        const event = queuedEvent;
        queuedEvent = null;
        handler(event);
      }
    },
    removeListener: () => {},
  };
  return {
    originateCall: vi.fn().mockResolvedValue(undefined),
    getAmiClient: vi.fn(() => fakeAmi),
    queueManagerEvent: (event: any) => {
      queuedEvent = event;
    },
    resetManagerEventQueue: () => {
      queuedEvent = null;
    },
  };
});
vi.mock("../ami", () => ({ originateCall, getAmiClient }));

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
    resetManagerEventQueue();
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

  it("records the real result from the matching AMI Hangup event", async () => {
    originateCall.mockResolvedValueOnce({ Uniqueid: "uniq-1" });
    queueManagerEvent({ Event: "Hangup", Uniqueid: "uniq-1", Cause: 16 });
    const campaign = makeCampaign({ contacts: [{ phoneNumber: "555" }] });
    Campaign.findByPk.mockResolvedValue(campaign);

    await runCampaign(6, makeIo());

    expect(CallLog.create.mock.calls[0][0]).toMatchObject({
      phoneNumber: "555",
      result: "atendida",
    });
  });

  it("falls back to nao_atendida when no Hangup event arrives before the timeout", async () => {
    vi.useFakeTimers();
    try {
      originateCall.mockResolvedValueOnce({ Uniqueid: "uniq-2" });
      const campaign = makeCampaign({ contacts: [{ phoneNumber: "666" }] });
      Campaign.findByPk.mockResolvedValue(campaign);

      const promise = runCampaign(7, makeIo());
      await vi.advanceTimersByTimeAsync(60000);
      await promise;

      expect(CallLog.create.mock.calls[0][0]).toMatchObject({
        phoneNumber: "666",
        result: "nao_atendida",
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
