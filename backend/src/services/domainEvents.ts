import { Op } from "sequelize";
import { DomainEvent } from "../db";
import logger from "../logger";

// Fatos que o núcleo publica para os módulos. O nome segue "<assunto>.<fato>".
// Acrescentar um tipo é compatível; mudar o formato de um payload existente
// quebra módulos já instalados nos clientes — crie um tipo novo em vez disso.
export type DomainEventType = "call.ended" | "call.missed";

export interface CallEventPayload {
  /** UniqueID do canal de quem originou a ligação no Asterisk. */
  uniqueId: string;
  direction: "inbound" | "outbound" | "internal";
  /** Número do outro lado (quem ligou, ou para quem se ligou), como o Asterisk entregou. */
  phoneNumber: string;
  /** Uma pessoa (ramal) atendeu? URA/fila que "atende" sem ninguém não conta. */
  answeredByPerson: boolean;
  /** Ramal que atendeu ou que fez a ligação, se houver. */
  extension: string | null;
  /** Nome da linha VoIP (tronco) por onde passou, se houver. */
  voipLine: string | null;
  /** Segundos em conversa (sem o toque). */
  talkSeconds: number;
  /** Quando a ligação terminou (ISO 8601). */
  endedAt: string;
}

export const publishEvent = async (type: DomainEventType, payload: CallEventPayload): Promise<void> => {
  try {
    await (DomainEvent as any).create({ type, payload });
  } catch (error: any) {
    // Publicar é efeito colateral: nunca pode derrubar o registro da ligação.
    logger.error(`[DomainEvents] falha ao publicar ${type}: ${error.message}`);
  }
};

export interface ListEventsOptions {
  after: number;
  types?: string[];
  limit: number;
}

export const listEvents = async ({ after, types, limit }: ListEventsOptions) => {
  const where: any = { id: { [Op.gt]: after } };
  if (types && types.length) where.type = { [Op.in]: types };
  const rows = (await (DomainEvent as any).findAll({
    where,
    order: [["id", "ASC"]],
    limit,
  })) as any[];
  return rows.map((row) => ({
    id: Number(row.id),
    type: row.type,
    payload: row.payload,
    createdAt: row.createdAt,
  }));
};

export const latestEventId = async (): Promise<number> => {
  const max = await (DomainEvent as any).max("id");
  return max ? Number(max) : 0;
};

// A fila não é histórico: os relatórios continuam vindo de CallLogs. Guardar
// 30 dias dá folga para um módulo parado voltar sem perder nada.
const RETENTION_DAYS = 30;

export const pruneOldEvents = async (): Promise<void> => {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const removed = await (DomainEvent as any).destroy({ where: { createdAt: { [Op.lt]: cutoff } } });
  if (removed) logger.info(`[DomainEvents] ${removed} eventos com mais de ${RETENTION_DAYS} dias removidos`);
};

export const startDomainEventsMaintenance = (): void => {
  const run = () => pruneOldEvents().catch((e: any) => logger.error(`[DomainEvents] limpeza falhou: ${e.message}`));
  run();
  setInterval(run, 6 * 60 * 60 * 1000).unref();
};
