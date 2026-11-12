import { MODULE_ID, MODULE_VERSION, ModuleConfig } from "./config";

// Cliente da API de módulos do núcleo do EdaCall.

export interface CoreEvent {
  id: number;
  type: string;
  payload: {
    uniqueId: string;
    direction: "inbound" | "outbound" | "internal";
    phoneNumber: string;
    answeredByPerson: boolean;
    extension: string | null;
    voipLine: string | null;
    talkSeconds: number;
    endedAt: string;
  };
  createdAt: string;
}

export const createCoreClient = (config: ModuleConfig, fetchImpl: typeof fetch = fetch) => {
  const headers = { "X-EdaCall-Module-Key": config.modulesSecret, "Content-Type": "application/json" };

  const request = async (path: string, init: RequestInit = {}): Promise<any> => {
    const res = await fetchImpl(`${config.coreUrl}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers || {}) },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`núcleo respondeu HTTP ${res.status} em ${path}`);
    return res.json();
  };

  return {
    register: () =>
      request(`/internal/modules/${MODULE_ID}`, {
        method: "PUT",
        body: JSON.stringify({
          name: "Ligação perdida → WhatsApp",
          version: MODULE_VERSION,
          internalUrl: config.internalUrl,
          consumes: ["call.missed", "call.ended"],
          ui: {
            entry: "index.js",
            style: "index.css",
            minRole: "supervisor",
            menu: {
              label: "Ligação perdida",
              hint: "Manda WhatsApp para quem ligou e não foi atendido",
              icon: "phone-missed",
            },
          },
        }),
      }),
    latestEventId: async (): Promise<number> => (await request("/internal/modules/events/latest")).id,
    fetchEvents: async (after: number, limit = 100): Promise<CoreEvent[]> =>
      (await request(`/internal/modules/events?after=${after}&types=call.missed,call.ended&limit=${limit}`)).events,
  };
};

export type CoreClient = ReturnType<typeof createCoreClient>;
