import { vi, describe, it, expect, beforeEach } from "vitest";

const { Extension, VoipLine, CallLog } = vi.hoisted(() => ({
  Extension: { findOne: vi.fn() },
  VoipLine: { findOne: vi.fn() },
  CallLog: { findOne: vi.fn(), create: vi.fn() },
}));
vi.mock("../db", () => ({ Extension, CallLog, VoipLine }));
vi.mock("../ami", () => ({ getAmiClient: vi.fn(), runCommand: vi.fn() }));
vi.mock("../logger", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("./agentStatusLogger", () => ({ logStatusChange: vi.fn() }));

import { withAmiFieldNames, handleCdrEvent } from "./amiStatusMonitor";

describe("withAmiFieldNames", () => {
  // Formato real entregue pelo asterisk-manager: chaves em minúsculas.
  const cdr = withAmiFieldNames({
    event: "Cdr",
    uniqueid: "1698.42",
    source: "11999990000",
    destination: "2001",
    disposition: "ANSWERED",
    destinationchannel: "SIP/2001-00000002",
  });

  it("lê os nomes do protocolo AMI a partir das chaves minúsculas", () => {
    expect(cdr.Event).toBe("Cdr");
    expect(cdr.UniqueID).toBe("1698.42");
    expect(cdr.Disposition).toBe("ANSWERED");
    expect(cdr.DestinationChannel).toBe("SIP/2001-00000002");
  });

  it("campo ausente continua undefined", () => {
    expect(cdr.Billsec).toBeUndefined();
  });
});

describe("handleCdrEvent — direção da ligação", () => {
  const EXTENSIONS: Record<string, number> = { "2001": 1, "2002": 2 };
  const LINES: Record<string, number> = { efix: 10 };

  beforeEach(() => {
    vi.clearAllMocks();
    CallLog.findOne.mockResolvedValue(null);
    Extension.findOne.mockImplementation(async ({ where }: any) =>
      EXTENSIONS[where.number] ? { id: EXTENSIONS[where.number] } : null,
    );
    VoipLine.findOne.mockImplementation(async ({ where }: any) =>
      LINES[where.name] ? { id: LINES[where.name] } : null,
    );
  });

  // Simula o evento como o asterisk-manager entrega (minúsculas).
  const cdr = (fields: Record<string, string>) =>
    handleCdrEvent(
      withAmiFieldNames({
        event: "Cdr",
        uniqueid: "1.1",
        disposition: "ANSWERED",
        billableseconds: "45",
        duration: "60",
        ...fields,
      }),
    );
  const saved = () => CallLog.create.mock.calls[0][0];

  it("cliente ligou para a central e o ramal atendeu → recebida", async () => {
    await cdr({
      source: "11999990000",
      destination: "s",
      channel: "SIP/efix-00000001",
      destinationchannel: "SIP/2001-00000002",
      destinationcontext: "central-4431425388",
    });
    expect(saved()).toMatchObject({
      direction: "inbound",
      extensionId: 1,
      voipLineId: 10,
      phoneNumber: "11999990000",
      duration: 45, // tempo falado, sem o toque
    });
  });

  it("ramal ligou para um celular → feita", async () => {
    await cdr({
      source: "2001",
      destination: "11988880000",
      channel: "SIP/2001-00000003",
      destinationchannel: "SIP/efix-00000004",
      destinationcontext: "default",
    });
    expect(saved()).toMatchObject({ direction: "outbound", extensionId: 1, phoneNumber: "11988880000" });
  });

  it("ramal ligou para outro ramal → interna", async () => {
    await cdr({
      source: "2001",
      destination: "2002",
      channel: "SIP/2001-00000005",
      destinationchannel: "SIP/2002-00000006",
      destinationcontext: "default",
    });
    expect(saved()).toMatchObject({ direction: "internal", extensionId: 1 });
  });

  it("discador (sai pelo tronco com o ramal como CallerID) → feita", async () => {
    await cdr({
      source: "2001",
      destination: "2001",
      channel: "SIP/efix-00000007",
      destinationchannel: "SIP/2001-00000008",
      destinationcontext: "default",
    });
    expect(saved()).toMatchObject({ direction: "outbound", extensionId: 1 });
  });

  it("URA reversa → feita", async () => {
    await cdr({
      source: "11977770000",
      destination: "s",
      channel: "SIP/efix-00000009",
      destinationcontext: "ura-reversa",
    });
    expect(saved()).toMatchObject({ direction: "outbound" });
  });

  it("não duplica uma ligação já registrada", async () => {
    CallLog.findOne.mockResolvedValue({ id: 99 });
    await cdr({ source: "2001", destination: "2002" });
    expect(CallLog.create).not.toHaveBeenCalled();
  });
});
