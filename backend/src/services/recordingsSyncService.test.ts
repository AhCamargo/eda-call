import { vi, describe, it, expect } from "vitest";

vi.mock("../db", () => ({ CallRecording: {}, Extension: {} }));
vi.mock("../logger", () => ({ default: { info: vi.fn(), error: vi.fn() } }));

import { parseRecordingFilename, findExtensionNumber } from "./recordingsSyncService";

const known = new Set(["2001", "2002", "C1-1000"]);
const extOf = (file: string) => findExtensionNumber(parseRecordingFilename(file).rest, known);

describe("associação da gravação ao ramal", () => {
  it("ligação entre ramais usa quem ligou", () => {
    expect(extOf("/rec/20261023-101500-1698765432.12-2001-2002.wav")).toBe("2001");
  });

  it("ligação recebida de fora usa o ramal de destino", () => {
    expect(extOf("/rec/20261023-101500-1698765432.12-11999990000-2002.wav")).toBe("2002");
  });

  it("aceita ramal com hífen", () => {
    expect(extOf("/rec/20261023-101500-1698765432.12-11999990000-C1-1000.wav")).toBe("C1-1000");
  });

  it("destino que não é ramal (fila) fica sem associação", () => {
    expect(extOf("/rec/20261023-101500-1698765432.12-11999990000-suporte.wav")).toBeNull();
  });

  it("lê o uniqueid", () => {
    expect(parseRecordingFilename("/rec/20261023-101500-1698765432.12-2001-2002.wav").uniqueId).toBe(
      "1698765432.12",
    );
  });
});
