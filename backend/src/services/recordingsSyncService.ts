import fs from "fs/promises";
import path from "path";
import config from "../config";
import { CallRecording } from "../db";

const { asteriskRecordingsDir } = config;

const POLL_INTERVAL_MS = 10000;
let intervalId: ReturnType<typeof setInterval> | null = null;

const isWavFile = (name: string) => name.toLowerCase().endsWith(".wav");

const collectWavFiles = async (dirPath: string): Promise<string[]> => {
  let entries: any[] = [];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        return collectWavFiles(fullPath);
      }
      if (entry.isFile() && isWavFile(entry.name)) {
        return [fullPath];
      }
      return [];
    }),
  );

  return files.flat();
};

const getUniqueIdFromFilename = (filePath: string) => {
  const base = path.basename(filePath, path.extname(filePath));
  const parts = base.split("-");
  return parts.length >= 2 ? parts[1] : null;
};

const syncRecordingsFromDisk = async () => {
  const wavFiles = await collectWavFiles(asteriskRecordingsDir);
  if (!wavFiles.length) {
    return;
  }

  const existing = await CallRecording.findAll({
    attributes: ["filePath"],
  }) as any[];
  const existingSet = new Set(existing.map((item) => item.filePath));

  for (const filePath of wavFiles) {
    if (existingSet.has(filePath)) {
      continue;
    }

    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      continue;
    }

    await CallRecording.create({
      filePath,
      durationSeconds: 0,
      callUniqueId: getUniqueIdFromFilename(filePath),
      createdAt: stat.birthtime || new Date(),
      updatedAt: new Date(),
    });
  }
};

export const startRecordingsSyncService = () => {
  if (intervalId) {
    return;
  }

  const runSync = async () => {
    try {
      await syncRecordingsFromDisk();
    } catch (error: any) {
      console.error("Erro ao sincronizar gravações:", error.message);
    }
  };

  runSync();
  intervalId = setInterval(runSync, POLL_INTERVAL_MS);
};
