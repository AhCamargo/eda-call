import express, { Request, Response } from "express";
import { Server } from "socket.io";
import { verifyToken, requireSupervisor } from "../middleware/auth";
import { Extension, VoipLine } from "../db";
import { getAmiClient } from "../ami";
import { logStatusChange } from "../services/agentStatusLogger";

export const createSupervisorRouter = (io: Server) => {
  const router = express.Router();

  // Endpoints do Supervisor
  router.get(
    "/supervisor/agents",
    verifyToken,
    requireSupervisor,
    async (req: Request, res: Response) => {
      const agents = (await Extension.findAll({
        include: [{ model: VoipLine, as: "VoipLine", attributes: ["name"] }],
        order: [["name", "ASC"]],
      })) as any[];
      return res.json(
        agents.map((a) => ({
          id: a.id,
          number: a.number,
          name: a.name,
          status: a.status,
          pauseReason: a.pauseReason,
          voipLine: a.VoipLine ? a.VoipLine.name : null,
          updatedAt: a.updatedAt,
        })),
      );
    },
  );

  router.post(
    "/supervisor/agents/:id/force-pause",
    verifyToken,
    requireSupervisor,
    async (req: Request, res: Response) => {
      const agent = (await Extension.findByPk(req.params.id as string)) as any;
      if (!agent)
        return res.status(404).json({ message: "Ramal não encontrado" });
      agent.status = "paused";
      agent.pauseReason = req.body.reason || "Pausa administrativa";
      await agent.save();
      await logStatusChange(agent.id, agent.number, agent.name, "paused", agent.pauseReason).catch(() => {});
      io.emit("dashboard:update");
      return res.json({ ok: true });
    },
  );

  router.post(
    "/supervisor/agents/:id/spy",
    verifyToken,
    requireSupervisor,
    async (req: Request, res: Response) => {
      const agent = (await Extension.findByPk(req.params.id as string)) as any;
      if (!agent) return res.status(404).json({ message: "Ramal não encontrado" });

      const { supervisorExtension, mode } = req.body;
      if (!supervisorExtension) return res.status(400).json({ message: "Informe o ramal do supervisor" });

      const modeMap: Record<string, string> = {
        listen:  "q",   // só escuta
        whisper: "qw",  // fala só com o agente
        barge:   "B",   // todos ouvem todos
      };
      const spyMode = modeMap[mode] ?? "q";

      try {
        const ami = getAmiClient();
        await new Promise<void>((resolve, reject) => {
          ami.action(
            {
              Action:    "Originate",
              Channel:   `SIP/${supervisorExtension}`,
              Context:   "chanspy-supervisor",
              Exten:     agent.number,
              Priority:  1,
              CallerID:  "Supervisor",
              Timeout:   30000,
              Variable:  `SPY_MODE=${spyMode}`,
              Async:     "true",
            },
            (err: any) => (err ? reject(err) : resolve()),
          );
        });
        return res.json({ ok: true });
      } catch (err: any) {
        return res.status(500).json({ message: "Erro ao originar chamada de monitoramento", detail: String(err) });
      }
    },
  );

  router.post(
    "/supervisor/agents/:id/resume",
    verifyToken,
    requireSupervisor,
    async (req: Request, res: Response) => {
      const agent = (await Extension.findByPk(req.params.id as string)) as any;
      if (!agent)
        return res.status(404).json({ message: "Ramal não encontrado" });
      agent.status = "online";
      agent.pauseReason = null;
      await agent.save();
      await logStatusChange(agent.id, agent.number, agent.name, "online").catch(() => {});
      io.emit("dashboard:update");
      return res.json({ ok: true });
    },
  );

  return router;
};
