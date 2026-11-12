import type { Settings, SendWindow } from "./settings";
import { formatBrPhone } from "./phone";

// Regras puras (sem banco nem rede) de quando uma ligação perdida vira mensagem.

const localParts = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { weekday, hhmm: `${get("hour")}:${get("minute")}` };
};

export const isInsideWindow = (date: Date, window: SendWindow, timeZone: string): boolean => {
  const { weekday, hhmm } = localParts(date, timeZone);
  return window.days.includes(weekday) && hhmm >= window.start && hhmm < window.end;
};

/** Próximo instante (em passos de 5 min, até 8 dias) dentro da janela de envio. */
export const nextWindowStart = (from: Date, window: SendWindow, timeZone: string): Date | null => {
  const step = 5 * 60 * 1000;
  let t = Math.ceil(from.getTime() / step) * step;
  const limit = from.getTime() + 8 * 24 * 60 * 60 * 1000;
  for (; t <= limit; t += step) {
    if (isInsideWindow(new Date(t), window, timeZone)) return new Date(t);
  }
  return null;
};

export interface PendingCall {
  phone: string | null;
  isMobile: boolean;
  missedAt: Date;
  dueAt: Date;
}

export type Decision =
  | { action: "send" }
  | { action: "skip"; reason: string }
  | { action: "wait"; until: Date; reason: string };

export const decide = (args: {
  call: PendingCall;
  settings: Settings;
  /** Última ligação com este número em que alguém conversou (recebida ou retorno). */
  lastAnsweredAt: Date | null;
  /** Última mensagem que este módulo mandou para este número. */
  lastSentAt: Date | null;
  now: Date;
  timeZone: string;
}): Decision => {
  const { call, settings, lastAnsweredAt, lastSentAt, now, timeZone } = args;
  const hour = 60 * 60 * 1000;

  if (!settings.enabled) return { action: "skip", reason: "Envio automático estava desligado" };
  if (!call.phone) return { action: "skip", reason: "Número oculto ou inválido" };
  if (settings.onlyMobile && !call.isMobile) return { action: "skip", reason: "Telefone fixo" };
  if (lastAnsweredAt && lastAnsweredAt >= call.missedAt) {
    return { action: "skip", reason: "Já houve conversa com este número depois da ligação" };
  }
  if (lastSentAt && now.getTime() - lastSentAt.getTime() < settings.cooldownHours * hour) {
    return { action: "skip", reason: `Já recebeu mensagem nas últimas ${settings.cooldownHours}h` };
  }
  if (now.getTime() - call.missedAt.getTime() > settings.maxAgeHours * hour) {
    return { action: "skip", reason: `Ligação com mais de ${settings.maxAgeHours}h` };
  }
  if (now < call.dueAt) return { action: "wait", until: call.dueAt, reason: "Aguardando o tempo de espera" };
  if (!isInsideWindow(now, settings.window, timeZone)) {
    const until = nextWindowStart(now, settings.window, timeZone);
    if (!until) return { action: "skip", reason: "Nenhum horário de envio configurado" };
    return { action: "wait", until, reason: "Fora do horário de envio" };
  }
  return { action: "send" };
};

export const renderMessage = (template: string, vars: { companyName: string; phone: string; missedAt: Date; timeZone: string }) => {
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: vars.timeZone, hour: "2-digit", minute: "2-digit" }).format(vars.missedAt);
  return template
    .replaceAll("{empresa}", vars.companyName)
    .replaceAll("{telefone}", formatBrPhone(vars.phone))
    .replaceAll("{horario}", hora);
};
