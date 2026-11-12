import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../db", () => ({ DomainEvent: { create: vi.fn() } }));
vi.mock("../logger", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { createCallEventAggregator, CdrSummary } from "./callEvents";

const base: CdrSummary = {
  uniqueId: "1700.1",
  direction: "inbound",
  phoneNumber: "44999998888",
  answeredByPerson: false,
  extension: null,
  voipLine: "efix",
  talkSeconds: 0,
  endedAt: new Date("2026-11-12T12:00:00Z"),
};

describe("agregador de eventos de ligação", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("recebida que só a URA atendeu vira call.ended + call.missed depois do silêncio", async () => {
    const publish = vi.fn();
    const agg = createCallEventAggregator({ publish, quietMs: 1000 });
    agg.record(base);
    expect(publish).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(publish.mock.calls.map((c) => c[0])).toEqual(["call.ended", "call.missed"]);
    expect(publish.mock.calls[1][1]).toMatchObject({ phoneNumber: "44999998888", answeredByPerson: false });
  });

  it("URA atendeu e depois um ramal atendeu (mesmo UniqueID) não é perdida", async () => {
    const publish = vi.fn();
    const agg = createCallEventAggregator({ publish, quietMs: 1000 });
    agg.record(base);
    await vi.advanceTimersByTimeAsync(500);
    agg.record({ ...base, answeredByPerson: true, extension: "2001", talkSeconds: 90, endedAt: new Date("2026-11-12T12:02:00Z") });
    await vi.advanceTimersByTimeAsync(1000);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith("call.ended", expect.objectContaining({
      answeredByPerson: true,
      extension: "2001",
      talkSeconds: 90,
      endedAt: "2026-11-12T12:02:00.000Z",
    }));
  });

  it("feita sem atendimento não gera call.missed", async () => {
    const publish = vi.fn();
    const agg = createCallEventAggregator({ publish, quietMs: 1000 });
    agg.record({ ...base, direction: "outbound" });
    await agg.flushAll();
    expect(publish.mock.calls.map((c) => c[0])).toEqual(["call.ended"]);
    expect(agg.pendingCount()).toBe(0);
  });

  it("ignora registro sem UniqueID", () => {
    const agg = createCallEventAggregator({ publish: vi.fn(), quietMs: 1000 });
    agg.record({ ...base, uniqueId: "" });
    expect(agg.pendingCount()).toBe(0);
  });
});
