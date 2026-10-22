// Converte qualquer áudio que o navegador saiba tocar (MP3, WAV, M4A, OGG…)
// para o formato exigido pelas campanhas de URA reversa: WAV PCM 16-bit,
// mono, 8000 Hz. Feito no navegador para o operador não precisar de
// programas de conversão (e o backend não precisar de ffmpeg).

const SAMPLE_RATE = 8000;

const encodeWav = (samples: Float32Array): ArrayBuffer => {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // tamanho do bloco fmt
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits por amostra
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return view.buffer;
};

export const audioToTelephonyWav = async (file: File): Promise<File> => {
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error("Não foi possível ler este arquivo de áudio. Use MP3 ou WAV.");
  } finally {
    ctx.close();
  }

  // OfflineAudioContext com 1 canal a 8 kHz faz a mixagem para mono e a
  // reamostragem de uma vez.
  const offline = new OfflineAudioContext(
    1,
    Math.ceil(decoded.duration * SAMPLE_RATE),
    SAMPLE_RATE,
  );
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();

  const name = file.name.replace(/\.[^.]+$/, "") + ".wav";
  return new File([encodeWav(rendered.getChannelData(0))], name, {
    type: "audio/wav",
  });
};
