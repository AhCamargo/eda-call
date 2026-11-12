import http from "http";
import type { Request, Response } from "express";

// Repasse simples de uma requisição para um módulo na rede interna do Docker.
// O navegador só conhece o endereço da API do núcleo; o núcleo confere o login
// e encaminha para o container do módulo (que não é publicado para fora).

const PASS_REQUEST_HEADERS = ["content-type", "accept", "accept-language", "if-none-match", "if-modified-since"];
const PASS_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-encoding",
  "cache-control",
  "etag",
  "last-modified",
  "content-disposition",
];

const TIMEOUT_MS = 20_000;

export const forwardRequest = (
  req: Request,
  res: Response,
  targetUrl: string,
  extraHeaders: Record<string, string> = {},
): Promise<void> =>
  new Promise((resolve) => {
    const url = new URL(targetUrl);
    const headers: Record<string, string> = { ...extraHeaders };
    for (const name of PASS_REQUEST_HEADERS) {
      const value = req.headers[name];
      if (typeof value === "string") headers[name] = value;
    }

    // express.json() já consumiu o corpo JSON: reserializa. Outros corpos
    // (upload, texto) ainda estão no stream e vão por pipe.
    const hasBody = !["GET", "HEAD"].includes(req.method);
    const jsonAlreadyParsed = hasBody && req.is("application/json") && req.body !== undefined;
    let jsonBody: Buffer | null = null;
    if (jsonAlreadyParsed) {
      jsonBody = Buffer.from(JSON.stringify(req.body));
      headers["content-type"] = "application/json";
      headers["content-length"] = String(jsonBody.length);
    } else if (hasBody && typeof req.headers["content-length"] === "string") {
      headers["content-length"] = req.headers["content-length"];
    }

    const proxyReq = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: `${url.pathname}${url.search}`,
        method: req.method,
        headers,
        timeout: TIMEOUT_MS,
      },
      (proxyRes) => {
        res.status(proxyRes.statusCode || 502);
        for (const name of PASS_RESPONSE_HEADERS) {
          const value = proxyRes.headers[name];
          if (value !== undefined) res.setHeader(name, value as string);
        }
        proxyRes.pipe(res);
        proxyRes.on("end", () => resolve());
        proxyRes.on("error", () => resolve());
      },
    );

    proxyReq.on("timeout", () => proxyReq.destroy(new Error("timeout")));
    proxyReq.on("error", () => {
      if (!res.headersSent) res.status(502).json({ message: "Módulo indisponível no momento" });
      else res.end();
      resolve();
    });

    if (jsonBody) proxyReq.end(jsonBody);
    else if (hasBody) req.pipe(proxyReq);
    else proxyReq.end();
  });
