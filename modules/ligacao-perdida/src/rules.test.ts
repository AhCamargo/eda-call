import { describe, it, expect } from "vitest";
import { decide, isInsideWindow, nextWindowStart, renderMessage } from "./rules";
import { DEFAULT_SETTINGS, validateSettings } from "./settings";

const TZ = "America/Sao_Paulo";
// 2026-11-12 é quinta-feira. 14:00 em São Paulo = 17:00Z
const at = (iso: string) => new Date(iso);
const settings = { ...DEFAULT_SETTINGS, enabled: true, companyName: "GrãoSys" };
const call = { phone: "5544999998888", isMobile: true, missedAt: at("2026-11-12T17:00:00Z"), dueAt: at("2026-11-12T17:02:00Z") };
const base = { call, settings, lastAnsweredAt: null, lastSentAt: null, now: at("2026-11-12T17:03:00Z"), timeZone: TZ };

describe("janela de envio", () => {
  it("quinta 14h está dentro; domingo e 21h estão fora", () => {
    expect(isInsideWindow(at("2026-11-12T17:00:00Z"), settings.window, TZ)).toBe(true);
    expect(isInsideWindow(at("2026-11-15T17:00:00Z"), settings.window, TZ)).toBe(false);
    expect(isInsideWindow(at("2026-11-13T00:00:00Z"), settings.window, TZ)).toBe(false);
  });
  it("sábado 21h → segunda 08:00", () => {
    expect(nextWindowStart(at("2026-11-15T00:00:00Z"), settings.window, TZ)?.toISOString()).toBe("2026-11-16T11:00:00.000Z");
  });
});

describe("decide", () => {
  it("manda quando tudo está ok", () => {
    expect(decide(base)).toEqual({ action: "send" });
  });
  it("módulo desligado → não manda", () => {
    expect(decide({ ...base, settings: { ...settings, enabled: false } }).action).toBe("skip");
  });
  it("atendente retornou depois da ligação → não manda", () => {
    expect(decide({ ...base, lastAnsweredAt: at("2026-11-12T17:01:00Z") })).toMatchObject({ action: "skip" });
  });
  it("conversa ANTES da ligação perdida não impede", () => {
    expect(decide({ ...base, lastAnsweredAt: at("2026-11-12T10:00:00Z") }).action).toBe("send");
  });
  it("já mandou nas últimas 24h → não repete", () => {
    expect(decide({ ...base, lastSentAt: at("2026-11-12T08:00:00Z") }).action).toBe("skip");
  });
  it("fixo com 'só celulares' → não manda", () => {
    expect(decide({ ...base, call: { ...call, isMobile: false } }).action).toBe("skip");
  });
  it("antes do tempo de espera → aguarda", () => {
    expect(decide({ ...base, now: at("2026-11-12T17:01:00Z") })).toMatchObject({ action: "wait" });
  });
  it("fora do horário → aguarda a próxima janela", () => {
    const night = { ...call, missedAt: at("2026-11-12T23:30:00Z"), dueAt: at("2026-11-12T23:32:00Z") };
    const d = decide({ ...base, call: night, now: at("2026-11-12T23:40:00Z") });
    expect(d).toMatchObject({ action: "wait", until: at("2026-11-13T11:00:00Z") });
  });
  it("ligação velha demais → não manda", () => {
    expect(decide({ ...base, now: at("2026-11-13T17:00:00Z") }).action).toBe("skip");
  });
});

describe("mensagem e configuração", () => {
  it("troca as variáveis", () => {
    const text = renderMessage("Oi, aqui é a {empresa}. Vimos sua ligação das {horario} do {telefone}.", {
      companyName: "GrãoSys", phone: "5544999998888", missedAt: call.missedAt, timeZone: TZ,
    });
    expect(text).toBe("Oi, aqui é a GrãoSys. Vimos sua ligação das 14:00 do (44) 99999-8888.");
  });
  it("valida a configuração da tela", () => {
    expect(() => validateSettings({ companyName: "" , message: "Oi {empresa}" })).toThrow(/empresa/);
    expect(() => validateSettings({ companyName: "X", window: { start: "20:00", end: "08:00" } })).toThrow();
    expect(() => validateSettings({ companyName: "X", defaultAreaCode: "01" })).toThrow(/DDD/);
    expect(validateSettings({ companyName: "X", delayMinutes: "5" }).delayMinutes).toBe(5);
  });
});
