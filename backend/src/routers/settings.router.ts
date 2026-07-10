import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import config from "../config";
import { requireAdmin } from "../middleware/auth";
import { getAmiClient } from "../ami";

export const createSettingsRouter = () => {
  const router = express.Router();

  // ── Configurações do servidor ───────────────────────────────────────────────

  const readExternIp = (): string => {
    try {
      const content = fs.readFileSync(config.asteriskSipNatFile, "utf-8");
      const match = content.match(/^externip\s*=\s*(.+)$/m);
      return match ? match[1].trim() : "";
    } catch {
      return "";
    }
  };

  const readApiUrl = (): string => {
    try {
      const file = path.join(config.serverConfigDir, "api_url");
      if (fs.existsSync(file)) return fs.readFileSync(file, "utf-8").trim();
    } catch {}
    return "";
  };

  router.get("/settings", requireAdmin, (_req: Request, res: Response) => {
    return res.json({
      serverIp: readExternIp(),
      apiUrl: readApiUrl(),
    });
  });

  router.patch("/settings", requireAdmin, async (req: Request, res: Response) => {
    const { serverIp, apiUrl } = req.body;

    if (serverIp) {
      if (!/^[\d.a-fA-F:]+$/.test(serverIp)) {
        return res.status(400).json({ message: "IP inválido" });
      }

      try {
        let content = fs.readFileSync(config.asteriskSipNatFile, "utf-8");
        content = content.replace(/^externip\s*=.*$/m, `externip=${serverIp}`);
        fs.writeFileSync(config.asteriskSipNatFile, content, "utf-8");

        const ami = getAmiClient();
        await new Promise<void>((resolve) => {
          ami.action({ Action: "Command", Command: "sip reload" }, () => resolve());
        });
      } catch (err: any) {
        return res.status(500).json({ message: "Erro ao atualizar IP do Asterisk", detail: err.message });
      }
    }

    if (apiUrl !== undefined) {
      try {
        fs.mkdirSync(config.serverConfigDir, { recursive: true });
        fs.writeFileSync(path.join(config.serverConfigDir, "api_url"), String(apiUrl).trim(), "utf-8");
      } catch (err: any) {
        return res.status(500).json({ message: "Erro ao salvar URL da API", detail: err.message });
      }
    }

    return res.json({ ok: true, serverIp: readExternIp(), apiUrl: readApiUrl() });
  });

  return router;
};
