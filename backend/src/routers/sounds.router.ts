import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import config from "../config";
import { verifyToken, requireAdmin } from "../middleware/auth";
import { getAmiClient } from "../ami";

const { asteriskSoundsDir } = config;

const uploadIvr = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav"];
    if (allowed.includes(file.mimetype) || /\.(mp3|wav)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error("Apenas arquivos MP3 ou WAV são permitidos"));
    }
  },
});

export const createSoundsRouter = () => {
  const router = express.Router();

  // ── Áudios URA (gerenciador de sons) ────────────────────────────────────

  router.get(
    "/sounds",
    verifyToken,
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const entries = fs.readdirSync(asteriskSoundsDir, { withFileTypes: true });
        const files = entries
          .filter((e) => e.isFile() && /\.(mp3|wav)$/i.test(e.name))
          .map((e) => {
            const filePath = path.join(asteriskSoundsDir, e.name);
            const stat = fs.statSync(filePath);
            const nameNoExt = e.name.replace(/\.(mp3|wav)$/i, "");
            return {
              filename: e.name,
              asteriskPath: `custom/${nameNoExt}`,
              size: stat.size,
              uploadedAt: stat.mtime,
            };
          })
          .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
        return res.json(files);
      } catch (err) {
        return res.status(500).json({ message: "Erro ao listar áudios" });
      }
    },
  );

  router.get(
    "/sounds/stream/:filename",
    verifyToken,
    requireAdmin,
    async (req: Request, res: Response) => {
      const filename = req.params.filename as string;
      if (!/^[a-z0-9._-]+\.(mp3|wav)$/i.test(filename)) {
        return res.status(400).json({ message: "Nome de arquivo inválido" });
      }
      const filePath = path.join(asteriskSoundsDir, filename);
      const safePath = path.resolve(filePath);
      if (!safePath.startsWith(path.resolve(asteriskSoundsDir))) {
        return res.status(400).json({ message: "Acesso negado" });
      }
      if (!fs.existsSync(safePath)) {
        return res.status(404).json({ message: "Arquivo não encontrado" });
      }
      const ext = path.extname(filename).toLowerCase();
      const mimeType = ext === ".mp3" ? "audio/mpeg" : "audio/wav";
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Accept-Ranges", "bytes");
      fs.createReadStream(safePath).pipe(res);
    },
  );

  router.post(
    "/sounds/upload",
    verifyToken,
    requireAdmin,
    uploadIvr.single("audio"),
    async (req: Request, res: Response) => {
      if (!req.file) return res.status(400).json({ message: "Nenhum arquivo enviado" });

      const originalName = req.file.originalname
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9._-]/g, "-")
        .replace(/-+/g, "-");

      const destPath = path.join(asteriskSoundsDir, originalName);
      const safePath = path.resolve(destPath);
      if (!safePath.startsWith(path.resolve(asteriskSoundsDir))) {
        return res.status(400).json({ message: "Nome de arquivo inválido" });
      }

      fs.writeFileSync(safePath, req.file.buffer);
      const nameNoExt = originalName.replace(/\.(mp3|wav)$/i, "");
      return res.json({
        message: "Áudio enviado com sucesso",
        filename: originalName,
        asteriskPath: `custom/${nameNoExt}`,
      });
    },
  );

  router.delete(
    "/sounds/:filename",
    verifyToken,
    requireAdmin,
    async (req: Request, res: Response) => {
      const filename = req.params.filename as string;
      if (!/^[a-z0-9._-]+\.(mp3|wav)$/i.test(filename)) {
        return res.status(400).json({ message: "Nome de arquivo inválido" });
      }
      const filePath = path.join(asteriskSoundsDir, filename);
      const safePath = path.resolve(filePath);
      if (!safePath.startsWith(path.resolve(asteriskSoundsDir))) {
        return res.status(400).json({ message: "Acesso negado" });
      }
      if (!fs.existsSync(safePath)) {
        return res.status(404).json({ message: "Arquivo não encontrado" });
      }
      fs.unlinkSync(safePath);
      return res.json({ message: "Áudio removido com sucesso" });
    },
  );

  router.post(
    "/sounds/dialplan-reload",
    verifyToken,
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const ami = getAmiClient();
        await new Promise<void>((resolve, reject) => {
          ami.action({ Action: "Command", Command: "dialplan reload" }, (err: any) => {
            if (err) return reject(err);
            resolve();
          });
        });
        return res.json({ message: "Dialplan recarregado com sucesso" });
      } catch {
        return res.status(500).json({ message: "Erro ao recarregar dialplan" });
      }
    },
  );

  return router;
};
