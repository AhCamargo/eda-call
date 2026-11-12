export interface ModuleContext {
  apiBase: string;
  token: string;
  user: { id: number | string; username: string; role: "admin" | "supervisor" | "agent" };
  basePath: string;
  navigate: (path: string) => void;
}

export type ConnectionStatus = "CONNECTED" | "WAITING_QR" | "STARTING" | "DISCONNECTED" | "FAILED" | "UNAVAILABLE";

export interface Settings {
  enabled: boolean;
  companyName: string;
  message: string;
  delayMinutes: number;
  cooldownHours: number;
  maxAgeHours: number;
  window: { start: string; end: string; days: number[] };
  defaultAreaCode: string;
  onlyMobile: boolean;
}

export interface StatusResponse {
  connection: { status: ConnectionStatus; phone: string | null; detail?: string };
  provider: string;
  settings: Settings;
  last24h: { pending: number; sent: number; skipped: number; failed: number };
}

export interface HistoryItem {
  id: number;
  phone_raw: string;
  phone: string | null;
  missed_at: string;
  status: "pending" | "sent" | "skipped" | "failed";
  reason: string | null;
  sent_at: string | null;
  is_test: boolean;
}

export const createApi = (ctx: ModuleContext) => {
  const call = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const res = await fetch(`${ctx.apiBase}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${ctx.token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as any)?.message || `Erro ${res.status}`);
    return data as T;
  };
  return {
    status: () => call<StatusResponse>("/status"),
    history: () => call<{ items: HistoryItem[] }>("/history?limit=50"),
    saveSettings: (s: Settings) => call<Settings>("/settings", { method: "PUT", body: JSON.stringify(s) }),
    connect: () => call("/whatsapp/connect", { method: "POST", body: "{}" }),
    qr: () => call<{ image: string }>("/whatsapp/qr"),
    logout: () => call("/whatsapp/logout", { method: "POST", body: "{}" }),
    test: (phone: string) => call("/test", { method: "POST", body: JSON.stringify({ phone }) }),
  };
};

export type Api = ReturnType<typeof createApi>;
