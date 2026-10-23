import fs from "fs/promises";
import { parseWavFormat } from "./routeHelpers";

// Formato padrão do MixMonitor (.wav): PCM 16-bit mono 8 kHz = 16000 bytes/s.
const DEFAULT_BYTES_PER_SECOND = 16000;
const HEADER_READ_BYTES = 512;

// Duração em segundos a partir do cabeçalho WAV + tamanho do arquivo.
// Usa o tamanho real do arquivo (e não o campo de tamanho do chunk "data"),
// porque gravações interrompidas podem ficar com o cabeçalho desatualizado.
export const wavDurationFromHeader = (header: Buffer, fileSize: number): number => {
  const fmt = parseWavFormat(header);
  const bytesPerSecond =
    fmt && fmt.sampleRate && fmt.channels && fmt.bitsPerSample
      ? (fmt.sampleRate * fmt.channels * fmt.bitsPerSample) / 8
      : DEFAULT_BYTES_PER_SECOND;

  let dataStart = 44;
  const dataIdx = header.indexOf("data", 12, "ascii");
  if (dataIdx >= 0) dataStart = dataIdx + 8;

  const dataBytes = Math.max(0, fileSize - dataStart);
  return Math.round(dataBytes / bytesPerSecond);
};

export const wavDurationSeconds = async (filePath: string): Promise<number> => {
  const handle = await fs.open(filePath, "r");
  try {
    const { size } = await handle.stat();
    const header = Buffer.alloc(Math.min(HEADER_READ_BYTES, size));
    await handle.read(header, 0, header.length, 0);
    return wavDurationFromHeader(header, size);
  } finally {
    await handle.close();
  }
};
