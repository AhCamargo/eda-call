import { vi, describe, it, expect } from "vitest";

vi.mock("../db", () => ({ Extension: {}, CallLog: {}, VoipLine: {} }));
vi.mock("../ami", () => ({ getAmiClient: vi.fn(), runCommand: vi.fn() }));
vi.mock("../logger", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("./agentStatusLogger", () => ({ logStatusChange: vi.fn() }));

import { withAmiFieldNames } from "./amiStatusMonitor";

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
