import { describe, it, expect } from "vitest";
import { wavDurationFromHeader } from "./wavDuration";

const wavHeader = (sampleRate: number, channels: number, bits: number) => {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii");
  h.write("WAVE", 8, "ascii");
  h.write("fmt ", 12, "ascii");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE((sampleRate * channels * bits) / 8, 28);
  h.writeUInt16LE((channels * bits) / 8, 32);
  h.writeUInt16LE(bits, 34);
  h.write("data", 36, "ascii");
  h.writeUInt32LE(0, 40); // cabeçalho desatualizado, como em gravação interrompida
  return h;
};

describe("wavDurationFromHeader", () => {
  it("gravação do Asterisk: 8 kHz mono 16-bit, 90 s", () => {
    expect(wavDurationFromHeader(wavHeader(8000, 1, 16), 44 + 16000 * 90)).toBe(90);
  });

  it("usa a taxa do cabeçalho (16 kHz estéreo)", () => {
    expect(wavDurationFromHeader(wavHeader(16000, 2, 16), 44 + 64000 * 10)).toBe(10);
  });

  it("sem cabeçalho reconhecível, assume o padrão do MixMonitor", () => {
    expect(wavDurationFromHeader(Buffer.alloc(44), 44 + 16000 * 5)).toBe(5);
  });

  it("arquivo só com cabeçalho dá 0", () => {
    expect(wavDurationFromHeader(wavHeader(8000, 1, 16), 44)).toBe(0);
  });
});
