import express, { Request, Response } from "express";
import { Server } from "socket.io";
import logger from "./logger";
import { verifyToken } from "./middleware/auth";
import { createAuthRouter } from "./routers/auth.router";
import { createSecurityRouter } from "./routers/security.router";
import { createSupervisorRouter } from "./routers/supervisor.router";
import { createInternalRouter } from "./routers/internal.router";
import { createUraReverseRouter } from "./routers/uraReverse.router";
import { createDashboardRouter } from "./routers/dashboard.router";
import { createExtensionsRouter } from "./routers/extensions.router";
import { createVoipLinesRouter } from "./routers/voipLines.router";
import { createCampaignsRouter } from "./routers/campaigns.router";
import { createRecordingsRouter } from "./routers/recordings.router";
import { createReportsRouter } from "./routers/reports.router";
import { createQueuesRouter } from "./routers/queues.router";
import { createSoundsRouter } from "./routers/sounds.router";
import { createInboundIvrRouter } from "./routers/inboundIvr.router";
import { createSettingsRouter } from "./routers/settings.router";
import { createInboundRoutesRouter } from "./routers/inboundRoutes.router";
import { createAgentReportsRouter } from "./routers/agentReports.router";
import { createMetricsRouter } from "./routers/metrics.router";
import { recordError5xx } from "./services/metricsCollector";

export const createRoutes = (io: Server) => {
  const router = express.Router();

  router.get("/health", (_, res) => res.json({ ok: true }));

  // ── Rotas públicas / com autenticação explícita própria ──────────────────
  router.use(createAuthRouter());
  router.use(createSecurityRouter());
  router.use(createSupervisorRouter(io));
  router.use(createInternalRouter());
  router.use(createMetricsRouter());

  // A partir daqui, todas as rotas exigem token (equivalente ao antigo
  // `router.use(verifyToken)` no meio do arquivo monolítico).
  router.use(verifyToken);

  router.use(createUraReverseRouter(io));
  router.use(createDashboardRouter());
  router.use(createExtensionsRouter(io));
  router.use(createVoipLinesRouter());
  router.use(createCampaignsRouter(io));
  router.use(createRecordingsRouter());
  router.use(createReportsRouter());
  router.use(createQueuesRouter());
  router.use(createSoundsRouter());
  router.use(createInboundIvrRouter());
  router.use(createSettingsRouter());
  router.use(createInboundRoutesRouter());
  router.use(createAgentReportsRouter());

  // ── Error middleware (captura erros de todos os handlers async via express-async-errors) ──
  router.use(
    (
      err: any,
      req: Request,
      res: Response,
      _next: express.NextFunction,
    ) => {
      const status = err?.status || err?.statusCode || 500;
      if (status >= 500) recordError5xx();
      logger.error(`[API Error] ${req.method} ${req.path} — ${err?.message || err}`, {
        status,
        stack: err?.stack,
      });
      // Erros 5xx podem carregar detalhes internos (SQL, caminhos, stack) —
      // ficam só no log; o cliente recebe uma mensagem genérica.
      return res.status(status).json({
        message:
          status >= 500 ? "Erro interno do servidor" : err?.message || "Requisição inválida",
      });
    },
  );

  return router;
};
