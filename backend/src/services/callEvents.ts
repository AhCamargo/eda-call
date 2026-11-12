import { publishEvent, CallEventPayload, DomainEventType } from "./domainEvents";

// Uma mesma ligação pode gerar vários registros Cdr no AMI, todos com o mesmo
// UniqueID: um quando a URA atende, outro quando o ramal atende, um por ramal
// que tocou sem atender… Olhar só o primeiro (como o CallLog faz) diria
// "não atendida" para uma ligação que a URA atendeu e depois um atendente
// pegou. Por isso os registros de um mesmo UniqueID são juntados e a
// ligação só é fechada depois de um tempo sem registro novo.

export interface CdrSummary {
  uniqueId: string;
  direction: CallEventPayload["direction"];
  phoneNumber: string;
  answeredByPerson: boolean;
  extension: string | null;
  voipLine: string | null;
  talkSeconds: number;
  endedAt: Date;
}

type Publish = (type: DomainEventType, payload: CallEventPayload) => Promise<void> | void;

export const DEFAULT_QUIET_MS = 20_000;

export const summarizeCall = (records: CdrSummary[]): CallEventPayload => {
  const first = records[0];
  const answered = records.filter((r) => r.answeredByPerson);
  const latest = records.reduce((a, b) => (b.endedAt > a.endedAt ? b : a), first);
  return {
    uniqueId: first.uniqueId,
    direction: first.direction,
    phoneNumber: records.find((r) => r.phoneNumber)?.phoneNumber || first.phoneNumber,
    answeredByPerson: answered.length > 0,
    extension: answered[0]?.extension ?? records.find((r) => r.extension)?.extension ?? null,
    voipLine: records.find((r) => r.voipLine)?.voipLine ?? null,
    talkSeconds: answered.length ? Math.max(...answered.map((r) => r.talkSeconds)) : 0,
    endedAt: latest.endedAt.toISOString(),
  };
};

export const createCallEventAggregator = ({
  publish = publishEvent as Publish,
  quietMs = DEFAULT_QUIET_MS,
}: { publish?: Publish; quietMs?: number } = {}) => {
  const pending = new Map<string, { records: CdrSummary[]; timer: ReturnType<typeof setTimeout> }>();

  const flush = async (uniqueId: string) => {
    const entry = pending.get(uniqueId);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(uniqueId);

    const payload = summarizeCall(entry.records);
    await publish("call.ended", payload);
    if (payload.direction === "inbound" && !payload.answeredByPerson) {
      await publish("call.missed", payload);
    }
  };

  const record = (summary: CdrSummary) => {
    if (!summary.uniqueId) return;
    const entry = pending.get(summary.uniqueId);
    if (entry) clearTimeout(entry.timer);
    const records = entry ? [...entry.records, summary] : [summary];
    const timer = setTimeout(() => void flush(summary.uniqueId), quietMs);
    // Não segura o processo (nem os testes) só por causa de uma ligação pendente.
    timer.unref?.();
    pending.set(summary.uniqueId, { records, timer });
  };

  const flushAll = async () => {
    for (const uniqueId of [...pending.keys()]) await flush(uniqueId);
  };

  return { record, flushAll, pendingCount: () => pending.size };
};

export const callEvents = createCallEventAggregator();
