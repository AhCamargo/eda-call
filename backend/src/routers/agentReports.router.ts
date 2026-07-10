import express, { Request, Response } from "express";
import logger from "../logger";
import { verifyToken } from "../middleware/auth";
import {
  getDailyReport,
  getTimeline,
  getPauseReasonSummary,
} from "../services/agentStatusLogger";

export const createAgentReportsRouter = () => {
  const router = express.Router();

  // ── Relatórios de produtividade dos agentes ─────────────────────────────────

  /**
   * GET /api/agent-reports
   * Resumo diário por agente: tempo em cada status num período.
   *
   * Query params:
   *   from        YYYY-MM-DD  (obrigatório)
   *   to          YYYY-MM-DD  (obrigatório)
   *   extensionId number      (opcional — filtra um agente)
   *
   * Resposta: array de { extensionId, extensionNumber, extensionName, date,
   *   onlineSeconds, pausedSeconds, inCallSeconds, inCampaignSeconds,
   *   trainingSeconds, offlineSeconds, totalTrackedSeconds }
   */
  router.get(
    "/agent-reports",
    verifyToken,
    async (req: Request, res: Response) => {
      const { from, to, extensionId } = req.query as Record<string, string>;

      if (!from || !to) {
        return res.status(400).json({ message: "Parâmetros 'from' e 'to' são obrigatórios (YYYY-MM-DD)" });
      }

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(from) || !dateRegex.test(to)) {
        return res.status(400).json({ message: "Formato de data inválido. Use YYYY-MM-DD" });
      }

      if (from > to) {
        return res.status(400).json({ message: "'from' deve ser anterior a 'to'" });
      }

      try {
        const report = await getDailyReport({
          from,
          to,
          extensionId: extensionId ? Number(extensionId) : undefined,
        });
        return res.json(report);
      } catch (err: any) {
        logger.error("[agent-reports]", { message: err.message });
        return res.status(500).json({ message: "Erro ao gerar relatório" });
      }
    },
  );

  /**
   * GET /api/agent-reports/timeline
   * Timeline detalhada de um agente em um dia específico.
   *
   * Query params:
   *   extensionId  number      (obrigatório)
   *   date         YYYY-MM-DD  (obrigatório)
   */
  router.get(
    "/agent-reports/timeline",
    verifyToken,
    async (req: Request, res: Response) => {
      const { extensionId, date } = req.query as Record<string, string>;

      if (!extensionId || !date) {
        return res.status(400).json({ message: "Parâmetros 'extensionId' e 'date' são obrigatórios" });
      }

      try {
        const timeline = await getTimeline({
          extensionId: Number(extensionId),
          date,
        });
        return res.json(timeline);
      } catch (err: any) {
        logger.error("[agent-reports/timeline]", { message: err.message });
        return res.status(500).json({ message: "Erro ao gerar timeline" });
      }
    },
  );

  /**
   * GET /api/agent-reports/pauses
   * Resumo de pausas agrupado por motivo num período.
   *
   * Query params:
   *   from        YYYY-MM-DD  (obrigatório)
   *   to          YYYY-MM-DD  (obrigatório)
   *   extensionId number      (opcional)
   */
  router.get(
    "/agent-reports/pauses",
    verifyToken,
    async (req: Request, res: Response) => {
      const { from, to, extensionId } = req.query as Record<string, string>;

      if (!from || !to) {
        return res.status(400).json({ message: "Parâmetros 'from' e 'to' são obrigatórios" });
      }

      try {
        const summary = await getPauseReasonSummary({
          from,
          to,
          extensionId: extensionId ? Number(extensionId) : undefined,
        });
        return res.json(summary);
      } catch (err: any) {
        logger.error("[agent-reports/pauses]", { message: err.message });
        return res.status(500).json({ message: "Erro ao gerar relatório de pausas" });
      }
    },
  );

  return router;
};
