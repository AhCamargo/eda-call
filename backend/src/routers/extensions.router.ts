import express, { Request, Response } from "express";
import { randomBytes } from "crypto";
import { Server } from "socket.io";
import config from "../config";
import { Extension, VoipLine } from "../db";
import { upsertSipExtension, removeExtensionProvision } from "../services/asteriskProvisioning";
import { originateCall } from "../ami";
import { logStatusChange } from "../services/agentStatusLogger";
import { verifyToken } from "../middleware/auth";
import {
  normalizeExtensionNumber,
  isValidExtensionNumber,
  withExtensionSector,
} from "../utils/routeHelpers";

export const createExtensionsRouter = (io: Server) => {
  const router = express.Router();

  router.get("/extensions", async (req: Request, res: Response) => {
    const extensions = (await Extension.findAll({
      include: [
        { model: VoipLine, attributes: ["id", "name", "host", "port"] },
      ],
      order: [["number", "ASC"]],
    })) as any[];
    const isAdmin = (req as any).user?.role === "admin";
    res.json(
      extensions.map((e) => ({
        ...withExtensionSector(e),
        ...(isAdmin ? { sipPassword: e.password } : {}),
        voipLineId: e.voipLineId || null,
        VoipLine: e.VoipLine
          ? { id: e.VoipLine.id, name: e.VoipLine.name }
          : null,
      })),
    );
  });

  // Função utilitária para gerar senha aleatória segura
  function generateRandomPassword(length = 12) {
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
    const bytes = randomBytes(length);
    return Array.from(bytes, (b) => chars[b % chars.length]).join("");
  }

  router.post("/extensions", async (req: Request, res: Response) => {
    const { number, name, sipPassword, voipLineId } = req.body;
    const normalizedNumber = normalizeExtensionNumber(number);

    if (!isValidExtensionNumber(normalizedNumber)) {
      return res.status(400).json({
        message:
          "Formato de ramal inválido. Use apenas números (ex: 1000) ou padrão setorizado Cx-xxxx (ex: C1-1000).",
      });
    }

    // Gera senha aleatória se não for fornecida
    const password = sipPassword || generateRandomPassword();

    // Salva ramal com senha persistida
    let extension: any;
    try {
      extension = await Extension.create({
        number: normalizedNumber,
        name,
        password,
        status: "offline",
        voipLineId: voipLineId ? Number(voipLineId) : null,
      });
    } catch (error: any) {
      if (error.name === "SequelizeUniqueConstraintError") {
        return res.status(409).json({ message: "Já existe um ramal com esse número." });
      }
      throw error;
    }

    try {
      // determine context from associated VoIP line (if provided)
      let context = "default";
      if (voipLineId) {
        const line = (await VoipLine.findByPk(Number(voipLineId))) as any;
        if (line && line.context) context = line.context;
      }

      await Promise.all([
        upsertSipExtension({
          number: normalizedNumber,
          secret: password,
          context,
          voipLineName: voipLineId
            ? ((await VoipLine.findByPk(Number(voipLineId))) as any)?.name
            : null,
        }),
      ]);
    } catch (error: any) {
      return res.status(201).json({
        ...withExtensionSector(extension),
        sipPassword: password,
        warning:
          "Ramal salvo no banco, mas falhou provisionamento no Asterisk. Verifique AMI e arquivo sip_custom.conf.",
        detail: error.message,
      });
    }

    io.emit("dashboard:update");
    // Retorna ramal e senha ao frontend
    res
      .status(201)
      .json({ ...withExtensionSector(extension), sipPassword: password });
  });

  router.patch(
    "/extensions/:id/status",
    async (req: Request, res: Response) => {
      const { status } = req.body;
      const extension = (await Extension.findByPk(
        req.params.id as string,
      )) as any;
      if (!extension) {
        return res.status(404).json({ message: "Ramal não encontrado" });
      }

      extension.status = status;
      if (status !== "paused") {
        extension.pauseReason = null;
      }
      await extension.save();
      await logStatusChange(extension.id, extension.number, extension.name, status, extension.pauseReason ?? null).catch(() => {});
      io.emit("dashboard:update");
      return res.json(withExtensionSector(extension));
    },
  );

  router.patch("/extensions/:id/pause", async (req: Request, res: Response) => {
    const extension = (await Extension.findByPk(
      req.params.id as string,
    )) as any;
    if (!extension) {
      return res.status(404).json({ message: "Ramal não encontrado" });
    }

    const reason = String(req.body?.reason || "").trim();

    if (!reason) {
      return res.status(400).json({ message: "Motivo de pausa é obrigatório" });
    }

    extension.status = "paused";
    extension.pauseReason = reason;
    await extension.save();
    await logStatusChange(extension.id, extension.number, extension.name, "paused", reason).catch(() => {});

    io.emit("dashboard:update");
    return res.json(withExtensionSector(extension));
  });

  router.patch(
    "/extensions/:id/resume",
    async (req: Request, res: Response) => {
      const extension = (await Extension.findByPk(
        req.params.id as string,
      )) as any;
      if (!extension) {
        return res.status(404).json({ message: "Ramal não encontrado" });
      }

      extension.status = "online";
      extension.pauseReason = null;
      await extension.save();
      await logStatusChange(extension.id, extension.number, extension.name, "online").catch(() => {});

      io.emit("dashboard:update");
      return res.json(withExtensionSector(extension));
    },
  );

  // ── Treinamento: coloca ramal em modo training ──────────────────────────────
  router.patch(
    "/extensions/:id/training",
    verifyToken,
    async (req: Request, res: Response) => {
      const extension = (await Extension.findByPk(req.params.id as string)) as any;
      if (!extension) return res.status(404).json({ message: "Ramal não encontrado" });

      const enable = req.body?.enable !== false; // default: ativar
      extension.status = enable ? "training" : "online";
      extension.pauseReason = null;
      await extension.save();
      await logStatusChange(extension.id, extension.number, extension.name, extension.status).catch(() => {});

      io.emit("dashboard:update");
      return res.json(withExtensionSector(extension));
    },
  );

  router.patch("/extensions/:id", async (req: Request, res: Response) => {
    const extension = (await Extension.findByPk(
      req.params.id as string,
    )) as any;
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

    // Atualiza senha se fornecida
    let password = extension.password;
    if (req.body?.sipPassword) {
      password = req.body.sipPassword;
      extension.password = password;
    }

    // Atualiza a linha VoIP associada se fornecida
    if (req.body?.voipLineId !== undefined) {
      extension.voipLineId = req.body.voipLineId
        ? Number(req.body.voipLineId)
        : null;
    }

    await extension.save();

    if (oldNumber !== nextNumber) {
      await removeExtensionProvision({ number: oldNumber });
    }

    // determine context from associated VoIP line (if any)
    let context = "default";
    if (extension.voipLineId) {
      const line = (await VoipLine.findByPk(
        Number(extension.voipLineId),
      )) as any;
      if (line && line.context) context = line.context;
    }

    await Promise.all([
      upsertSipExtension({
        number: nextNumber,
        secret: password,
        context,
        voipLineName: extension.voipLineId
          ? ((await VoipLine.findByPk(Number(extension.voipLineId))) as any)
              ?.name
          : null,
      }),
    ]);

    io.emit("dashboard:update");
    return res.json({
      ...withExtensionSector(extension),
      sipPassword: password,
    });
  });

  router.delete("/extensions/:id", async (req: Request, res: Response) => {
    const extension = (await Extension.findByPk(
      req.params.id as string,
    )) as any;
    if (!extension) {
      return res.status(404).json({ message: "Ramal não encontrado" });
    }

    const number = extension.number;
    await extension.destroy();
    await removeExtensionProvision({ number });

    io.emit("dashboard:update");
    return res.json({ message: "Ramal deletado com sucesso" });
  });

  router.get(
    "/extensions/:id/webrtc-credentials",
    async (req: Request, res: Response) => {
      const extension = (await Extension.findByPk(
        req.params.id as string,
      )) as any;
      if (!extension) {
        return res.status(404).json({ message: "Ramal não encontrado" });
      }
      return res.json({
        extensionNumber: extension.number,
        password: extension.password,
        wsServer: config.asteriskWsUrl,
      });
    },
  );

  router.post(
    "/extensions/:id/provision",
    async (req: Request, res: Response) => {
      const extension = (await Extension.findByPk(
        req.params.id as string,
      )) as any;
      if (!extension) {
        return res.status(404).json({ message: "Ramal não encontrado" });
      }

      // Usa a senha persistida, a menos que uma nova seja enviada
      let password = extension.password;
      if (req.body?.sipPassword) {
        password = req.body.sipPassword;
        extension.password = password;
        await extension.save();
      }

      // determine context: prefer provided voipLineId in body, fallback to stored association
      let context = "default";
      const voipLineIdFromBody = req.body?.voipLineId;
      const voipLineToUse =
        voipLineIdFromBody !== undefined
          ? voipLineIdFromBody
          : extension.voipLineId;
      if (voipLineToUse) {
        const line = (await VoipLine.findByPk(Number(voipLineToUse))) as any;
        if (line && line.context) context = line.context;
      }

      await Promise.all([
        upsertSipExtension({
          number: extension.number,
          secret: password,
          context,
          voipLineName: voipLineToUse
            ? ((await VoipLine.findByPk(Number(voipLineToUse))) as any)?.name
            : null,
        }),
      ]);

      return res.json({ message: "Ramal provisionado no Asterisk", password });
    },
  );

  router.post(
    "/extensions/provision-all",
    async (req: Request, res: Response) => {
      const extensions = (await Extension.findAll({
        order: [["number", "ASC"]],
      })) as any[];

      for (const extension of extensions) {
        await Promise.all([
          upsertSipExtension({
            number: extension.number,
            secret: extension.password,
          }),
        ]);
      }

      return res.json({
        message: "Todos os ramais foram reprovisionados no Asterisk",
        total: extensions.length,
      });
    },
  );

  router.post(
    "/calls/test-between-extensions",
    async (req: Request, res: Response) => {
      const { sourceExtensionId, targetExtensionId } = req.body || {};

      if (!sourceExtensionId || !targetExtensionId) {
        return res.status(400).json({
          message: "sourceExtensionId e targetExtensionId são obrigatórios",
        });
      }

      const [sourceExtension, targetExtension] = (await Promise.all([
        Extension.findByPk(sourceExtensionId),
        Extension.findByPk(targetExtensionId),
      ])) as any[];

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
      } catch (error: any) {
        return res.status(500).json({
          message: "Falha ao iniciar ligação de teste entre ramais",
          detail: error.message,
        });
      }
    },
  );

  return router;
};
