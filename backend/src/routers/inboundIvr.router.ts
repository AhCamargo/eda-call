import express, { Request, Response } from "express";
import { VoipLine, InboundIvr, InboundIvrOption } from "../db";
import {
  upsertSipVoipLine,
  upsertInboundIvrDialplan,
  removeInboundIvrDialplan,
  upsertTrunkInboundRoute,
  removeTrunkInboundRoute,
} from "../services/asteriskProvisioning";

export const createInboundIvrRouter = () => {
  const router = express.Router();

  // ── Central Telefônica (URA Receptiva) ─────────────────────────────────

  // Garante que a linha VoIP tenha um inboundContext único (nunca "default").
  // Caso não tenha, gera um a partir do contextName do IVR e re-provisiona o peer SIP.
  const ensureTrunkInboundContext = async (
    line: any,
    ivrContextName: string,
  ): Promise<string> => {
    if (line.inboundContext && line.inboundContext !== "default") {
      return line.inboundContext;
    }
    const generated = `inbound-${ivrContextName}`;
    line.inboundContext = generated;
    await line.save();
    await upsertSipVoipLine({
      name: line.name,
      username: line.username,
      secret: line.secret,
      host: line.host,
      port: line.port,
      context: line.context,
      inboundContext: generated,
      type: line.type,
      dtmfmode: line.dtmfmode,
      fromdomain: line.fromdomain,
      codecs: line.codecs,
      callLimit: line.callLimit,
      insecure: line.insecure,
    });
    return generated;
  };

  router.get("/inbound-ivr", async (_req: Request, res: Response) => {
    const ivrs = (await InboundIvr.findAll({
      include: [{ model: InboundIvrOption, as: "options" }],
      order: [["createdAt", "ASC"]],
    })) as any[];
    return res.json(ivrs.map((i) => i.toJSON()));
  });

  router.get("/inbound-ivr/:id", async (req: Request, res: Response) => {
    const ivr = (await InboundIvr.findByPk(req.params.id as string, {
      include: [{ model: InboundIvrOption, as: "options" }],
    })) as any;
    if (!ivr) return res.status(404).json({ message: "IVR não encontrado" });
    return res.json(ivr.toJSON());
  });

  router.post("/inbound-ivr", async (req: Request, res: Response) => {
    const {
      name,
      contextName,
      voipLineId = null,
      audioFile = null,
      digitTimeoutSeconds = 5,
      maxInvalidAttempts = 3,
      fallbackExtension = null,
      fallbackLabel = "Transbordo",
      dialTechnology = "SIP",
      options = [],
    } = req.body;

    if (!name || !contextName) {
      return res.status(400).json({ message: "name e contextName são obrigatórios" });
    }

    const existing = await InboundIvr.findOne({
      where: { contextName: String(contextName).trim() },
    });
    if (existing)
      return res.status(409).json({
        message: `Já existe uma central com o contextName '${contextName}'. Escolha um nome de contexto diferente.`,
      });

    const ivr = (await InboundIvr.create({
      name: String(name).trim(),
      contextName: String(contextName).trim(),
      voipLineId: voipLineId || null,
      audioFile: audioFile || null,
      digitTimeoutSeconds: Number(digitTimeoutSeconds),
      maxInvalidAttempts: Number(maxInvalidAttempts),
      fallbackExtension: fallbackExtension || null,
      fallbackLabel: fallbackLabel || "Transbordo",
      dialTechnology: dialTechnology || "SIP",
    })) as any;

    const createdOptions: any[] = [];
    for (const opt of options as any[]) {
      const o = await InboundIvrOption.create({
        ivrId: ivr.id,
        keyDigit: String(opt.keyDigit).trim(),
        label: opt.label || null,
        actionType: opt.actionType || "transfer_extension",
        targetExtension: opt.targetExtension || null,
      });
      createdOptions.push((o as any).toJSON());
    }

    await upsertInboundIvrDialplan({
      contextName: ivr.contextName,
      name: ivr.name,
      audioFile: ivr.audioFile,
      digitTimeoutSeconds: ivr.digitTimeoutSeconds,
      maxInvalidAttempts: ivr.maxInvalidAttempts,
      fallbackExtension: ivr.fallbackExtension,
      fallbackLabel: ivr.fallbackLabel,
      dialTechnology: ivr.dialTechnology,
      options: createdOptions,
    });

    if (ivr.voipLineId) {
      const line = (await VoipLine.findByPk(Number(ivr.voipLineId))) as any;
      if (line) {
        const trunkCtx = await ensureTrunkInboundContext(line, ivr.contextName);
        await upsertTrunkInboundRoute({ trunkContext: trunkCtx, ivrContext: ivr.contextName });
      }
    }

    return res.status(201).json({ ...ivr.toJSON(), options: createdOptions });
  });

  router.put("/inbound-ivr/:id", async (req: Request, res: Response) => {
    const ivr = (await InboundIvr.findByPk(req.params.id as string, {
      include: [{ model: InboundIvrOption, as: "options" }],
    })) as any;
    if (!ivr) return res.status(404).json({ message: "IVR não encontrado" });

    const {
      name,
      contextName,
      voipLineId,
      audioFile,
      digitTimeoutSeconds,
      maxInvalidAttempts,
      fallbackExtension,
      fallbackLabel,
      dialTechnology,
      options,
      scheduleEnabled,
      scheduleJson,
      closedAudioFile,
    } = req.body;

    const oldContext = ivr.contextName;

    if (name !== undefined) ivr.name = String(name).trim();
    if (contextName !== undefined) ivr.contextName = String(contextName).trim();
    if (voipLineId !== undefined) ivr.voipLineId = voipLineId || null;
    if (audioFile !== undefined) ivr.audioFile = audioFile || null;
    if (digitTimeoutSeconds !== undefined) ivr.digitTimeoutSeconds = Number(digitTimeoutSeconds);
    if (maxInvalidAttempts !== undefined) ivr.maxInvalidAttempts = Number(maxInvalidAttempts);
    if (fallbackExtension !== undefined) ivr.fallbackExtension = fallbackExtension || null;
    if (fallbackLabel !== undefined) ivr.fallbackLabel = fallbackLabel || "Transbordo";
    if (dialTechnology !== undefined) ivr.dialTechnology = dialTechnology;
    if (scheduleEnabled !== undefined) ivr.scheduleEnabled = Boolean(scheduleEnabled);
    if (scheduleJson !== undefined) ivr.scheduleJson = scheduleJson || null;
    if (closedAudioFile !== undefined) ivr.closedAudioFile = closedAudioFile || null;
    await ivr.save();

    let updatedOptions = ivr.options?.map((o: any) => o.toJSON()) ?? [];
    if (Array.isArray(options)) {
      await InboundIvrOption.destroy({ where: { ivrId: ivr.id } });
      updatedOptions = [];
      for (const opt of options) {
        const o = await InboundIvrOption.create({
          ivrId: ivr.id,
          keyDigit: String(opt.keyDigit).trim(),
          label: opt.label || null,
          actionType: opt.actionType || "transfer_extension",
          targetExtension: opt.targetExtension || null,
        });
        updatedOptions.push((o as any).toJSON());
      }
    }

    if (oldContext !== ivr.contextName) {
      await removeInboundIvrDialplan({ contextName: oldContext });
    }
    await upsertInboundIvrDialplan({
      contextName: ivr.contextName,
      name: ivr.name,
      audioFile: ivr.audioFile,
      digitTimeoutSeconds: ivr.digitTimeoutSeconds,
      maxInvalidAttempts: ivr.maxInvalidAttempts,
      fallbackExtension: ivr.fallbackExtension,
      fallbackLabel: ivr.fallbackLabel,
      dialTechnology: ivr.dialTechnology,
      options: updatedOptions,
      scheduleEnabled: ivr.scheduleEnabled,
      scheduleJson: ivr.scheduleJson,
      closedAudioFile: ivr.closedAudioFile,
    });

    if (ivr.voipLineId) {
      const line = (await VoipLine.findByPk(Number(ivr.voipLineId))) as any;
      if (line) {
        const trunkCtx = await ensureTrunkInboundContext(line, ivr.contextName);
        await upsertTrunkInboundRoute({ trunkContext: trunkCtx, ivrContext: ivr.contextName });
      }
    }

    return res.json({ ...ivr.toJSON(), options: updatedOptions });
  });

  router.delete("/inbound-ivr/:id", async (req: Request, res: Response) => {
    const ivr = (await InboundIvr.findByPk(req.params.id as string)) as any;
    if (!ivr) return res.status(404).json({ message: "IVR não encontrado" });

    if (ivr.voipLineId) {
      const line = (await VoipLine.findByPk(Number(ivr.voipLineId))) as any;
      if (line?.inboundContext && line.inboundContext !== "default") {
        await removeTrunkInboundRoute({ trunkContext: line.inboundContext });
        // Limpa o inboundContext da linha para que possa ser reutilizado
        line.inboundContext = null;
        await line.save();
        await upsertSipVoipLine({
          name: line.name, username: line.username, secret: line.secret,
          host: line.host, port: line.port, context: line.context,
          inboundContext: null, type: line.type, dtmfmode: line.dtmfmode,
          fromdomain: line.fromdomain, codecs: line.codecs,
          callLimit: line.callLimit, insecure: line.insecure,
        });
      }
    }
    await removeInboundIvrDialplan({ contextName: ivr.contextName });
    await InboundIvrOption.destroy({ where: { ivrId: ivr.id } });
    await ivr.destroy();
    return res.json({ message: "IVR removido com sucesso" });
  });

  return router;
};
