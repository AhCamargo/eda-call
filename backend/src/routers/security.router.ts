import express, { Request, Response } from "express";
import { exec as execCb } from "child_process";
import { promisify } from "util";
import { verifyToken, requireAdmin } from "../middleware/auth";

const exec = promisify(execCb);

export const createSecurityRouter = () => {
  const router = express.Router();

  // ── Segurança / fail2ban (admin only) ──────────────────────────
  router.get(
    "/security/banned-ips",
    verifyToken,
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const { stdout } = await exec(
          "fail2ban-client status asterisk-edacall",
        );
        const ipsMatch = stdout.match(/Banned IP list:\s*(.+)/);
        const ips = ipsMatch
          ? ipsMatch[1].trim().split(/\s+/).filter(Boolean)
          : [];
        const num = (pattern: RegExp) =>
          Number((stdout.match(pattern) || [])[1] || 0);
        return res.json({
          ips,
          stats: {
            currentBanned: num(/Currently banned:\s*(\d+)/),
            totalBanned: num(/Total banned:\s*(\d+)/),
            currentFailed: num(/Currently failed:\s*(\d+)/),
            totalFailed: num(/Total failed:\s*(\d+)/),
          },
        });
      } catch {
        return res.json({ ips: [], stats: null, unavailable: true });
      }
    },
  );

  router.delete(
    "/security/banned-ips/:ip",
    verifyToken,
    requireAdmin,
    async (req: Request, res: Response) => {
      const ip = String(req.params.ip);
      if (!/^[\d.a-fA-F:]+$/.test(ip))
        return res.status(400).json({ message: "IP inválido" });
      try {
        await exec(`fail2ban-client set asterisk-edacall unbanip ${ip}`);
        return res.json({ ok: true });
      } catch (err: any) {
        return res
          .status(500)
          .json({ message: "Erro ao desbanir IP", detail: err.message });
      }
    },
  );

  return router;
};
