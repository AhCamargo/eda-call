import express, { Request, Response } from "express";
import multer from "multer";
import path from "path";
import config from "../config";

const { asteriskRecordingsDir } = config;

export const upload = multer({ storage: multer.memoryStorage() });
export const uploadAudio = multer({ storage: multer.memoryStorage() });

export const PHONE_REGEX = /^\d{10,14}$/;

export const normalizePhone = (value: any) =>
  String(value || "").replace(/\D/g, "");

export const parseWavFormat = (buffer: Buffer) => {
  if (!buffer || buffer.length < 44) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF") return null;
  if (buffer.toString("ascii", 8, 12) !== "WAVE") return null;

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === "fmt ") {
      if (offset + 8 + 16 > buffer.length) return null;
      return {
        audioFormat: buffer.readUInt16LE(offset + 8),
        channels: buffer.readUInt16LE(offset + 10),
        sampleRate: buffer.readUInt32LE(offset + 12),
        bitsPerSample: buffer.readUInt16LE(offset + 22),
      };
    }

    offset += 8 + chunkSize;
  }

  return null;
};

export const normalizeExtensionNumber = (value: any) =>
  String(value || "")
    .trim()
    .toUpperCase();

export const isValidExtensionNumber = (value: any) => {
  const text = normalizeExtensionNumber(value);
  return /^\d+$/.test(text) || /^C\d+-\d+$/.test(text);
};

export const extractSector = (number: string) => {
  const text = normalizeExtensionNumber(number);
  const match = text.match(/^(C\d+)-\d+$/);
  return match ? match[1] : null;
};

export const withExtensionSector = (extension: any) => ({
  ...extension.toJSON(),
  sector: extractSector(extension.number),
});

export const toRecordingWebPath = (filePath: string) => {
  if (!filePath) return null;
  const normalizedBase = path.resolve(asteriskRecordingsDir);
  const normalizedFile = path.resolve(filePath);

  if (!normalizedFile.startsWith(normalizedBase)) {
    return null;
  }

  const relative = path.relative(normalizedBase, normalizedFile);
  return `/recordings/${relative.split(path.sep).join("/")}`;
};

export const asyncHandler =
  (fn: (req: Request, res: Response, next: express.NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: express.NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);
