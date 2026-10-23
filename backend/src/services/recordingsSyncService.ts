import fs from "fs/promises";
import path from "path";
import config from "../config";
import { CallRecording, Extension } from "../db";
import logger from "../logger";
import { wavDurationSeconds } from "../utils/wavDuration";

const { asteriskRecordingsDir } = config;

const POLL_INTERVAL_MS = 10000;
// O MixMonitor escreve o arquivo durante toda a ligação: só registra a
// gravação depois que ela fica este tempo sem crescer (ligação encerrada),
// senão a duração sairia parcial.
const STABLE_MS = 8000;
let intervalId: ReturnType<typeof setInterval> | null = null;

// Set em memória carregado uma vez no boot — elimina full table scan a cada tick
let knownFilePaths: Set<string> | null = null;

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
export const parseRecordingFilename = (filePath: string) => {
  const base = path.basename(filePath, path.extname(filePath));
  const parts = base.split("-");
  // parts[0]=date, parts[1]=time, parts[2]=uniqueid, resto = CALLER-CALLEE
  return {
    uniqueId: parts.length >= 3 ? parts[2] : null,
    // Ramais podem ter hífen (ex.: C1-1000), então o resto é mantido inteiro
    // e a divisão quem ligou/destino é resolvida contra os ramais existentes.
    rest: parts.slice(3),
  };
};

// Quem ligou é preferido (ligação feita por um ramal); se não for ramal
// (ligação recebida de fora), usa o destino.
export const findExtensionNumber = (rest: string[], known: Set<string>): string | null => {
  for (let i = 1; i < rest.length; i += 1) {
    const caller = rest.slice(0, i).join("-");
    if (known.has(caller)) return caller;
  }
  for (let i = 1; i < rest.length; i += 1) {
    const callee = rest.slice(i).join("-");
    if (known.has(callee)) return callee;
  }
  return null;
};

const initKnownFilePaths = async (): Promise<Set<string>> => {
  const existing = await CallRecording.findAll({
    attributes: ["filePath"],
  }) as any[];
  return new Set(existing.map((item) => item.filePath));
};

const syncRecordingsFromDisk = async () => {
  if (!knownFilePaths) return;

  const wavFiles = await collectWavFiles(asteriskRecordingsDir);
  if (!wavFiles.length) return;

  let extensionsByNumber: Map<string, number> | null = null;

  for (const filePath of wavFiles) {
    if (knownFilePaths.has(filePath)) continue;

    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      continue;
    }

    if (Date.now() - stat.mtimeMs < STABLE_MS) continue; // ainda gravando

    const durationSeconds = await wavDurationSeconds(filePath).catch(() => 0);
    const { uniqueId, rest } = parseRecordingFilename(filePath);

    if (!extensionsByNumber) {
      const all = (await Extension.findAll({ attributes: ["id", "number"], raw: true })) as any[];
      extensionsByNumber = new Map(all.map((e) => [String(e.number), e.id]));
    }
    const extNumber = findExtensionNumber(rest, new Set(extensionsByNumber.keys()));
    const extensionId = extNumber ? extensionsByNumber.get(extNumber) ?? null : null;

    try {
      await CallRecording.create({
        filePath,
        durationSeconds,
        callUniqueId: uniqueId,
        extensionId,
        createdAt: stat.birthtime || new Date(),
        updatedAt: new Date(),
      });
      knownFilePaths.add(filePath);
    } catch {
      // Inserção falhou (ex: unique constraint) — não adicionar ao Set, será retentado
    }
  }
};

// Gravações registradas antes do cálculo de duração existir ficaram com 0.
const backfillMissingDurations = async () => {
  const rows = (await CallRecording.findAll({
    where: { durationSeconds: 0 },
    attributes: ["id", "filePath"],
  })) as any[];
  let fixed = 0;
  for (const row of rows) {
    const seconds = await wavDurationSeconds(row.filePath).catch(() => 0);
    if (seconds > 0) {
      await CallRecording.update({ durationSeconds: seconds }, { where: { id: row.id } });
      fixed += 1;
    }
  }
  if (fixed) logger.info(`[RecordingsSync] Duração preenchida em ${fixed} gravações antigas.`);
};

export const startRecordingsSyncService = () => {
  if (intervalId) return;

  const runSync = async () => {
    try {
      await syncRecordingsFromDisk();
    } catch (error: any) {
      logger.error("Erro ao sincronizar gravações:", { message: error.message });
    }
  };

  // Carrega o Set uma única vez antes de iniciar o polling
  initKnownFilePaths()
    .then((set) => {
      knownFilePaths = set;
      logger.info(`[RecordingsSync] ${set.size} gravações conhecidas carregadas do banco.`);
      runSync();
      intervalId = setInterval(runSync, POLL_INTERVAL_MS);
      backfillMissingDurations().catch((error: any) =>
        logger.error("Erro ao preencher duração das gravações:", { message: error.message }),
      );
    })
    .catch((error: any) => {
      logger.error("Erro ao inicializar RecordingsSyncService:", { message: error.message });
    });
};
