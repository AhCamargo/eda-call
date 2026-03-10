const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { parse } = require("csv-parse/sync");
const { login, verifyToken } = require("./auth");
const {
  internalApiKey,
  asteriskSoundsDir,
  asteriskRecordingsDir,
} = require("./config");
const { originateReverseIvr, originateCall } = require("./ami");
const { runCampaign } = require("./services/campaignRunner");
const {
  handleUraReverseDtmfEvent,
  emitCampaignStats,
} = require("./services/uraReverseWorker");
const {
  upsertSipExtension,
  upsertSipVoipLine,
  removeExtensionProvision,
  removeVoipLineProvision,
} = require("./services/asteriskProvisioning");
const {
  Extension,
  VoipLine,
  Campaign,
  CampaignContact,
  CallLog,
  CallRecording,
  UraLog,
  UraReverseCampaign,
  UraReverseOption,
  UraReverseContact,
} = require("./db");

const upload = multer({ storage: multer.memoryStorage() });
const uploadAudio = multer({ storage: multer.memoryStorage() });

const PHONE_REGEX = /^\d{10,14}$/;

const normalizePhone = (value) => String(value || "").replace(/\D/g, "");

const campaignAudioDir = path.join(asteriskSoundsDir, "campaigns");
if (!fs.existsSync(campaignAudioDir)) {
  fs.mkdirSync(campaignAudioDir, { recursive: true });
}

const parseWavFormat = (buffer) => {
  if (!buffer || buffer.length < 44) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF") return null;
  if (buffer.toString("ascii", 8, 12) !== "WAVE") return null;

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === "fmt ") {
      if (offset + 8 + 16 > buffer.length) return null;
      return {
        audioFormat: buffer.readUInt16LE(offset + 8),
        channels: buffer.readUInt16LE(offset + 10),
        sampleRate: buffer.readUInt32LE(offset + 12),
        bitsPerSample: buffer.readUInt16LE(offset + 22),
      };
    }

    offset += 8 + chunkSize;
  }

  return null;
};

const normalizeExtensionNumber = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

const isValidExtensionNumber = (value) => {
  const text = normalizeExtensionNumber(value);
  return /^\d+$/.test(text) || /^C\d+-\d+$/.test(text);
};

const extractSector = (number) => {
  const text = normalizeExtensionNumber(number);
  const match = text.match(/^(C\d+)-\d+$/);
  return match ? match[1] : null;
};

const withExtensionSector = (extension) => ({
  ...extension.toJSON(),
  sector: extractSector(extension.number),
});

const toRecordingWebPath = (filePath) => {
  if (!filePath) return null;
  const normalizedBase = path.resolve(asteriskRecordingsDir);
  const normalizedFile = path.resolve(filePath);

  if (!normalizedFile.startsWith(normalizedBase)) {
    return null;
  }

  const relative = path.relative(normalizedBase, normalizedFile);
  return `/recordings/${relative.split(path.sep).join("/")}`;
};

const createRoutes = (io) => {
  const router = express.Router();

  router.get("/health", (_, res) => res.json({ ok: true }));
  router.post("/auth/login", login);

  router.post("/internal/ura/log", async (req, res) => {
    const receivedKey = req.headers["x-internal-key"];
    if (!receivedKey || receivedKey !== internalApiKey) {
      return res.status(401).json({ message: "Não autorizado" });
    }

    const {
      uraRef = null,
      campaignId = null,
      extensionId = null,
      uraCampaignId = null,
      uraContactId = null,
      phoneNumber,
      selectedOption = null,
      audioPath = null,
      result = "pending",
    } = req.body || {};

    if (!phoneNumber) {
      return res.status(400).json({ message: "phoneNumber é obrigatório" });
    }

    let uraLog = null;
    if (uraRef) {
      uraLog = await UraLog.findOne({ where: { uraRef } });
    }

    if (uraLog) {
      uraLog.campaignId = campaignId || uraLog.campaignId;
      uraLog.extensionId = extensionId || uraLog.extensionId;
      uraLog.phoneNumber = String(phoneNumber);
      uraLog.selectedOption = selectedOption;
      uraLog.audioPath = audioPath;
      uraLog.result = result;
      await uraLog.save();

      if (uraCampaignId && uraContactId) {
        await handleUraReverseDtmfEvent({
          campaignId: Number(uraCampaignId),
          contactId: Number(uraContactId),
          selectedOption,
          result,
          recordingPath: audioPath,
        });
      }

      return res.json(uraLog);
    }

    const created = await UraLog.create({
      uraRef,
      campaignId,
      extensionId,
      phoneNumber: String(phoneNumber),
      selectedOption,
      audioPath,
      result,
    });

    if (uraCampaignId && uraContactId) {
      await handleUraReverseDtmfEvent({
        campaignId: Number(uraCampaignId),
        contactId: Number(uraContactId),
        selectedOption,
        result,
        recordingPath: audioPath,
      });
    }

    return res.status(201).json(created);
  });

  router.use(verifyToken);

  const buildUraCampaignStats = async (campaignId) => {
    const contacts = await UraReverseContact.findAll({
      where: { campaignId },
      attributes: ["status", "attempts"],
    });

    const stats = {
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

  router.get("/ura-reverse/campaigns", async (_, res) => {
    const campaigns = await UraReverseCampaign.findAll({
      include: [
        { model: VoipLine, attributes: ["id", "name", "host", "port"] },
        { model: UraReverseOption, as: "options" },
        { model: UraReverseContact, as: "contacts" },
      ],
      order: [["createdAt", "DESC"]],
    });

    const payload = await Promise.all(
      campaigns.map(async (campaign) => ({
        ...campaign.toJSON(),
        stats: await buildUraCampaignStats(campaign.id),
      })),
    );

    res.json(payload);
  });

  router.post("/ura-reverse/campaigns", async (req, res) => {
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
      dialTechnology = "PJSIP",
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
      dialTechnology:
        String(dialTechnology || "PJSIP").toUpperCase() === "SIP"
          ? "SIP"
          : "PJSIP",
    });

    return res.status(201).json(campaign);
  });

  router.post(
    "/ura-reverse/campaigns/:id/audio",
    uploadAudio.single("audio"),
    async (req, res) => {
      const campaign = await UraReverseCampaign.findByPk(req.params.id);
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

  router.get("/ura-reverse/campaigns/:id/options", async (req, res) => {
    const options = await UraReverseOption.findAll({
      where: { campaignId: req.params.id },
      order: [["keyDigit", "ASC"]],
    });
    res.json(options);
  });

  router.post("/ura-reverse/campaigns/:id/options", async (req, res) => {
    const campaign = await UraReverseCampaign.findByPk(req.params.id);
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
        options.map((option) => ({
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
  });

  router.get("/ura-reverse/campaigns/:id/contacts", async (req, res) => {
    const contacts = await UraReverseContact.findAll({
      where: { campaignId: req.params.id },
      order: [["createdAt", "DESC"]],
      limit: 500,
    });
    return res.json(contacts);
  });

  router.post(
    "/ura-reverse/campaigns/:id/contacts/upload",
    upload.single("file"),
    async (req, res) => {
      const campaign = await UraReverseCampaign.findByPk(req.params.id);
      if (!campaign) {
        return res.status(404).json({ message: "Campanha URA não encontrada" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "Arquivo CSV é obrigatório" });
      }

      const csv = req.file.buffer.toString("utf-8");
      const records = parse(csv, { columns: true, skip_empty_lines: true });

      const normalized = records
        .map((row) =>
          normalizePhone(row.telefone || row.phone || row.phoneNumber),
        )
        .filter(Boolean);

      const valid = [];
      const invalid = [];

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

  router.post("/ura-reverse/campaigns/:id/start", async (req, res) => {
    const campaign = await UraReverseCampaign.findByPk(req.params.id);
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
  });

  router.post("/ura-reverse/campaigns/:id/pause", async (req, res) => {
    const campaign = await UraReverseCampaign.findByPk(req.params.id);
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
  });

  router.post("/ura-reverse/campaigns/:id/finish", async (req, res) => {
    const campaign = await UraReverseCampaign.findByPk(req.params.id);
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
  });

  router.get("/dashboard", async (_, res) => {
    const extensions = await Extension.findAll();
    const campaigns = await Campaign.findAll({
      order: [["createdAt", "DESC"]],
      limit: 5,
    });

    const statusCounts = {
      online: 0,
      offline: 0,
      paused: 0,
      ringing: 0,
      in_call: 0,
      in_campaign: 0,
    };

    for (const extension of extensions) {
      statusCounts[extension.status] += 1;
    }

    res.json({ statusCounts, latestCampaigns: campaigns });
  });

  router.get("/extensions", async (_, res) => {
    const extensions = await Extension.findAll({ order: [["number", "ASC"]] });
    res.json(extensions.map(withExtensionSector));
  });

  router.post("/extensions", async (req, res) => {
    const { number, name, sipPassword } = req.body;
    const normalizedNumber = normalizeExtensionNumber(number);

    if (!isValidExtensionNumber(normalizedNumber)) {
      return res.status(400).json({
        message:
          "Formato de ramal inválido. Use apenas números (ex: 1000) ou padrão setorizado Cx-xxxx (ex: C1-1000).",
      });
    }

    const extension = await Extension.create({
      number: normalizedNumber,
      name,
      status: "offline",
    });

    try {
      await upsertSipExtension({
        number: normalizedNumber,
        secret: sipPassword || "1234",
      });
    } catch (error) {
      return res.status(201).json({
        ...withExtensionSector(extension),
        warning:
          "Ramal salvo no banco, mas falhou provisionamento no Asterisk. Verifique AMI e arquivo sip_custom.conf.",
        detail: error.message,
      });
    }

    io.emit("dashboard:update");
    res.status(201).json(withExtensionSector(extension));
  });

  router.patch("/extensions/:id/status", async (req, res) => {
    const { status } = req.body;
    const extension = await Extension.findByPk(req.params.id);
    if (!extension) {
      return res.status(404).json({ message: "Ramal não encontrado" });
    }

    extension.status = status;
    if (status !== "paused") {
      extension.pauseReason = null;
    }
    await extension.save();
    io.emit("dashboard:update");
    return res.json(withExtensionSector(extension));
  });

  router.patch("/extensions/:id/pause", async (req, res) => {
    const extension = await Extension.findByPk(req.params.id);
    if (!extension) {
      return res.status(404).json({ message: "Ramal não encontrado" });
    }

    const reason = String(req.body?.reason || "").trim();
    const allowedReasons = ["Banheiro", "Suporte Técnico", "Reunião"];

    if (!allowedReasons.includes(reason)) {
      return res.status(400).json({ message: "Motivo de pausa inválido" });
    }

    extension.status = "paused";
    extension.pauseReason = reason;
    await extension.save();

    io.emit("dashboard:update");
    return res.json(withExtensionSector(extension));
  });

  router.patch("/extensions/:id/resume", async (req, res) => {
    const extension = await Extension.findByPk(req.params.id);
    if (!extension) {
      return res.status(404).json({ message: "Ramal não encontrado" });
    }

    extension.status = "online";
    extension.pauseReason = null;
    await extension.save();

    io.emit("dashboard:update");
    return res.json(withExtensionSector(extension));
  });

  router.patch("/extensions/:id", async (req, res) => {
    const extension = await Extension.findByPk(req.params.id);
    if (!extension) {
      return res.status(404).json({ message: "Ramal não encontrado" });
    }

    const nextNumber =
      req.body?.number !== undefined
        ? normalizeExtensionNumber(req.body.number)
        : extension.number;
    const nextName =
      req.body?.name !== undefined
        ? String(req.body.name).trim()
        : extension.name;

    if (!nextName) {
      return res.status(400).json({ message: "Nome do ramal é obrigatório" });
    }

    if (!isValidExtensionNumber(nextNumber)) {
      return res.status(400).json({
        message:
          "Formato de ramal inválido. Use apenas números (ex: 1000) ou padrão setorizado Cx-xxxx (ex: C1-1000).",
      });
    }

    const oldNumber = extension.number;
    extension.number = nextNumber;
    extension.name = nextName;
    await extension.save();

    const secret = req.body?.sipPassword || "1234";
    if (oldNumber !== nextNumber) {
      await removeExtensionProvision({ number: oldNumber });
    }

    await upsertSipExtension({ number: nextNumber, secret });

    io.emit("dashboard:update");
    return res.json(withExtensionSector(extension));
  });

  router.delete("/extensions/:id", async (req, res) => {
    const extension = await Extension.findByPk(req.params.id);
    if (!extension) {
      return res.status(404).json({ message: "Ramal não encontrado" });
    }

    const number = extension.number;
    await extension.destroy();
    await removeExtensionProvision({ number });

    io.emit("dashboard:update");
    return res.json({ message: "Ramal deletado com sucesso" });
  });

  router.post("/extensions/:id/provision", async (req, res) => {
    const extension = await Extension.findByPk(req.params.id);
    if (!extension) {
      return res.status(404).json({ message: "Ramal não encontrado" });
    }

    await upsertSipExtension({
      number: extension.number,
      secret: req.body?.sipPassword || "1234",
    });

    return res.json({ message: "Ramal provisionado no Asterisk" });
  });

  router.post("/extensions/provision-all", async (req, res) => {
    const extensions = await Extension.findAll({ order: [["number", "ASC"]] });
    const secret = req.body?.sipPassword || "1234";

    for (const extension of extensions) {
      await upsertSipExtension({ number: extension.number, secret });
    }

    return res.json({
      message: "Todos os ramais foram reprovisionados no Asterisk",
      total: extensions.length,
    });
  });

  router.post("/calls/test-between-extensions", async (req, res) => {
    const { sourceExtensionId, targetExtensionId } = req.body || {};

    if (!sourceExtensionId || !targetExtensionId) {
      return res.status(400).json({
        message: "sourceExtensionId e targetExtensionId são obrigatórios",
      });
    }

    const [sourceExtension, targetExtension] = await Promise.all([
      Extension.findByPk(sourceExtensionId),
      Extension.findByPk(targetExtensionId),
    ]);

    if (!sourceExtension || !targetExtension) {
      return res.status(404).json({
        message: "Ramal de origem ou destino não encontrado",
      });
    }

    try {
      const action = await originateCall(
        sourceExtension.number,
        targetExtension.number,
      );

      io.emit("call:update", {
        type: "test_extension_call",
        sourceExtension: sourceExtension.number,
        targetExtension: targetExtension.number,
      });

      return res.status(201).json({
        message:
          "Ligação de teste iniciada. A gravação será salva automaticamente pelo dialplan local-ramais.",
        sourceExtension: sourceExtension.number,
        targetExtension: targetExtension.number,
        action,
      });
    } catch (error) {
      return res.status(500).json({
        message: "Falha ao iniciar ligação de teste entre ramais",
        detail: error.message,
      });
    }
  });

  router.get("/voip-lines", async (_, res) => {
    const lines = await VoipLine.findAll({ order: [["name", "ASC"]] });
    res.json(lines);
  });

  router.post("/voip-lines", async (req, res) => {
    const {
      name,
      username,
      secret,
      host,
      port = 5060,
      context = "default",
      transport = "transport-udp",
    } = req.body;

    const line = await VoipLine.create({
      name,
      username,
      secret,
      host,
      port,
      context,
      transport,
    });

    try {
      await upsertSipVoipLine({
        name,
        username,
        secret,
        host,
        port,
        context,
      });
    } catch (error) {
      return res.status(201).json({
        ...line.toJSON(),
        warning:
          "Linha VoIP salva no banco, mas falhou provisionamento no Asterisk. Verifique AMI e arquivo sip_custom.conf.",
        detail: error.message,
      });
    }

    return res.status(201).json(line);
  });

  router.patch("/voip-lines/:id", async (req, res) => {
    const line = await VoipLine.findByPk(req.params.id);
    if (!line) {
      return res.status(404).json({ message: "Linha VoIP não encontrada" });
    }

    const nextValues = {
      name:
        req.body?.name !== undefined ? String(req.body.name).trim() : line.name,
      username:
        req.body?.username !== undefined
          ? String(req.body.username).trim()
          : line.username,
      secret:
        req.body?.secret !== undefined
          ? String(req.body.secret).trim()
          : line.secret,
      host:
        req.body?.host !== undefined ? String(req.body.host).trim() : line.host,
      port: req.body?.port !== undefined ? Number(req.body.port) : line.port,
      context:
        req.body?.context !== undefined
          ? String(req.body.context).trim()
          : line.context,
      transport:
        req.body?.transport !== undefined
          ? String(req.body.transport).trim()
          : line.transport,
    };

    if (
      !nextValues.name ||
      !nextValues.username ||
      !nextValues.secret ||
      !nextValues.host
    ) {
      return res
        .status(400)
        .json({ message: "Preencha nome, username, secret e host" });
    }

    if (!Number.isInteger(nextValues.port) || nextValues.port <= 0) {
      return res.status(400).json({ message: "Porta inválida" });
    }

    const oldName = line.name;
    await line.update(nextValues);

    if (oldName !== nextValues.name) {
      await removeVoipLineProvision({ name: oldName });
    }

    await upsertSipVoipLine({
      name: line.name,
      username: line.username,
      secret: line.secret,
      host: line.host,
      port: line.port,
      context: line.context,
    });

    return res.json(line);
  });

  router.delete("/voip-lines/:id", async (req, res) => {
    const line = await VoipLine.findByPk(req.params.id);
    if (!line) {
      return res.status(404).json({ message: "Linha VoIP não encontrada" });
    }

    const lineName = line.name;
    await line.destroy();
    await removeVoipLineProvision({ name: lineName });

    return res.json({ message: "Linha VoIP deletada com sucesso" });
  });

  router.post("/voip-lines/:id/provision", async (req, res) => {
    const line = await VoipLine.findByPk(req.params.id);
    if (!line) {
      return res.status(404).json({ message: "Linha VoIP não encontrada" });
    }

    await upsertSipVoipLine({
      name: line.name,
      username: req.body?.username || line.username,
      secret: req.body?.secret || line.secret,
      host: req.body?.host || line.host,
      port: req.body?.port || line.port,
      context: req.body?.context || line.context,
    });

    return res.json({ message: "Linha VoIP provisionada no Asterisk" });
  });

  router.get("/campaigns", async (_, res) => {
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

  router.post("/campaigns", async (req, res) => {
    const { name, intervalSeconds = 15 } = req.body;
    const campaign = await Campaign.create({ name, intervalSeconds });
    res.status(201).json(campaign);
  });

  router.patch("/campaigns/:id", async (req, res) => {
    const campaign = await Campaign.findByPk(req.params.id);
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

  router.delete("/campaigns/:id", async (req, res) => {
    const campaign = await Campaign.findByPk(req.params.id);
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

  router.post("/campaigns/:id/assign-extensions", async (req, res) => {
    const { extensionIds = [] } = req.body;
    const campaign = await Campaign.findByPk(req.params.id);
    if (!campaign) {
      return res.status(404).json({ message: "Campanha não encontrada" });
    }

    const extensions = await Extension.findAll({ where: { id: extensionIds } });
    await campaign.setExtensions(extensions);
    return res.json({ message: "Ramais vinculados com sucesso" });
  });

  router.post("/campaigns/:id/assign-voip-lines", async (req, res) => {
    const { voipLineIds = [] } = req.body;
    const campaign = await Campaign.findByPk(req.params.id);
    if (!campaign) {
      return res.status(404).json({ message: "Campanha não encontrada" });
    }

    const lines = await VoipLine.findAll({ where: { id: voipLineIds } });
    await campaign.setVoipLines(lines);
    return res.json({ message: "Linhas VoIP vinculadas com sucesso" });
  });

  router.post(
    "/campaigns/:id/upload-phones",
    upload.single("file"),
    async (req, res) => {
      const campaign = await Campaign.findByPk(req.params.id);
      if (!campaign) {
        return res.status(404).json({ message: "Campanha não encontrada" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "Arquivo não enviado" });
      }

      const csv = req.file.buffer.toString("utf-8");
      const records = parse(csv, { columns: true, skip_empty_lines: true });

      const contacts = records
        .map((row) => row.phoneNumber || row.phone || row.numero)
        .filter(Boolean)
        .map((phoneNumber) => ({
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

  router.post("/campaigns/:id/start", async (req, res) => {
    const campaign = await Campaign.findByPk(req.params.id);
    if (!campaign) {
      return res.status(404).json({ message: "Campanha não encontrada" });
    }

    runCampaign(campaign.id, io);
    return res.json({ message: "Campanha iniciada" });
  });

  router.post("/ura/reverse-call", async (req, res) => {
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

    const uraRef = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

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

    const pendingLog = await UraLog.create({
      uraRef,
      campaignId,
      extensionId,
      phoneNumber: String(phoneNumber),
      selectedOption: null,
      audioPath: null,
      result: "pending",
    });

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
    } catch (error) {
      pendingLog.result = "erro_origem";
      await pendingLog.save();

      return res.status(500).json({
        message: "Falha ao iniciar URA reversa",
        detail: error.message,
      });
    }
  });

  router.post("/ura/logs", async (req, res) => {
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

  router.post("/recordings", async (req, res) => {
    const {
      campaignId = null,
      extensionId = null,
      callLogId = null,
      filePath,
      durationSeconds = 0,
      callUniqueId = null,
    } = req.body;

    if (!filePath) {
      return res.status(400).json({ message: "filePath é obrigatório" });
    }

    const recording = await CallRecording.create({
      campaignId,
      extensionId,
      callLogId,
      filePath,
      durationSeconds: Number(durationSeconds) || 0,
      callUniqueId,
    });

    return res.status(201).json(recording);
  });

  router.delete("/recordings/:id", async (req, res) => {
    const recording = await CallRecording.findByPk(req.params.id);
    if (!recording) {
      return res.status(404).json({ message: "Gravação não encontrada" });
    }

    const baseDir = path.resolve(asteriskRecordingsDir);
    const filePath = recording.filePath
      ? path.resolve(recording.filePath)
      : null;

    if (filePath && filePath.startsWith(baseDir)) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        return res.status(500).json({
          message: "Falha ao remover arquivo de gravação",
          detail: error.message,
        });
      }
    }

    await recording.destroy();
    return res.json({ message: "Gravação removida com sucesso" });
  });

  router.get("/reports/summary", async (_, res) => {
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

  router.get("/reports/calls", async (_, res) => {
    const calls = await CallLog.findAll({
      include: [
        { model: Campaign, attributes: ["id", "name"] },
        { model: Extension, attributes: ["id", "number", "name"] },
        { model: VoipLine, attributes: ["id", "name", "host", "port"] },
      ],
      order: [["createdAt", "DESC"]],
    });
    res.json(calls);
  });

  router.get("/reports/calls-by-extension", async (_, res) => {
    const calls = await CallLog.findAll({
      include: [{ model: Extension, attributes: ["id", "number", "name"] }],
      order: [["createdAt", "DESC"]],
    });

    res.json(calls);
  });

  router.get("/reports/calls-by-campaign", async (_, res) => {
    const calls = await CallLog.findAll({
      include: [{ model: Campaign, attributes: ["id", "name"] }],
      order: [["createdAt", "DESC"]],
    });

    res.json(calls);
  });

  router.get("/reports/ura-logs", async (_, res) => {
    const logs = await UraLog.findAll({
      include: [
        { model: Campaign, attributes: ["id", "name"] },
        { model: Extension, attributes: ["id", "number", "name"] },
      ],
      order: [["createdAt", "DESC"]],
    });

    res.json(logs);
  });

  router.get("/reports/recordings", async (_, res) => {
    const recordings = await CallRecording.findAll({
      include: [
        { model: Campaign, attributes: ["id", "name"] },
        { model: Extension, attributes: ["id", "number", "name"] },
        { model: CallLog, attributes: ["id", "phoneNumber", "result"] },
      ],
      order: [["createdAt", "DESC"]],
    });

    res.json(
      recordings.map((recording) => ({
        ...recording.toJSON(),
        webPath: toRecordingWebPath(recording.filePath),
      })),
    );
  });

  router.get("/reports/ura-reverse", async (_, res) => {
    const campaigns = await UraReverseCampaign.findAll({
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
    });

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

module.exports = { createRoutes };
