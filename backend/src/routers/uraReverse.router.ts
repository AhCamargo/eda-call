import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { parse } from "csv-parse/sync";
import { Server } from "socket.io";
import config from "../config";
import { originateReverseIvr } from "../ami";
import { emitCampaignStats } from "../services/uraReverseWorker";
import {
  UraLog,
  UraReverseCampaign,
  UraReverseOption,
  UraReverseContact,
  VoipLine,
} from "../db";
import {
  upload,
  uploadAudio,
  normalizePhone,
  parseWavFormat,
  PHONE_REGEX,
} from "../utils/routeHelpers";

const { asteriskSoundsDir } = config;

const campaignAudioDir = path.join(asteriskSoundsDir, "campaigns");
if (!fs.existsSync(campaignAudioDir)) {
  fs.mkdirSync(campaignAudioDir, { recursive: true });
}

export const buildUraCampaignStats = async (campaignId: number) => {
  const contacts = (await UraReverseContact.findAll({
    where: { campaignId },
    attributes: ["status", "attempts"],
  })) as any[];

  const stats: Record<string, number> = {
    total: contacts.length,
    calling: 0,
    answered: 0,
    no_answer: 0,
    invalid: 0,
    busy: 0,
    hangup: 0,
    pending: 0,
    finished: 0,
  };

  for (const contact of contacts) {
    if (stats[contact.status] !== undefined) {
      stats[contact.status] += 1;
    }
  }

  return stats;
};

export const createUraReverseRouter = (io: Server) => {
  const router = express.Router();

  router.get("/ura-reverse/campaigns", async (_, res: Response) => {
    const campaigns = (await UraReverseCampaign.findAll({
      include: [
        { model: VoipLine, attributes: ["id", "name", "host", "port"] },
        { model: UraReverseOption, as: "options" },
        { model: UraReverseContact, as: "contacts" },
      ],
      order: [["createdAt", "DESC"]],
    })) as any[];

    const payload = await Promise.all(
      campaigns.map(async (campaign) => ({
        ...campaign.toJSON(),
        stats: await buildUraCampaignStats(campaign.id),
      })),
    );

    res.json(payload);
  });

  router.post("/ura-reverse/campaigns", async (req: Request, res: Response) => {
    const {
      name,
      voipLineId,
      digitTimeoutSeconds,
      maxAttempts,
      retryIntervalSeconds,
      concurrentCalls = 5,
      codec = "ulaw",
      callTimeoutSeconds = 25,
      detectVoicemail = false,
      autoCallback = false,
      dialTechnology = "SIP",
    } = req.body || {};

    if (!name || !String(name).trim()) {
      return res
        .status(400)
        .json({ message: "Nome da campanha é obrigatório" });
    }

    if (!voipLineId) {
      return res.status(400).json({ message: "Linha VoIP é obrigatória" });
    }

    const campaign = await UraReverseCampaign.create({
      name: String(name).trim(),
      voipLineId: Number(voipLineId),
      digitTimeoutSeconds: Number(digitTimeoutSeconds) || 5,
      maxAttempts: Number(maxAttempts) || 2,
      retryIntervalSeconds: Number(retryIntervalSeconds) || 30,
      concurrentCalls: Number(concurrentCalls) || 5,
      codec: String(codec || "ulaw"),
      callTimeoutSeconds: Number(callTimeoutSeconds) || 25,
      detectVoicemail: Boolean(detectVoicemail),
      autoCallback: Boolean(autoCallback),
      dialTechnology: "SIP",
    });

    return res.status(201).json(campaign);
  });

  router.patch(
    "/ura-reverse/campaigns/:id",
    async (req: Request, res: Response) => {
      const campaign = (await UraReverseCampaign.findByPk(req.params.id as string)) as any;
      if (!campaign) return res.status(404).json({ message: "Campanha não encontrada" });
      const allowed = ["name", "voipLineId", "audioFile", "concurrentCalls",
        "digitTimeoutSeconds", "maxAttempts", "retryIntervalSeconds", "callTimeoutSeconds"];
      for (const key of allowed) {
        if (req.body[key] !== undefined) campaign[key] = req.body[key];
      }
      await campaign.save();
      return res.json(campaign);
    },
  );

  router.delete(
    "/ura-reverse/campaigns/:id",
    async (req: Request, res: Response) => {
      const campaign = (await UraReverseCampaign.findByPk(req.params.id as string)) as any;
      if (!campaign) return res.status(404).json({ message: "Campanha não encontrada" });
      await campaign.destroy();
      return res.json({ message: "Campanha removida" });
    },
  );

  router.post(
    "/ura-reverse/campaigns/:id/audio",
    uploadAudio.single("audio"),
    async (req: Request, res: Response) => {
      const campaign = (await UraReverseCampaign.findByPk(
        req.params.id as string,
      )) as any;
      if (!campaign) {
        return res.status(404).json({ message: "Campanha URA não encontrada" });
      }

      if (!req.file) {
        return res
          .status(400)
          .json({ message: "Arquivo de áudio é obrigatório" });
      }

      const extension = path.extname(req.file.originalname || "").toLowerCase();
      if (extension !== ".wav") {
        return res
          .status(400)
          .json({ message: "Somente arquivo .wav é aceito" });
      }

      const wav = parseWavFormat(req.file.buffer);
      if (
        !wav ||
        wav.audioFormat !== 1 ||
        wav.channels !== 1 ||
        wav.sampleRate !== 8000
      ) {
        return res.status(400).json({
          message:
            "Áudio inválido. Envie WAV PCM mono com sample rate de 8000 Hz.",
        });
      }

      const fileName = `ura-campaign-${campaign.id}.wav`;
      const absolutePath = path.join(campaignAudioDir, fileName);
      fs.writeFileSync(absolutePath, req.file.buffer);

      campaign.audioFile = `custom/campaigns/${fileName.replace(/\.wav$/i, "")}`;
      await campaign.save();

      return res.json({
        message: "Áudio enviado com sucesso",
        audioFile: campaign.audioFile,
      });
    },
  );

  router.get(
    "/ura-reverse/campaigns/:id/options",
    async (req: Request, res: Response) => {
      const options = await UraReverseOption.findAll({
        where: { campaignId: req.params.id },
        order: [["keyDigit", "ASC"]],
      });
      res.json(options);
    },
  );

  router.post(
    "/ura-reverse/campaigns/:id/options",
    async (req: Request, res: Response) => {
      const campaign = (await UraReverseCampaign.findByPk(
        req.params.id as string,
      )) as any;
      if (!campaign) {
        return res.status(404).json({ message: "Campanha URA não encontrada" });
      }

      const options = Array.isArray(req.body?.options) ? req.body.options : [];
      const validDigits = new Set([
        "0",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
      ]);
      const validActions = new Set([
        "transfer_extension",
        "speak_commercial",
        "hangup",
      ]);

      for (const option of options) {
        const digit = String(option.keyDigit || "").trim();
        const action = String(option.actionType || "").trim();

        if (!validDigits.has(digit)) {
          return res.status(400).json({ message: `Tecla inválida: ${digit}` });
        }

        if (!validActions.has(action)) {
          return res.status(400).json({ message: `Ação inválida: ${action}` });
        }

        if (
          action === "transfer_extension" &&
          !String(option.targetExtension || "").trim()
        ) {
          return res.status(400).json({
            message: `Ramal obrigatório para transferência na tecla ${digit}`,
          });
        }
      }

      await UraReverseOption.destroy({ where: { campaignId: campaign.id } });
      if (options.length) {
        await UraReverseOption.bulkCreate(
          options.map((option: any) => ({
            campaignId: campaign.id,
            keyDigit: String(option.keyDigit).trim(),
            actionType: String(option.actionType).trim(),
            targetExtension: option.targetExtension
              ? String(option.targetExtension).trim()
              : null,
          })),
        );
      }

      const saved = await UraReverseOption.findAll({
        where: { campaignId: campaign.id },
        order: [["keyDigit", "ASC"]],
      });
      return res.json(saved);
    },
  );

  router.get(
    "/ura-reverse/campaigns/:id/contacts",
    async (req: Request, res: Response) => {
      const contacts = await UraReverseContact.findAll({
        where: { campaignId: req.params.id },
        order: [["createdAt", "DESC"]],
        limit: 500,
      });
      return res.json(contacts);
    },
  );

  router.post(
    "/ura-reverse/campaigns/:id/contacts/upload",
    upload.single("file"),
    async (req: Request, res: Response) => {
      const campaign = (await UraReverseCampaign.findByPk(
        req.params.id as string,
      )) as any;
      if (!campaign) {
        return res.status(404).json({ message: "Campanha URA não encontrada" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "Arquivo CSV é obrigatório" });
      }

      const csv = req.file.buffer.toString("utf-8");
      const records = parse(csv, {
        columns: true,
        skip_empty_lines: true,
      }) as any[];

      const normalized = records
        .map((row: any) =>
          normalizePhone(row.telefone || row.phone || row.phoneNumber),
        )
        .filter(Boolean);

      const valid: string[] = [];
      const invalid: string[] = [];

      for (const phone of normalized) {
        if (PHONE_REGEX.test(phone)) {
          valid.push(phone);
        } else {
          invalid.push(phone);
        }
      }

      if (!valid.length) {
        return res.status(400).json({
          message: "Nenhum telefone válido encontrado na coluna telefone",
          invalid,
        });
      }

      await UraReverseContact.bulkCreate(
        valid.map((phoneNumber) => ({
          campaignId: campaign.id,
          phoneNumber,
          status: "pending",
        })),
      );

      await emitCampaignStats(campaign.id);

      return res.json({
        message: "Lista importada",
        totalValid: valid.length,
        totalInvalid: invalid.length,
      });
    },
  );

  router.post(
    "/ura-reverse/campaigns/:id/start",
    async (req: Request, res: Response) => {
      const campaign = (await UraReverseCampaign.findByPk(
        req.params.id as string,
      )) as any;
      if (!campaign) {
        return res.status(404).json({ message: "Campanha URA não encontrada" });
      }

      campaign.status = "running";
      await campaign.save();
      await emitCampaignStats(campaign.id);
      io.emit("ura-reverse:campaign-status", {
        campaignId: campaign.id,
        status: campaign.status,
      });

      return res.json({ message: "Campanha URA iniciada" });
    },
  );

  router.post(
    "/ura-reverse/campaigns/:id/pause",
    async (req: Request, res: Response) => {
      const campaign = (await UraReverseCampaign.findByPk(
        req.params.id as string,
      )) as any;
      if (!campaign) {
        return res.status(404).json({ message: "Campanha URA não encontrada" });
      }

      campaign.status = "paused";
      await campaign.save();
      io.emit("ura-reverse:campaign-status", {
        campaignId: campaign.id,
        status: campaign.status,
      });

      return res.json({ message: "Campanha URA pausada" });
    },
  );

  router.post(
    "/ura-reverse/campaigns/:id/finish",
    async (req: Request, res: Response) => {
      const campaign = (await UraReverseCampaign.findByPk(
        req.params.id as string,
      )) as any;
      if (!campaign) {
        return res.status(404).json({ message: "Campanha URA não encontrada" });
      }

      campaign.status = "finished";
      await campaign.save();
      io.emit("ura-reverse:campaign-status", {
        campaignId: campaign.id,
        status: campaign.status,
      });

      return res.json({ message: "Campanha URA finalizada" });
    },
  );

  router.post("/ura/reverse-call", async (req: Request, res: Response) => {
    const {
      phoneNumber,
      voipLineName = null,
      campaignId = null,
      extensionId = null,
      targetExtension = "2001",
      option1TargetExtension = null,
      option2TargetExtension = null,
      option3TargetExtension = null,
      optionTargets = null,
      promptAudio = "custom/edacall-menu-ptbr",
    } = req.body || {};

    if (!phoneNumber) {
      return res.status(400).json({ message: "phoneNumber é obrigatório" });
    }

    const uraRef = `${Date.now()}-${randomBytes(6).toString("hex")}`;

    const defaultTarget = String(targetExtension || "2001").trim() || "2001";
    const target1 =
      String(optionTargets?.["1"] || option1TargetExtension || "").trim() ||
      defaultTarget;
    const target2 =
      String(optionTargets?.["2"] || option2TargetExtension || "").trim() ||
      defaultTarget;
    const target3 =
      String(optionTargets?.["3"] || option3TargetExtension || "").trim() ||
      defaultTarget;

    const pendingLog = (await UraLog.create({
      uraRef,
      campaignId,
      extensionId,
      phoneNumber: String(phoneNumber),
      selectedOption: null,
      audioPath: null,
      result: "pending",
    })) as any;

    try {
      const response = await originateReverseIvr({
        phoneNumber: String(phoneNumber),
        voipLineName,
        campaignId,
        extensionId,
        targetExtension: defaultTarget,
        option1TargetExtension: target1,
        option2TargetExtension: target2,
        option3TargetExtension: target3,
        promptAudio,
        uraRef,
      });

      return res.status(201).json({
        message: "URA reversa iniciada",
        uraRef,
        action: response,
        logId: pendingLog.id,
      });
    } catch (error: any) {
      pendingLog.result = "erro_origem";
      await pendingLog.save();

      return res.status(500).json({
        message: "Falha ao iniciar URA reversa",
        detail: error.message,
      });
    }
  });

  router.post("/ura/logs", async (req: Request, res: Response) => {
    const {
      uraRef = null,
      campaignId = null,
      extensionId = null,
      phoneNumber,
      selectedOption = null,
      audioPath = null,
      result = "pending",
    } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ message: "phoneNumber é obrigatório" });
    }

    const uraLog = await UraLog.create({
      uraRef,
      campaignId,
      extensionId,
      phoneNumber: String(phoneNumber),
      selectedOption,
      audioPath,
      result,
    });

    return res.status(201).json(uraLog);
  });

  return router;
};
