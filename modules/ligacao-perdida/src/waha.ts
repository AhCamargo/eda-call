import { ConnectionInfo, ConnectionStatus, ConnectorError, WhatsAppConnector } from "./connector";

// Conector WAHA (github.com/devlikeapro/waha, Apache-2.0), versão Core.
// Adaptado do cliente WAHA do DeskVoice (MIT, © 2026 Rafael Melgaço e
// contribuidores — github.com/DeskLabs-OpenSource/DeskVoice).
//
// O endereço do WAHA vem só do ambiente (rede interna do Compose), nunca da
// tela: uma URL digitada pelo operador faria o módulo mandar a chave do WAHA
// para qualquer lugar.

const TIMEOUT_MS = 10_000;
// Iniciar o que já roda / parar o que já parou responde 409 ou 422 em algumas versões.
const ALREADY = [409, 422];
// Conversas que o módulo não lê: sem isto o WAHA guardaria estados, grupos e canais.
const IGNORE = { status: true, groups: true, channels: true, broadcast: true };

const STATUS_MAP: Record<string, ConnectionStatus> = {
  WORKING: "CONNECTED",
  SCAN_QR_CODE: "WAITING_QR",
  STARTING: "STARTING",
  STOPPED: "DISCONNECTED",
  FAILED: "FAILED",
};

export interface WahaOptions {
  url: string;
  apiKey: string;
  session: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export const phoneFromWid = (id: string | undefined): string | null => {
  const m = /^(\d{8,15})(?::\d+)?@(?:c\.us|s\.whatsapp\.net)$/.exec(id ?? "");
  return m ? m[1] : null;
};

export class WahaConnector implements WhatsAppConnector {
  readonly provider = "waha";
  constructor(private readonly opts: WahaOptions) {}

  private async call(
    path: string,
    { method = "GET", body, tolerate = [], raw = false }: { method?: string; body?: unknown; tolerate?: number[]; raw?: boolean } = {},
  ): Promise<any> {
    if (!this.opts.apiKey) throw new ConnectorError("not_configured", "WAHA_API_KEY não configurada");
    let res: Response;
    try {
      res = await (this.opts.fetch ?? fetch)(`${this.opts.url}${path}`, {
        method,
        headers: {
          "X-Api-Key": this.opts.apiKey,
          Accept: "application/json",
          ...(body !== undefined && { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? TIMEOUT_MS),
      });
    } catch (error: any) {
      const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
      throw timedOut
        ? new ConnectorError("timeout", "O serviço do WhatsApp não respondeu a tempo")
        : new ConnectorError("unreachable", "Não foi possível falar com o serviço do WhatsApp (WAHA)");
    }
    if (tolerate.includes(res.status)) return null;
    if (res.status === 401) throw new ConnectorError("unauthorized", "O WAHA recusou a chave (WAHA_API_KEY)");
    if (!res.ok) throw new ConnectorError("rejected", `O WAHA respondeu HTTP ${res.status} em ${method} ${path}`);
    if (raw) return res;
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      throw new ConnectorError("invalid_response", `Resposta do WAHA não é JSON (${method} ${path})`);
    }
  }

  private sessionPath(suffix = "") {
    return `/api/sessions/${encodeURIComponent(this.opts.session)}${suffix}`;
  }

  async getStatus(): Promise<ConnectionInfo> {
    let session: any;
    try {
      session = await this.call(this.sessionPath(), { tolerate: [404] });
    } catch (error: any) {
      if (error instanceof ConnectorError && ["unreachable", "timeout", "not_configured"].includes(error.code)) {
        return { status: "UNAVAILABLE", phone: null, detail: error.message };
      }
      throw error;
    }
    if (!session) return { status: "DISCONNECTED", phone: null };
    return {
      status: STATUS_MAP[String(session.status)] ?? "DISCONNECTED",
      phone: phoneFromWid(session.me?.id),
    };
  }

  async connect(): Promise<void> {
    const existing = await this.call(this.sessionPath(), { tolerate: [404] });
    if (!existing) {
      await this.call("/api/sessions", {
        method: "POST",
        body: { name: this.opts.session, start: false, config: { ignore: IGNORE } },
      });
    }
    await this.call(this.sessionPath("/start"), { method: "POST", body: {}, tolerate: ALREADY });
  }

  async getQrDataUrl(): Promise<string> {
    const res: Response = await this.call(`/api/${encodeURIComponent(this.opts.session)}/auth/qr?format=image`, { raw: true });
    const type = res.headers.get("content-type") || "";
    if (type.includes("application/json")) {
      const json: any = await res.json();
      if (typeof json?.data !== "string") throw new ConnectorError("invalid_response", "QR Code não veio na resposta");
      return `data:${json.mimetype || "image/png"};base64,${json.data}`;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:image/png;base64,${buf.toString("base64")}`;
  }

  async logout(): Promise<void> {
    await this.call(this.sessionPath("/logout"), { method: "POST", body: {}, tolerate: [404, ...ALREADY] });
  }

  async resolveChat(digits: string): Promise<string | null> {
    const q = new URLSearchParams({ phone: digits, session: this.opts.session });
    try {
      const r = await this.call(`/api/contacts/check-exists?${q.toString()}`);
      if (!r?.numberExists) return null;
      return typeof r.chatId === "string" && r.chatId ? r.chatId : `${digits}@c.us`;
    } catch (error: any) {
      // Versão do WAHA sem a rota: segue com o número como está.
      if (error instanceof ConnectorError && error.code === "rejected") return `${digits}@c.us`;
      throw error;
    }
  }

  async sendText(chatId: string, text: string): Promise<void> {
    const status = await this.getStatus();
    if (status.status !== "CONNECTED") {
      throw new ConnectorError("not_connected", "WhatsApp não está conectado");
    }
    await this.call("/api/sendText", { method: "POST", body: { session: this.opts.session, chatId, text } });
  }
}
