import express, { Request, Response } from "express";
import { VoipLine } from "../db";
import { upsertSipVoipLine, removeVoipLineProvision } from "../services/asteriskProvisioning";

export const createVoipLinesRouter = () => {
  const router = express.Router();

  router.get("/voip-lines", async (_, res: Response) => {
    const lines = await VoipLine.findAll({ order: [["name", "ASC"]] });
    res.json(lines);
  });

  router.post("/voip-lines", async (req: Request, res: Response) => {
    const {
      name,
      username,
      secret,
      host,
      port = 5060,
      context = "default",
      inboundContext = null,
      transport = "transport-udp",
      type = "peer",
      dtmfmode = "rfc2833",
      fromdomain = null,
      codecs = "ulaw,alaw",
      callLimit = 0,
      insecure = "invite,port",
      register = false,
    } = req.body;

    let line: any;
    try {
      line = await VoipLine.create({
        name,
        username,
        secret,
        host,
        port,
        context,
        inboundContext,
        transport,
        type,
        dtmfmode,
        fromdomain,
        codecs,
        callLimit,
        insecure,
        register,
      });
    } catch (error: any) {
      if (error.name === "SequelizeUniqueConstraintError") {
        return res.status(409).json({ message: "Já existe uma linha VoIP com esse nome." });
      }
      throw error;
    }

    try {
      await upsertSipVoipLine({
        name,
        username,
        secret,
        host,
        port,
        context,
        inboundContext,
        type,
        dtmfmode,
        fromdomain,
        codecs,
        callLimit,
        insecure,
        register,
      });
    } catch (error: any) {
      return res.status(201).json({
        ...(line as any).toJSON(),
        warning:
          "Linha VoIP salva no banco, mas falhou provisionamento no Asterisk. Verifique AMI e arquivo sip_custom.conf.",
        detail: error.message,
      });
    }

    return res.status(201).json(line);
  });

  router.patch("/voip-lines/:id", async (req: Request, res: Response) => {
    const line = (await VoipLine.findByPk(req.params.id as string)) as any;
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
        req.body?.secret !== undefined && String(req.body.secret).trim() !== ""
          ? String(req.body.secret).trim()
          : line.secret,
      host:
        req.body?.host !== undefined ? String(req.body.host).trim() : line.host,
      port: req.body?.port !== undefined ? Number(req.body.port) : line.port,
      context:
        req.body?.context !== undefined
          ? String(req.body.context).trim()
          : line.context,
      inboundContext:
        req.body?.inboundContext !== undefined
          ? req.body.inboundContext || null
          : line.inboundContext,
      transport:
        req.body?.transport !== undefined
          ? String(req.body.transport).trim()
          : line.transport,
      type:
        req.body?.type !== undefined
          ? String(req.body.type).trim()
          : line.type || "peer",
      dtmfmode:
        req.body?.dtmfmode !== undefined
          ? String(req.body.dtmfmode).trim()
          : line.dtmfmode || "rfc2833",
      fromdomain:
        req.body?.fromdomain !== undefined
          ? req.body.fromdomain || null
          : line.fromdomain,
      codecs:
        req.body?.codecs !== undefined
          ? String(req.body.codecs).trim()
          : line.codecs || "ulaw,alaw",
      callLimit:
        req.body?.callLimit !== undefined
          ? Number(req.body.callLimit)
          : line.callLimit || 0,
      insecure:
        req.body?.insecure !== undefined
          ? req.body.insecure || null
          : line.insecure,
      register:
        req.body?.register !== undefined
          ? Boolean(req.body.register)
          : Boolean(line.register),
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
      inboundContext: line.inboundContext,
      type: line.type,
      dtmfmode: line.dtmfmode,
      fromdomain: line.fromdomain,
      codecs: line.codecs,
      callLimit: line.callLimit,
      insecure: line.insecure,
      register: line.register,
    });

    return res.json(line);
  });

  router.delete("/voip-lines/:id", async (req: Request, res: Response) => {
    const line = (await VoipLine.findByPk(req.params.id as string)) as any;
    if (!line) {
      return res.status(404).json({ message: "Linha VoIP não encontrada" });
    }

    const lineName = line.name;
    await line.destroy();
    await removeVoipLineProvision({ name: lineName });

    return res.json({ message: "Linha VoIP deletada com sucesso" });
  });

  router.post(
    "/voip-lines/:id/provision",
    async (req: Request, res: Response) => {
      const line = (await VoipLine.findByPk(req.params.id as string)) as any;
      if (!line) {
        return res.status(404).json({ message: "Linha VoIP não encontrada" });
      }

      await upsertSipVoipLine({
        name: line.name,
        username: line.username,
        secret: line.secret,
        host: line.host,
        port: line.port,
        context: line.context,
        inboundContext: line.inboundContext,
        type: line.type,
        dtmfmode: line.dtmfmode,
        fromdomain: line.fromdomain,
        codecs: line.codecs,
        callLimit: line.callLimit,
        insecure: line.insecure,
        register: line.register,
      });

      return res.json({ message: "Linha VoIP provisionada no Asterisk" });
    },
  );

  return router;
};
