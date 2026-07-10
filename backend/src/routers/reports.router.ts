import express, { Request, Response } from "express";
import { Op } from "sequelize";
import {
  CallLog,
  Campaign,
  Extension,
  VoipLine,
  UraLog,
  CallRecording,
  UraReverseCampaign,
  UraReverseOption,
  UraReverseContact,
} from "../db";
import { toRecordingWebPath } from "../utils/routeHelpers";
import { buildUraCampaignStats } from "./uraReverse.router";

export const createReportsRouter = () => {
  const router = express.Router();

  router.get("/reports/summary", async (_, res: Response) => {
    const totalAnswered = await CallLog.count({
      where: { result: "atendida" },
    });
    const totalNumberNotExists = await CallLog.count({
      where: { result: "numero_nao_existe" },
    });

    res.json({
      quemAtendeu: totalAnswered,
      numeroNaoExiste: totalNumberNotExists,
    });
  });

  router.get("/reports/calls", async (req: Request, res: Response) => {
    const page  = Math.max(1, Number(req.query.page)  || 1);
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const offset = (page - 1) * limit;

    const { count, rows } = await CallLog.findAndCountAll({
      include: [
        { model: Campaign,  attributes: ["id", "name"] },
        { model: Extension, attributes: ["id", "number", "name"] },
        { model: VoipLine,  attributes: ["id", "name", "host", "port"] },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });
    res.json({ total: count, page, limit, data: rows });
  });

  router.get("/reports/calls-by-extension", async (req: Request, res: Response) => {
    const { from, to, extensionId } = req.query as Record<string, string>;
    const where: any = {};
    if (from && to) {
      where.createdAt = { [Op.between]: [`${from} 00:00:00`, `${to} 23:59:59`] };
    }
    if (extensionId) where.extensionId = Number(extensionId);

    const calls = await CallLog.findAll({
      where,
      include: [{ model: Extension, attributes: ["id", "number", "name"] }],
      order: [["createdAt", "DESC"]],
      limit: 5000,
    });
    res.json(calls);
  });

  router.get("/reports/calls-by-campaign", async (req: Request, res: Response) => {
    const { from, to, campaignId } = req.query as Record<string, string>;
    const where: any = {};
    if (from && to) {
      where.createdAt = { [Op.between]: [`${from} 00:00:00`, `${to} 23:59:59`] };
    }
    if (campaignId) where.campaignId = Number(campaignId);

    const calls = await CallLog.findAll({
      where,
      include: [{ model: Campaign, attributes: ["id", "name"] }],
      order: [["createdAt", "DESC"]],
      limit: 5000,
    });
    res.json(calls);
  });

  router.get("/reports/ura-logs", async (req: Request, res: Response) => {
    const page  = Math.max(1, Number(req.query.page)  || 1);
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const offset = (page - 1) * limit;

    const { count, rows } = await UraLog.findAndCountAll({
      include: [
        { model: Campaign,  attributes: ["id", "name"] },
        { model: Extension, attributes: ["id", "number", "name"] },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });
    res.json({ total: count, page, limit, data: rows });
  });

  router.get("/reports/recordings", async (req: Request, res: Response) => {
    const page  = Math.max(1, Number(req.query.page)  || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const { count, rows } = (await CallRecording.findAndCountAll({
      include: [
        { model: Campaign,  attributes: ["id", "name"] },
        { model: Extension, attributes: ["id", "number", "name"] },
        { model: CallLog,   attributes: ["id", "phoneNumber", "result"] },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    })) as any;

    res.json({
      total: count,
      page,
      limit,
      data: (rows as any[]).map((recording: any) => ({
        ...recording.toJSON(),
        webPath: toRecordingWebPath(recording.filePath),
      })),
    });
  });

  router.get("/reports/ura-reverse", async (_, res: Response) => {
    const campaigns = (await UraReverseCampaign.findAll({
      include: [
        { model: VoipLine, attributes: ["id", "name", "host", "port"] },
        { model: UraReverseOption, as: "options" },
        {
          model: UraReverseContact,
          as: "contacts",
          attributes: [
            "id",
            "phoneNumber",
            "status",
            "attempts",
            "selectedOption",
            "recordingPath",
            "lastResult",
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
    })) as any[];

    const payload = await Promise.all(
      campaigns.map(async (campaign) => ({
        ...campaign.toJSON(),
        stats: await buildUraCampaignStats(campaign.id),
      })),
    );

    return res.json(payload);
  });

  return router;
};
