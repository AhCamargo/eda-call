import fs from "fs/promises";
import path from "path";
import config from "../config";
import { CallRecording, Extension } from "../db";

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

// Filename format from dialplan: YYYYMMDD-HHMMSS-UNIQUEID-CALLER-CALLEE.wav
const parseRecordingFilename = (filePath: string) => {
  const base = path.basename(filePath, path.extname(filePath));
  const parts = base.split("-");
  // parts[0]=date, parts[1]=time, parts[2]=uniqueid, parts[3]=caller, parts[4]=callee
  return {
    uniqueId: parts.length >= 3 ? parts[2] : null,
    callerNumber: parts.length >= 4 ? parts[3] : null,
    calleeNumber: parts.length >= 5 ? parts[4] : null,
  };
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

    const { uniqueId, callerNumber, calleeNumber } = parseRecordingFilename(filePath);

    let extensionId: number | null = null;
    const extNumber = callerNumber || calleeNumber;
    if (extNumber) {
      const ext = await (Extension as any).findOne({ where: { number: extNumber } }) as any;
      if (ext) extensionId = ext.id;
    }

    await CallRecording.create({
      filePath,
      durationSeconds: 0,
      callUniqueId: uniqueId,
      extensionId,
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
