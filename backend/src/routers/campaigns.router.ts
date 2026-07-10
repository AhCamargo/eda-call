import express, { Request, Response } from "express";
import { parse } from "csv-parse/sync";
import { Server } from "socket.io";
import { Campaign, CampaignContact, CallLog, Extension, VoipLine } from "../db";
import { runCampaign } from "../services/campaignRunner";
import { upload } from "../utils/routeHelpers";

export const createCampaignsRouter = (io: Server) => {
  const router = express.Router();

  router.get("/campaigns", async (_, res: Response) => {
    const campaigns = await Campaign.findAll({
      include: [
        { model: CampaignContact, as: "contacts" },
        { model: Extension, as: "extensions" },
        { model: VoipLine, as: "voipLines" },
      ],
      order: [["createdAt", "DESC"]],
    });
    res.json(campaigns);
  });

  router.get("/campaigns/:id/report", async (req: Request, res: Response) => {
    const campaign = (await Campaign.findByPk(req.params.id as string, {
      include: [
        { model: CampaignContact, as: "contacts" },
        {
          model: Extension,
          as: "extensions",
          attributes: ["id", "number", "name"],
        },
        { model: VoipLine, as: "voipLines", attributes: ["id", "name"] },
        {
          model: CallLog,
          as: "calls",
          include: [{ model: Extension, attributes: ["id", "number", "name"] }],
          order: [["createdAt", "DESC"]],
        },
      ],
    })) as any;
    if (!campaign)
      return res.status(404).json({ message: "Campanha não encontrada" });

    const calls = campaign.calls || [];
    const contacts = campaign.contacts || [];
    const stats = {
      totalContacts: contacts.length,
      totalCalls: calls.length,
      atendida: calls.filter((c: any) => c.result === "atendida").length,
      nao_atendida: calls.filter((c: any) => c.result === "nao_atendida")
        .length,
      numero_nao_existe: calls.filter(
        (c: any) => c.result === "numero_nao_existe",
      ).length,
      rejeitada: calls.filter((c: any) => c.result === "rejeitada").length,
    };

    return res.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
      },
      stats,
      calls,
    });
  });

  router.post("/campaigns", async (req: Request, res: Response) => {
    const { name, intervalSeconds = 15 } = req.body;
    const campaign = await Campaign.create({ name, intervalSeconds });
    res.status(201).json(campaign);
  });

  router.patch("/campaigns/:id", async (req: Request, res: Response) => {
    const campaign = (await Campaign.findByPk(req.params.id as string)) as any;
    if (!campaign) {
      return res.status(404).json({ message: "Campanha não encontrada" });
    }

    const nextName =
      req.body?.name !== undefined
        ? String(req.body.name).trim()
        : campaign.name;
    const nextIntervalSeconds =
      req.body?.intervalSeconds !== undefined
        ? Number(req.body.intervalSeconds)
        : campaign.intervalSeconds;

    if (!nextName) {
      return res
        .status(400)
        .json({ message: "Nome da campanha é obrigatório" });
    }

    if (!Number.isInteger(nextIntervalSeconds) || nextIntervalSeconds <= 0) {
      return res.status(400).json({
        message: "Intervalo deve ser um número inteiro maior que zero",
      });
    }

    campaign.name = nextName;
    campaign.intervalSeconds = nextIntervalSeconds;
    await campaign.save();

    return res.json(campaign);
  });

  router.delete("/campaigns/:id", async (req: Request, res: Response) => {
    const campaign = (await Campaign.findByPk(req.params.id as string)) as any;
    if (!campaign) {
      return res.status(404).json({ message: "Campanha não encontrada" });
    }

    await campaign.setExtensions([]);
    await campaign.setVoipLines([]);
    await CampaignContact.destroy({ where: { campaignId: campaign.id } });
    await CallLog.destroy({ where: { campaignId: campaign.id } });
    await campaign.destroy();

    io.emit("dashboard:update");
    return res.json({ message: "Campanha deletada com sucesso" });
  });

  router.post(
    "/campaigns/:id/assign-extensions",
    async (req: Request, res: Response) => {
      const { extensionIds = [] } = req.body;
      const campaign = (await Campaign.findByPk(
        req.params.id as string,
      )) as any;
      if (!campaign) {
        return res.status(404).json({ message: "Campanha não encontrada" });
      }

      const extensions = await Extension.findAll({
        where: { id: extensionIds },
      });
      await campaign.setExtensions(extensions);
      return res.json({ message: "Ramais vinculados com sucesso" });
    },
  );

  router.post(
    "/campaigns/:id/assign-voip-lines",
    async (req: Request, res: Response) => {
      const { voipLineIds = [] } = req.body;
      const campaign = (await Campaign.findByPk(
        req.params.id as string,
      )) as any;
      if (!campaign) {
        return res.status(404).json({ message: "Campanha não encontrada" });
      }

      const lines = await VoipLine.findAll({ where: { id: voipLineIds } });
      await campaign.setVoipLines(lines);
      return res.json({ message: "Linhas VoIP vinculadas com sucesso" });
    },
  );

  router.post(
    "/campaigns/:id/upload-phones",
    upload.single("file"),
    async (req: Request, res: Response) => {
      const campaign = (await Campaign.findByPk(
        req.params.id as string,
      )) as any;
      if (!campaign) {
        return res.status(404).json({ message: "Campanha não encontrada" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "Arquivo não enviado" });
      }

      const csv = req.file.buffer.toString("utf-8");
      const records = parse(csv, {
        columns: true,
        skip_empty_lines: true,
      }) as any[];

      const contacts = records
        .map((row: any) => row.phoneNumber || row.phone || row.numero)
        .filter(Boolean)
        .map((phoneNumber: string) => ({
          campaignId: campaign.id,
          phoneNumber: String(phoneNumber),
        }));

      await CampaignContact.bulkCreate(contacts);
      return res.json({
        message: "Lista de telefones importada",
        total: contacts.length,
      });
    },
  );

  router.post("/campaigns/:id/start", async (req: Request, res: Response) => {
    const campaign = (await Campaign.findByPk(req.params.id as string)) as any;
    if (!campaign) {
      return res.status(404).json({ message: "Campanha não encontrada" });
    }

    runCampaign(campaign.id, io);
    return res.json({ message: "Campanha iniciada" });
  });

  return router;
};
