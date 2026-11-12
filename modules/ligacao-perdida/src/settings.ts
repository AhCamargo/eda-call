export interface SendWindow {
  /** "HH:MM", horário local */
  start: string;
  end: string;
  /** 0 = domingo … 6 = sábado */
  days: number[];
}

export interface Settings {
  enabled: boolean;
  companyName: string;
  message: string;
  /** Espera antes de mandar — dá tempo do atendente retornar a ligação. */
  delayMinutes: number;
  /** Não manda de novo para o mesmo número dentro deste prazo. */
  cooldownHours: number;
  /** Ligação mais velha que isso (ex.: a noite toda fora da janela) não recebe mais. */
  maxAgeHours: number;
  window: SendWindow;
  /** DDD usado quando a operadora entrega o número sem DDD (ligação local). */
  defaultAreaCode: string;
  onlyMobile: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: false,
  companyName: "",
  message:
    "Olá! Vimos que você ligou para a {empresa} e não conseguimos atender agora. Como podemos ajudar? Pode responder por aqui mesmo.",
  delayMinutes: 2,
  cooldownHours: 24,
  maxAgeHours: 18,
  window: { start: "08:00", end: "20:00", days: [1, 2, 3, 4, 5, 6] },
  defaultAreaCode: "",
  onlyMobile: true,
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const int = (v: unknown, min: number, max: number, name: string): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} deve ser um número entre ${min} e ${max}`);
  return n;
};

/** Valida o que veio da tela; lança Error com mensagem em português. */
export const validateSettings = (input: any, current: Settings = DEFAULT_SETTINGS): Settings => {
  const merged: any = { ...current, ...(input || {}), window: { ...current.window, ...(input?.window || {}) } };

  if (typeof merged.enabled !== "boolean") throw new Error("enabled deve ser verdadeiro ou falso");
  if (typeof merged.onlyMobile !== "boolean") throw new Error("onlyMobile deve ser verdadeiro ou falso");
  const companyName = String(merged.companyName ?? "").trim().slice(0, 80);
  const message = String(merged.message ?? "").trim();
  if (message.length < 5 || message.length > 1000) throw new Error("A mensagem deve ter entre 5 e 1000 caracteres");
  if (message.includes("{empresa}") && !companyName) throw new Error("Preencha o nome da empresa (a mensagem usa {empresa})");

  const area = String(merged.defaultAreaCode ?? "").replace(/\D/g, "");
  if (area && !/^[1-9][1-9]$/.test(area)) throw new Error("DDD padrão inválido");

  const { start, end } = merged.window;
  if (!HHMM.test(start) || !HHMM.test(end)) throw new Error("Horário de envio deve estar no formato HH:MM");
  if (start >= end) throw new Error("O horário de início deve ser antes do fim");
  const days: number[] = Array.isArray(merged.window.days) ? [...new Set<number>(merged.window.days.map(Number))] : [];
  if (!days.length || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new Error("Escolha ao menos um dia da semana para envio");
  }

  return {
    enabled: merged.enabled,
    companyName,
    message,
    delayMinutes: int(merged.delayMinutes, 0, 120, "Espera"),
    cooldownHours: int(merged.cooldownHours, 1, 720, "Intervalo entre mensagens"),
    maxAgeHours: int(merged.maxAgeHours, 1, 72, "Idade máxima da ligação"),
    window: { start, end, days: days.sort() },
    defaultAreaCode: area,
    onlyMobile: merged.onlyMobile,
  };
};
