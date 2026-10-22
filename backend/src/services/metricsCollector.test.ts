import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { recordError5xx, getRecentError5xxCount } from "./metricsCollector";

describe("metricsCollector", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Drena qualquer entrada deixada por um teste anterior (o módulo mantém
    // estado entre testes do mesmo arquivo): salta bem à frente no tempo e
    // consulta com janela zero, o que descarta tudo que já estava lá.
    vi.setSystemTime(1_000_000_000);
    getRecentError5xxCount(0);
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("conta erros registrados dentro da janela", () => {
    recordError5xx();
    recordError5xx();
    expect(getRecentError5xxCount(60_000)).toBe(2);
  });

  it("não conta erros fora da janela informada", () => {
    recordError5xx();
    vi.setSystemTime(10_000);
    expect(getRecentError5xxCount(5_000)).toBe(0);
  });
});
