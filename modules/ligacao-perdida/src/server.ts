import express from "express";
import path from "path";
import { loadConfig, MODULE_ID, MODULE_VERSION } from "./config";
import { createPool, migrate } from "./db";
import { createCoreClient } from "./core";
import { WahaConnector } from "./waha";
import { createApi } from "./api";
import { startWorker } from "./worker";

// Módulo "Ligação perdida → WhatsApp" do EdaCall.
// Container opcional: sobe só quando o profile "ligacao-perdida" está ativo.

const main = async () => {
  const config = loadConfig();
  const pool = createPool(config.databaseUrl);
  await migrate(pool);

  const whatsapp = new WahaConnector(config.waha);
  const core = createCoreClient(config);

  const app = express();
  app.get("/health", (_req, res) => res.json({ ok: true, module: MODULE_ID, version: MODULE_VERSION }));
  // Tela do módulo (ES module carregado pelo painel). Arquivos sem dados.
  app.use(
    "/ui",
    express.static(path.join(__dirname, "ui"), {
      maxAge: "5m",
      setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
    }),
  );
  app.use("/api", createApi({ pool, whatsapp, secret: config.modulesSecret, timeZone: config.timeZone }));

  app.listen(config.port, () => console.log(`[${MODULE_ID}] v${MODULE_VERSION} na porta ${config.port}`));

  // Registro no núcleo: na subida e a cada minuto (o painel esconde módulo sem sinal).
  const register = () =>
    core.register().catch((error: Error) => console.error(`[${MODULE_ID}] registro no núcleo falhou: ${error.message}`));
  await register();
  setInterval(register, 60_000);

  startWorker({ pool, core, whatsapp, timeZone: config.timeZone });
};

main().catch((error) => {
  console.error(`[${MODULE_ID}] falha ao iniciar:`, error);
  process.exit(1);
});
