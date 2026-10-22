import { createHmac, timingSafeEqual } from "crypto";
import type { Request } from "express";
import config from "../config";

// Detecta chamadas de origem interna (loopback/rede privada) para
// endpoints que nunca devem ser expostos à internet pública — ex.: callback
// do Asterisk (internal.router.ts) e métricas de monitoramento
// (metrics.router.ts). Ver achado F12 (rodada 1) e R6 (rodada 2) da
// auditoria de segurança.
export const isInternalCaller = (remoteAddress: string | undefined): boolean => {
  const addr = (remoteAddress || "").replace(/^::ffff:/, "");
  if (addr === "::1" || addr === "127.0.0.1" || /^127\./.test(addr)) return true;
  if (/^10\./.test(addr)) return true;
  if (/^192\.168\./.test(addr)) return true;
  const match = addr.match(/^172\.(\d{1,3})\./);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(addr)) return true; // IPv6 ULA fc00::/7
  return false;
};

// Atrás de um proxy reverso (Traefik do Coolify, nginx), TODA requisição da
// internet chega com o IP privado do proxy — o teste de IP sozinho deixaria
// qualquer um passar. Proxies sempre adicionam um destes headers; o curl do
// dialplan e o agente de monitoramento local nunca adicionam.
const PROXY_HEADERS = ["x-forwarded-for", "forwarded", "x-real-ip"];

export const isInternalRequest = (req: Request): boolean =>
  !PROXY_HEADERS.some((h) => req.headers[h] !== undefined) &&
  isInternalCaller(req.socket.remoteAddress);

// Assinatura do callback da URA reversa: o backend anexa `?sig=` à
// URA_CALLBACK_URL no Originate e o dialplan devolve a URL intacta. Assim o
// endpoint só aceita callbacks de chamadas que o próprio backend originou,
// sem nenhuma chave extra para o operador configurar.
export const signUraCallback = (uraRef: string): string =>
  createHmac("sha256", config.jwtSecret).update(`ura-callback:${uraRef}`).digest("hex");

export const isValidUraCallbackSignature = (uraRef: unknown, sig: unknown): boolean => {
  if (typeof uraRef !== "string" || !uraRef || typeof sig !== "string") return false;
  const expected = Buffer.from(signUraCallback(uraRef));
  const received = Buffer.from(sig);
  return expected.length === received.length && timingSafeEqual(expected, received);
};
