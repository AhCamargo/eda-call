import express, { Request, Response } from "express";
import fs from "fs";
import config from "../config";
import { Extension } from "../db";
import { runCommand } from "../ami";
import { getRecentError5xxCount } from "../services/metricsCollector";
import { isInternalRequest } from "../utils/network";

const AMI_PING_TIMEOUT_MS = 2000;

const getRecordingsDiskUsage = () => {
  try {
    const stats = fs.statfsSync(config.asteriskRecordingsDir);
    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bfree * stats.bsize;
    const usedPercent = totalBytes > 0 ? Math.round(((totalBytes - freeBytes) / totalBytes) * 1000) / 10 : null;
    return { path: config.asteriskRecordingsDir, totalBytes, freeBytes, usedPercent };
  } catch (error: any) {
    return { path: config.asteriskRecordingsDir, error: error.message };
  }
};

const pingAmi = async (): Promise<{ connected: boolean; error?: string }> => {
  try {
    await Promise.race([
      runCommand("core show version"),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), AMI_PING_TIMEOUT_MS),
      ),
    ]);
    return { connected: true };
  } catch (error: any) {
    return { connected: false, error: error.message };
  }
};

// Endpoint de métricas operacionais para monitoramento (Zabbix/Grafana ou
// scraping manual) — substitui o /health puro ({ok:true}) por dados reais
// de disco, erros e status do AMI (achado R6 da auditoria de segurança).
// Restrito à rede interna, no mesmo modelo do callback do Asterisk em
// internal.router.ts: quem consulta isso é sempre o próprio host/rede
// Docker (agente de monitoramento local), nunca a internet pública.
export const createMetricsRouter = () => {
  const router = express.Router();

  router.get("/metrics", async (req: Request, res: Response) => {
    if (!isInternalRequest(req)) {
      return res.status(403).json({ message: "Acesso restrito à rede interna" });
    }

    const [activeCalls, ringingCalls, inCampaignCalls, ami] = await Promise.all([
      Extension.count({ where: { status: "in_call" } }),
      Extension.count({ where: { status: "ringing" } }),
      Extension.count({ where: { status: "in_campaign" } }),
      pingAmi(),
    ]);

    return res.json({
      timestamp: new Date().toISOString(),
      recordingsDisk: getRecordingsDiskUsage(),
      errors5xxLast5Min: getRecentError5xxCount(),
      extensions: { active: activeCalls, ringing: ringingCalls, inCampaign: inCampaignCalls },
      ami,
    });
  });

  return router;
};
