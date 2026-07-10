import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import config from "../config";
import { verifyToken } from "../middleware/auth";
import { CallRecording } from "../db";

const { asteriskRecordingsDir } = config;

export const createRecordingsRouter = () => {
  const router = express.Router();

  router.post("/recordings", async (req: Request, res: Response) => {
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

  router.get("/recordings/:filename", verifyToken, async (req: Request, res: Response) => {
    const filename = req.params.filename as string;
    if (!/^[a-zA-Z0-9._-]+\.(wav|mp3)$/i.test(filename)) {
      return res.status(400).json({ message: "Nome de arquivo inválido" });
    }
    const baseDir = path.resolve(asteriskRecordingsDir);
    const safePath = path.resolve(path.join(baseDir, filename));
    if (!safePath.startsWith(baseDir)) {
      return res.status(403).json({ message: "Acesso negado" });
    }
    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ message: "Arquivo não encontrado" });
    }

    const stat = fs.statSync(safePath);
    const total = stat.size;
    const ext = path.extname(filename).toLowerCase();
    const mimeType = ext === ".mp3" ? "audio/mpeg" : "audio/wav";

    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      const [startStr, endStr] = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : total - 1;
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": mimeType,
      });
      fs.createReadStream(safePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": total,
        "Content-Type": mimeType,
        "Accept-Ranges": "bytes",
      });
      fs.createReadStream(safePath).pipe(res);
    }
  });

  router.delete("/recordings/:id", async (req: Request, res: Response) => {
    const recording = (await CallRecording.findByPk(
      req.params.id as string,
    )) as any;
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
      } catch (error: any) {
        return res.status(500).json({
          message: "Falha ao remover arquivo de gravação",
          detail: error.message,
        });
      }
    }

    await recording.destroy();
    return res.json({ message: "Gravação removida com sucesso" });
  });

  return router;
};
