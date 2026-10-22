import express, { Request, Response } from "express";
import { Server } from "socket.io";
import { Campaign, CampaignContact, CallLog, Extension, VoipLine } from "../db";
import { runCampaign } from "../services/campaignRunner";
import { upload } from "../utils/routeHelpers";
import { extractPhonesFromCsv } from "../utils/phoneList";
import { requireSupervisor } from "../middleware/auth";
import { actionLimiter } from "../middleware/rateLimit";

export const createCampaignsRouter = (io: Server) => {
  const router = express.Router();
  // Campanhas ficam fora do menu do papel agent — restringe toda a rota a
  // admin/supervisor (achado F6 da auditoria).
  router.use(requireSupervisor);

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
    actionLimiter,
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

      const { valid, invalid } = extractPhonesFromCsv(
        req.file.buffer.toString("utf-8"),
      );
      if (!valid.length) {
        return res.status(400).json({
          message:
            "Nenhum telefone encontrado no arquivo. Use uma coluna chamada \"telefone\" com DDD (ex: 11999990000).",
          totalInvalid: invalid.length,
        });
      }

      // Reimportar a mesma planilha não deve duplicar contatos.
      const existing = (await CampaignContact.findAll({
        where: { campaignId: campaign.id },
        attributes: ["phoneNumber"],
      })) as any[];
      const known = new Set(existing.map((c) => c.phoneNumber));
      const fresh = valid.filter((phone) => !known.has(phone));

      if (fresh.length) {
        await CampaignContact.bulkCreate(
          fresh.map((phoneNumber) => ({ campaignId: campaign.id, phoneNumber })),
        );
      }
      return res.json({
        message: "Lista de telefones importada",
        total: fresh.length,
        totalDuplicates: valid.length - fresh.length,
        totalInvalid: invalid.length,
      });
    },
  );

  router.delete(
    "/campaigns/:id/contacts/:contactId",
    async (req: Request, res: Response) => {
      const removed = await CampaignContact.destroy({
        where: { id: req.params.contactId, campaignId: req.params.id },
      });
      if (!removed) {
        return res.status(404).json({ message: "Contato não encontrado" });
      }
      return res.json({ message: "Contato removido" });
    },
  );

  router.delete("/campaigns/:id/contacts", async (req: Request, res: Response) => {
    const removed = await CampaignContact.destroy({
      where: { campaignId: req.params.id },
    });
    return res.json({ message: "Lista de contatos apagada", total: removed });
  });

  router.post("/campaigns/:id/start", actionLimiter, async (req: Request, res: Response) => {
    const campaign = (await Campaign.findByPk(req.params.id as string, {
      include: [
        { model: CampaignContact, as: "contacts", attributes: ["id"] },
        { model: Extension, as: "extensions", attributes: ["id"] },
        { model: VoipLine, as: "voipLines", attributes: ["id"] },
      ],
    })) as any;
    if (!campaign) {
      return res.status(404).json({ message: "Campanha não encontrada" });
    }

    // Sem estes itens o discador "roda" sem fazer nada útil (liga para o
    // ramal fixo 1000 ou disca sem linha) — melhor dizer o que falta.
    const missing = [
      !campaign.contacts?.length && "uma lista de contatos",
      !campaign.extensions?.length && "pelo menos um ramal para atender",
      !campaign.voipLines?.length && "uma linha telefônica",
    ].filter(Boolean);
    if (missing.length) {
      return res.status(400).json({
        message: `Antes de iniciar, adicione ${missing.join(", ")} em "Configurar".`,
      });
    }

    runCampaign(campaign.id, io);
    return res.json({ message: "Campanha iniciada" });
  });

  return router;
};
