import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Server } from "socket.io";

const { originateReverseIvr } = vi.hoisted(() => ({
  originateReverseIvr: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../ami", () => ({ originateReverseIvr }));

const { UraReverseCampaign, UraReverseContact, UraReverseOption, VoipLine, sequelize } = vi.hoisted(() => ({
  UraReverseCampaign: { findByPk: vi.fn(), findAll: vi.fn() },
  UraReverseContact: { findByPk: vi.fn(), findAll: vi.fn(), count: vi.fn() },
  UraReverseOption: { findAll: vi.fn() },
  VoipLine: { findByPk: vi.fn() },
  sequelize: {
    fn: (name: string, col: unknown) => ({ fn: name, col }),
    col: (name: string) => ({ col: name }),
  },
}));

vi.mock("../db", () => ({
  UraReverseCampaign,
  UraReverseContact,
  UraReverseOption,
  VoipLine,
  sequelize,
}));

import {
  emitCampaignStats,
  startUraReverseWorker,
  handleUraReverseDtmfEvent,
} from "./uraReverseWorker";

function makeContact(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    phoneNumber: "5511999999999",
    status: "calling",
    selectedOption: null,
    recordingPath: null,
    completedAt: null,
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("uraReverseWorker", () => {
  let io: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    io = { emit: vi.fn() };
    startUraReverseWorker(io as unknown as Server);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("replaces the previous polling timer instead of stacking a new one", () => {
    const clearSpy = vi.spyOn(global, "clearInterval");

    startUraReverseWorker(io as unknown as Server);

    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it("emits campaignId and stats grouped by contact status", async () => {
    UraReverseContact.findAll.mockResolvedValue([
      { status: "pending", count: "2" },
      { status: "answered", count: "1" },
      { status: "not_a_tracked_status", count: "5" },
    ]);

    await emitCampaignStats(42);

    expect(io.emit).toHaveBeenCalledWith(
      "ura-reverse:stats",
      expect.objectContaining({
        campaignId: 42,
        stats: expect.objectContaining({ pending: 2, answered: 1 }),
      }),
    );
    expect(UraReverseContact.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ group: ["status"] }),
    );
  });

  it("does nothing when the campaign does not exist", async () => {
    UraReverseCampaign.findByPk.mockResolvedValue(null);

    await handleUraReverseDtmfEvent({
      campaignId: 1,
      contactId: 10,
      selectedOption: "1",
      result: "answered",
    });

    expect(UraReverseContact.findByPk).not.toHaveBeenCalled();
  });

  it("does nothing when contactId is missing", async () => {
    UraReverseCampaign.findByPk.mockResolvedValue({ id: 1 });

    await handleUraReverseDtmfEvent({
      campaignId: 1,
      contactId: 0 as unknown as number,
      selectedOption: null,
      result: "answered",
    });

    expect(UraReverseContact.findByPk).not.toHaveBeenCalled();
  });

  it("marks the contact as answered for a plain DTMF result", async () => {
    UraReverseCampaign.findByPk.mockResolvedValue({ id: 1 });
    const contact = makeContact();
    UraReverseContact.findByPk.mockResolvedValue(contact);

    await handleUraReverseDtmfEvent({
      campaignId: 1,
      contactId: 10,
      selectedOption: "1",
      result: "opcao_1",
    });

    expect(contact.status).toBe("answered");
    expect(contact.selectedOption).toBe("1");
    expect(contact.save).toHaveBeenCalled();
  });

  it("marks the contact as busy when the result mentions busy", async () => {
    UraReverseCampaign.findByPk.mockResolvedValue({ id: 1 });
    const contact = makeContact();
    UraReverseContact.findByPk.mockResolvedValue(contact);

    await handleUraReverseDtmfEvent({
      campaignId: 1,
      contactId: 10,
      selectedOption: null,
      result: "linha_busy",
    });

    expect(contact.status).toBe("busy");
  });

  it("marks the contact as hangup when the result mentions hangup", async () => {
    UraReverseCampaign.findByPk.mockResolvedValue({ id: 1 });
    const contact = makeContact();
    UraReverseContact.findByPk.mockResolvedValue(contact);

    await handleUraReverseDtmfEvent({
      campaignId: 1,
      contactId: 10,
      selectedOption: null,
      result: "cliente_hangup",
    });

    expect(contact.status).toBe("hangup");
  });

  it("marks the contact as no_answer when the result mentions sem_opcao", async () => {
    UraReverseCampaign.findByPk.mockResolvedValue({ id: 1 });
    const contact = makeContact();
    UraReverseContact.findByPk.mockResolvedValue(contact);

    await handleUraReverseDtmfEvent({
      campaignId: 1,
      contactId: 10,
      selectedOption: null,
      result: "sem_opcao_selecionada",
    });

    expect(contact.status).toBe("no_answer");
  });
});
