// Contador em memória de respostas 5xx recentes, para o endpoint /metrics
// (achado R6 da auditoria de segurança). Em memória é suficiente aqui: o
// objetivo é alertar sobre um pico de erros no processo atual, não manter
// histórico entre reinícios.
const FIVE_MINUTES_MS = 5 * 60 * 1000;

let errorTimestamps: number[] = [];

export const recordError5xx = () => {
  errorTimestamps.push(Date.now());
};

export const getRecentError5xxCount = (windowMs = FIVE_MINUTES_MS) => {
  const cutoff = Date.now() - windowMs;
  errorTimestamps = errorTimestamps.filter((ts) => ts >= cutoff);
  return errorTimestamps.length;
};
