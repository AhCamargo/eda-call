import express, { Response } from "express";
import { Op } from "sequelize";
import {
  sequelize,
  Extension,
  Campaign,
  CampaignContact,
  CallLog,
  AsteriskQueue,
  UraReverseCampaign,
  UraReverseContact,
} from "../db";
import { runCommand } from "../ami";
import { requireSupervisor } from "../middleware/auth";
import { normalizeCommandOutput } from "../services/amiStatusMonitor";
import { parseQueueShow, LiveQueue } from "../utils/queueShow";

const AMI_TIMEOUT_MS = 2000;

// Indicadores de hoje a partir do CDR (CallLog com direction preenchida =
// ligações reais registradas pelo Asterisk; o discador grava as suas sem
// direction, então não entram em dobro).
const readTodayQuality = async () => {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const rows = (await CallLog.findAll({
    where: { createdAt: { [Op.gte]: since }, direction: { [Op.ne]: null } },
    attributes: [
      "direction",
      "result",
      [sequelize.fn("COUNT", sequelize.col("id")), "count"],
    ],
    group: ["direction", "result"],
    raw: true,
  })) as unknown as Array<{ direction: string; result: string; count: string }>;

  let total = 0;
  let answered = 0;
  let inbound = 0;
  let inboundAnswered = 0;
  for (const r of rows) {
    const n = Number(r.count);
    total += n;
    if (r.result === "atendida") answered += n;
    if (r.direction === "inbound") {
      inbound += n;
      if (r.result === "atendida") inboundAnswered += n;
    }
  }
  const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
  return {
    total,
    answered,
    notAnswered: total - answered,
    inbound,
    inboundNotAnswered: inbound - inboundAnswered,
    // SLA = ligações atendidas sobre o total de hoje.
    slaPercent: pct(answered, total),
    // Abandono = ligações recebidas que ninguém atendeu.
    abandonPercent: pct(inbound - inboundAnswered, inbound),
  };
};

const readLiveQueues = async (): Promise<LiveQueue[] | null> => {
  try {
    const response = await Promise.race([
      runCommand("queue show"),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), AMI_TIMEOUT_MS),
      ),
    ]);
    return parseQueueShow(normalizeCommandOutput(response));
  } catch {
    return null; // Asterisk fora do ar — o painel mostra as filas sem dados ao vivo
  }
};

export const createDashboardRouter = () => {
  const router = express.Router();

  router.get("/dashboard", async (_, res: Response) => {
    const extensions = (await Extension.findAll()) as any[];
    const campaigns = await Campaign.findAll({
      order: [["createdAt", "DESC"]],
      limit: 5,
    });

    const statusCounts: Record<string, number> = {
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

  // Visão ao vivo do Painel: filas recebendo ligação, discador rodando e
  // URAs reversas ativas.
  router.get("/dashboard/live", requireSupervisor, async (_, res: Response) => {
    const [queues, live, extensions, dialer, ura, today] = await Promise.all([
      AsteriskQueue.findAll({ attributes: ["id", "name"], order: [["name", "ASC"]] }) as Promise<any[]>,
      readLiveQueues(),
      Extension.findAll({ attributes: ["number", "name"], raw: true }) as Promise<any[]>,
      Campaign.findAll({ where: { status: "in_progress" }, attributes: ["id", "name"] }) as Promise<any[]>,
      UraReverseCampaign.findAll({
        where: { status: { [Op.in]: ["running", "paused"] } },
        attributes: ["id", "name", "status"],
      }) as Promise<any[]>,
      readTodayQuality(),
    ]);

    const extName = new Map(extensions.map((e) => [String(e.number), e.name]));
    const liveByName = new Map((live ?? []).map((q) => [q.name, q]));

    const dialerCampaigns = await Promise.all(
      dialer.map(async (c) => {
        const [contacts, called, answered] = await Promise.all([
          CampaignContact.count({ where: { campaignId: c.id } }),
          CallLog.count({ where: { campaignId: c.id }, distinct: true, col: "phoneNumber" }),
          CallLog.count({ where: { campaignId: c.id, result: "atendida" } }),
        ]);
        return { id: c.id, name: c.name, contacts, called, answered };
      }),
    );

    const uraRows = ura.length
      ? ((await UraReverseContact.findAll({
          where: { campaignId: ura.map((c) => c.id) },
          attributes: [
            "campaignId",
            "status",
            [sequelize.fn("COUNT", sequelize.col("id")), "count"],
          ],
          group: ["campaignId", "status"],
          raw: true,
        })) as unknown as Array<{ campaignId: number; status: string; count: string }>)
      : [];

    const uraCampaigns = ura.map((c) => {
      const stats: Record<string, number> = {};
      for (const row of uraRows) {
        if (row.campaignId === c.id) stats[row.status] = Number(row.count);
      }
      const total = Object.values(stats).reduce((a, b) => a + b, 0);
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        total,
        pending: stats.pending ?? 0,
        calling: stats.calling ?? 0,
        answered: stats.answered ?? 0,
      };
    });

    return res.json({
      asteriskOnline: live !== null,
      queues: queues.map((q) => {
        const lq = liveByName.get(q.name);
        return {
          name: q.name,
          live: !!lq,
          waiting: lq?.waiting ?? 0,
          longestWaitSeconds: lq?.longestWaitSeconds ?? 0,
          completed: lq?.completed ?? 0,
          abandoned: lq?.abandoned ?? 0,
          members: (lq?.members ?? []).map((m) => {
            const number = m.name.replace(/^[A-Z]+\//i, "");
            return { number, name: extName.get(number) ?? null, state: m.state };
          }),
        };
      }),
      dialerCampaigns,
      uraCampaigns,
      today,
    });
  });

  return router;
};
