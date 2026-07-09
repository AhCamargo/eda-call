# 005 — Otimizar recordingsSyncService: eliminar full table scan a cada 10s

## Por que isso importa

`backend/src/services/recordingsSyncService.ts:56-60`:
```typescript
const syncRecordingsFromDisk = async () => {
  const wavFiles = await collectWavFiles(asteriskRecordingsDir);
  if (!wavFiles.length) return;

  const existing = await CallRecording.findAll({
    attributes: ["filePath"],
  }) as any[];
  const existingSet = new Set(existing.map((item) => item.filePath));
  // ...
};
```

A cada **10 segundos**, o serviço:
1. Varre todo o diretório de gravações em disco recursivamente
2. Carrega **todos** os registros de `CallRecordings` do banco para montar um Set
3. Para cada arquivo em disco, verifica se já está no Set

O passo 2 é um `SELECT filePath FROM "CallRecordings"` sem filtro — cresce linearmente com o número de gravações. Um sistema com 1 ano de operação pode ter 50.000–200.000 gravações, resultando em centenas de KBs de dados carregados do banco a cada 10 segundos, o dia todo.

## Solução

Manter o Set de filePaths **em memória**, carregado uma única vez na inicialização. Quando um novo arquivo é inserido no banco, adicionar ao Set ao mesmo tempo. O `findAll` passa de ser chamado 6x por minuto para ser chamado **1 vez** (no boot).

Isso é correto porque:
- Gravações não são deletadas do disco sem o servidor saber
- Se o servidor reiniciar, o Set é recarregado do banco novamente
- Se a inserção falhar, o arquivo não entra no Set e será retentado no próximo tick (comportamento idêntico ao atual)

## Escopo

**Arquivo a alterar:** `backend/src/services/recordingsSyncService.ts` (completo — reescrita do módulo)  
**Arquivos fora do escopo:** todos os demais.

## Estado atual (arquivo completo para referência)

```typescript
// recordingsSyncService.ts — 109 linhas
import fs from "fs/promises";
import path from "path";
import config from "../config";
import { CallRecording, Extension } from "../db";
import logger from "../logger";

const { asteriskRecordingsDir } = config;
const POLL_INTERVAL_MS = 10000;
let intervalId: ReturnType<typeof setInterval> | null = null;

const isWavFile = (name: string) => name.toLowerCase().endsWith(".wav");

const collectWavFiles = async (dirPath: string): Promise<string[]> => { ... };

const parseRecordingFilename = (filePath: string) => { ... };

const syncRecordingsFromDisk = async () => {
  const wavFiles = await collectWavFiles(asteriskRecordingsDir);
  if (!wavFiles.length) return;

  const existing = await CallRecording.findAll({   // ← full scan a cada 10s
    attributes: ["filePath"],
  }) as any[];
  const existingSet = new Set(existing.map((item) => item.filePath));

  for (const filePath of wavFiles) {
    if (existingSet.has(filePath)) continue;
    // ... insere no banco
  }
};

export const startRecordingsSyncService = () => {
  if (intervalId) return;
  const runSync = async () => { ... };
  runSync();
  intervalId = setInterval(runSync, POLL_INTERVAL_MS);
};
```

## Mudança a fazer

Substituir o conteúdo completo de `backend/src/services/recordingsSyncService.ts` pelo código abaixo:

```typescript
import fs from "fs/promises";
import path from "path";
import config from "../config";
import { CallRecording, Extension } from "../db";
import logger from "../logger";

const { asteriskRecordingsDir } = config;

const POLL_INTERVAL_MS = 10000;
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
      if (entry.isDirectory()) return collectWavFiles(fullPath);
      if (entry.isFile() && isWavFile(entry.name)) return [fullPath];
      return [];
    }),
  );

  return files.flat();
};

// Filename format from dialplan: YYYYMMDD-HHMMSS-UNIQUEID-CALLER-CALLEE.wav
const parseRecordingFilename = (filePath: string) => {
  const base = path.basename(filePath, path.extname(filePath));
  const parts = base.split("-");
  return {
    uniqueId: parts.length >= 3 ? parts[2] : null,
    callerNumber: parts.length >= 4 ? parts[3] : null,
    calleeNumber: parts.length >= 5 ? parts[4] : null,
  };
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

  for (const filePath of wavFiles) {
    if (knownFilePaths.has(filePath)) continue;

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

    try {
      await CallRecording.create({
        filePath,
        durationSeconds: 0,
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

export const startRecordingsSyncService = () => {
  if (intervalId) return;

  const runSync = async () => {
    try {
      await syncRecordingsFromDisk();
    } catch (error: any) {
      logger.error("Erro ao sincronizar gravações:", { message: error.message });
    }
  };

  // Inicializa o Set uma única vez antes de começar a varrer disco
  initKnownFilePaths()
    .then((set) => {
      knownFilePaths = set;
      logger.info(`[RecordingsSync] ${set.size} gravações conhecidas carregadas do banco.`);
      runSync();
      intervalId = setInterval(runSync, POLL_INTERVAL_MS);
    })
    .catch((error: any) => {
      logger.error("Erro ao inicializar RecordingsSyncService:", { message: error.message });
    });
};
```

### Diferenças em relação ao código original

| Aspecto | Antes | Depois |
|---------|-------|--------|
| `findAll` por tick | Sim (6x/min) | Não (1x no boot) |
| Set de filePaths | Reconstruído a cada tick | Mantido em memória e atualizado incrementalmente |
| Falha na inserção | Ignorada | Capturada, filePath não entra no Set (será retentado) |
| Log no boot | Nenhum | Informa quantas gravações foram carregadas |

## Verificação

1. **Typecheck:**
   ```bash
   cd backend && npx tsc --noEmit
   ```
   Esperado: zero erros.

2. **Verificação funcional:**
   - Iniciar o backend — confirmar no log: `[RecordingsSync] N gravações conhecidas carregadas do banco`
   - Copiar um arquivo `.wav` novo para `asterisk/recordings/`
   - Aguardar até 10s — confirmar que o arquivo aparece na tela de Gravações na UI
   - Reiniciar o backend — confirmar que o arquivo já existente **não** é inserido duplicado

3. **Verificação de regressão:**
   - Nenhuma gravação existente deve desaparecer da UI após o restart
   - Nenhuma gravação deve aparecer duplicada

## Manutenção

- O Set em memória cresce junto com o número de gravações. Para uma instalação com 500.000 gravações (strings de ~80 chars cada), o Set ocupa ~40MB — aceitável.
- Se no futuro houver lógica de deleção de gravações, o Set precisará ser atualizado na deleção também. Por ora não há endpoint de deleção de gravações.

## Escape hatches

- Se o banco tiver muitas gravações (>100k) e o `initKnownFilePaths` demorar no boot: não é um problema — o sync só inicia após o `then()`, o servidor responde requisições normalmente enquanto isso.
- Se `CallRecording.create` falhar por outro motivo que não unique constraint (ex: conexão perdida com o banco): o arquivo ficará fora do Set e será retentado no próximo tick. Esse comportamento é correto.
