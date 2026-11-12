import { describe, it, expect, vi } from "vitest";
import { WahaConnector, phoneFromWid } from "./waha";
import { ConnectorError } from "./connector";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const make = (handler: (url: string, init: RequestInit) => Response) => {
  const fetchMock = vi.fn(async (url: any, init: any) => handler(String(url), init));
  return { conn: new WahaConnector({ url: "http://waha:3000", apiKey: "k", session: "default", fetch: fetchMock as any }), fetchMock };
};

describe("WahaConnector", () => {
  it("traduz o estado da sessão e o número", async () => {
    const { conn } = make(() => json(200, { status: "WORKING", me: { id: "5544999998888@c.us" } }));
    expect(await conn.getStatus()).toEqual({ status: "CONNECTED", phone: "5544999998888" });
  });

  it("sessão inexistente = desconectado; WAHA fora do ar = indisponível", async () => {
    expect((await make(() => json(404, {})).conn.getStatus()).status).toBe("DISCONNECTED");
    const down = new WahaConnector({ url: "http://waha:3000", apiKey: "k", session: "default", fetch: (async () => { throw new TypeError("fetch failed"); }) as any });
    expect((await down.getStatus()).status).toBe("UNAVAILABLE");
  });

  it("conectar cria a sessão se não existe e inicia", async () => {
    const calls: string[] = [];
    const { conn } = make((url, init) => {
      calls.push(`${init.method} ${url.replace("http://waha:3000", "")}`);
      if (init.method === "GET") return json(404, {});
      return json(201, {});
    });
    await conn.connect();
    expect(calls).toEqual(["GET /api/sessions/default", "POST /api/sessions", "POST /api/sessions/default/start"]);
  });

  it("manda a chave em todo pedido e usa o chatId canônico", async () => {
    const { conn, fetchMock } = make((url) =>
      url.includes("check-exists") ? json(200, { numberExists: true, chatId: "554499998888@c.us" }) : json(200, {}),
    );
    expect(await conn.resolveChat("5544999998888")).toBe("554499998888@c.us");
    expect((fetchMock.mock.calls[0][1] as any).headers["X-Api-Key"]).toBe("k");
  });

  it("não envia com a sessão desconectada", async () => {
    const { conn } = make(() => json(200, { status: "SCAN_QR_CODE" }));
    await expect(conn.sendText("x@c.us", "oi")).rejects.toBeInstanceOf(ConnectorError);
  });

  it("lê o número do id do WhatsApp", () => {
    expect(phoneFromWid("5544999998888:12@s.whatsapp.net")).toBe("5544999998888");
    expect(phoneFromWid("abc@lid")).toBeNull();
  });
});
