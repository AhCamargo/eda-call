import { Sequelize, DataTypes, Op } from "sequelize";
import config from "./config";

if (!config.databaseUrl) {
  throw new Error("DATABASE_URL não configurada.");
}

export const sequelize = new Sequelize(config.databaseUrl, {
  dialect: "postgres",
  logging: false,
});

export const User = sequelize.define("User", {
  username: { type: DataTypes.STRING, allowNull: false, unique: true },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  role: {
    type: DataTypes.ENUM("admin", "supervisor", "agent"),
    allowNull: false,
    defaultValue: "admin",
  },
});

export const Extension = sequelize.define("Extension", {
  number: { type: DataTypes.STRING, allowNull: false, unique: true },
  name: { type: DataTypes.STRING, allowNull: false },
  password: { type: DataTypes.STRING, allowNull: false }, // Senha SIP do ramal
  pauseReason: { type: DataTypes.STRING, allowNull: true },
  status: {
    type: DataTypes.ENUM(
      "online",
      "offline",
      "paused",
      "ringing",
      "in_call",
      "in_campaign",
      "training",
    ),
    allowNull: false,
    defaultValue: "offline",
  },
  voipLineId: { type: DataTypes.INTEGER, allowNull: true },
});

// ── Histórico de status dos agentes (para relatórios de produtividade) ────────
// Cada linha representa um período em que o agente ficou num determinado status.
// Quando o status muda: endedAt e durationSeconds são preenchidos na linha atual,
// e uma nova linha é aberta com o novo status.
export const AgentStatusLog = sequelize.define("AgentStatusLog", {
  // Denormalizados para facilitar queries de relatório sem JOIN
  extensionNumber: { type: DataTypes.STRING, allowNull: false },
  extensionName:   { type: DataTypes.STRING, allowNull: false },

  status: {
    type: DataTypes.ENUM(
      "online", "offline", "paused", "ringing",
      "in_call", "in_campaign", "training",
    ),
    allowNull: false,
  },
  pauseReason: { type: DataTypes.STRING, allowNull: true },

  startedAt:       { type: DataTypes.DATE, allowNull: false },
  endedAt:         { type: DataTypes.DATE, allowNull: true },  // null = ainda ativo
  durationSeconds: { type: DataTypes.INTEGER, allowNull: true }, // null até fechar
});

export const VoipLine = sequelize.define("VoipLine", {
  name: { type: DataTypes.STRING, allowNull: false, unique: true },
  username: { type: DataTypes.STRING, allowNull: false },
  secret: { type: DataTypes.STRING, allowNull: false },
  host: { type: DataTypes.STRING, allowNull: false },
  port: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5060 },
  // Contexto para ramais que discam por esta linha (outbound)
  context: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "default",
  },
  // Contexto para chamadas que entram por esta linha (inbound / URA receptiva)
  inboundContext: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
  },
  transport: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "transport-udp",
  },
  // Tipo do peer SIP: peer (só recebe/envia), friend (bidirecional), user (só registra)
  type: {
    type: DataTypes.ENUM("peer", "friend", "user"),
    allowNull: false,
    defaultValue: "peer",
  },
  // Modo DTMF: rfc2833 (padrão) ou inband
  dtmfmode: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "rfc2833",
  },
  // fromdomain: para provedores que exigem (ex: sip1.voztel.com.br)
  fromdomain: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
  },
  // Codecs suportados, separados por vírgula (ex: "ulaw,alaw" ou "g729,ulaw")
  codecs: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "ulaw,alaw",
  },
  // Limite de chamadas simultâneas (0 = ilimitado)
  callLimit: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  // insecure: para troncos que não fazem registro (invite,port) ou exigem autenticação
  insecure: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: "invite,port",
  },
  // register: envia "register =>" ao provedor para receber chamadas entrantes
  register: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
});

export const Campaign = sequelize.define("Campaign", {
  name: { type: DataTypes.STRING, allowNull: false },
  status: {
    type: DataTypes.ENUM("pending", "in_progress", "completed"),
    allowNull: false,
    defaultValue: "pending",
  },
  intervalSeconds: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 15,
  },
});

export const CampaignExtension = sequelize.define("CampaignExtension", {});
export const CampaignVoipLine = sequelize.define("CampaignVoipLine", {});

export const CampaignContact = sequelize.define("CampaignContact", {
  phoneNumber: { type: DataTypes.STRING, allowNull: false },
});

export const CallLog = sequelize.define("CallLog", {
  phoneNumber: { type: DataTypes.STRING, allowNull: false },
  result: {
    type: DataTypes.ENUM(
      "atendida",
      "nao_atendida",
      "numero_nao_existe",
      "rejeitada",
    ),
    allowNull: false,
    defaultValue: "nao_atendida",
  },
  callUniqueId: { type: DataTypes.STRING, allowNull: true },
  duration: { type: DataTypes.INTEGER, allowNull: true },
  direction: { type: DataTypes.STRING, allowNull: true },
  src: { type: DataTypes.STRING, allowNull: true },
  dst: { type: DataTypes.STRING, allowNull: true },
});

export const CallRecording = sequelize.define("CallRecording", {
  filePath: { type: DataTypes.STRING, allowNull: false },
  durationSeconds: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  callUniqueId: { type: DataTypes.STRING, allowNull: true },
});

export const UraLog = sequelize.define("UraLog", {
  uraRef: { type: DataTypes.STRING, allowNull: true },
  phoneNumber: { type: DataTypes.STRING, allowNull: false },
  selectedOption: { type: DataTypes.STRING, allowNull: true },
  audioPath: { type: DataTypes.STRING, allowNull: true },
  result: { type: DataTypes.STRING, allowNull: false, defaultValue: "pending" },
});

export const UraReverseCampaign = sequelize.define("UraReverseCampaign", {
  name: { type: DataTypes.STRING, allowNull: false },
  status: {
    type: DataTypes.ENUM("draft", "running", "paused", "finished"),
    allowNull: false,
    defaultValue: "draft",
  },
  audioFile: { type: DataTypes.STRING, allowNull: true },
  digitTimeoutSeconds: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 5,
  },
  maxAttempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 2,
  },
  retryIntervalSeconds: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 30,
  },
  concurrentCalls: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 5,
  },
  codec: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "ulaw",
  },
  callTimeoutSeconds: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 25,
  },
  detectVoicemail: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  autoCallback: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  dialTechnology: {
    type: DataTypes.ENUM("SIP"),
    allowNull: false,
    defaultValue: "SIP",
  },
});

export const UraReverseOption = sequelize.define("UraReverseOption", {
  keyDigit: { type: DataTypes.STRING(1), allowNull: false },
  actionType: {
    type: DataTypes.ENUM("transfer_extension", "speak_commercial", "hangup"),
    allowNull: false,
    defaultValue: "hangup",
  },
  targetExtension: { type: DataTypes.STRING, allowNull: true },
});

export const UraReverseContact = sequelize.define("UraReverseContact", {
  phoneNumber: { type: DataTypes.STRING, allowNull: false },
  status: {
    type: DataTypes.ENUM(
      "pending",
      "calling",
      "answered",
      "no_answer",
      "invalid",
      "busy",
      "hangup",
      "finished",
    ),
    allowNull: false,
    defaultValue: "pending",
  },
  attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  selectedOption: { type: DataTypes.STRING, allowNull: true },
  recordingPath: { type: DataTypes.STRING, allowNull: true },
  lastResult: { type: DataTypes.STRING, allowNull: true },
  lastDialedAt: { type: DataTypes.DATE, allowNull: true },
  lockedAt: { type: DataTypes.DATE, allowNull: true },
  completedAt: { type: DataTypes.DATE, allowNull: true },
});

Campaign.belongsToMany(Extension, {
  through: CampaignExtension,
  as: "extensions",
});
Extension.belongsToMany(Campaign, {
  through: CampaignExtension,
  as: "campaigns",
});

Campaign.belongsToMany(VoipLine, {
  through: CampaignVoipLine,
  as: "voipLines",
});
VoipLine.belongsToMany(Campaign, {
  through: CampaignVoipLine,
  as: "campaigns",
});

Campaign.hasMany(CampaignContact, { as: "contacts", foreignKey: "campaignId" });
CampaignContact.belongsTo(Campaign, { foreignKey: "campaignId" });

Campaign.hasMany(CallLog, { as: "calls", foreignKey: "campaignId" });
CallLog.belongsTo(Campaign, { foreignKey: "campaignId" });

Extension.hasMany(CallLog, { foreignKey: "extensionId" });
CallLog.belongsTo(Extension, { foreignKey: "extensionId" });

VoipLine.hasMany(CallLog, { foreignKey: "voipLineId" });
CallLog.belongsTo(VoipLine, { foreignKey: "voipLineId" });

VoipLine.hasMany(Extension, { foreignKey: "voipLineId" });
Extension.belongsTo(VoipLine, { foreignKey: "voipLineId" });

Campaign.hasMany(CallRecording, { foreignKey: "campaignId" });
CallRecording.belongsTo(Campaign, { foreignKey: "campaignId" });

Extension.hasMany(CallRecording, { foreignKey: "extensionId" });
CallRecording.belongsTo(Extension, { foreignKey: "extensionId" });

CallLog.hasMany(CallRecording, { foreignKey: "callLogId" });
CallRecording.belongsTo(CallLog, { foreignKey: "callLogId" });

Campaign.hasMany(UraLog, { foreignKey: "campaignId" });
UraLog.belongsTo(Campaign, { foreignKey: "campaignId" });

Extension.hasMany(UraLog, { foreignKey: "extensionId" });
UraLog.belongsTo(Extension, { foreignKey: "extensionId" });

VoipLine.hasMany(UraReverseCampaign, { foreignKey: "voipLineId" });
UraReverseCampaign.belongsTo(VoipLine, { foreignKey: "voipLineId" });

UraReverseCampaign.hasMany(UraReverseOption, {
  as: "options",
  foreignKey: "campaignId",
  onDelete: "CASCADE",
});
UraReverseOption.belongsTo(UraReverseCampaign, {
  foreignKey: "campaignId",
});

UraReverseCampaign.hasMany(UraReverseContact, {
  as: "contacts",
  foreignKey: "campaignId",
  onDelete: "CASCADE",
});
UraReverseContact.belongsTo(UraReverseCampaign, {
  foreignKey: "campaignId",
});

// ── Filas (Asterisk Queues) ──────────────────────────────────

export const AsteriskQueue = sequelize.define("AsteriskQueue", {
  name: { type: DataTypes.STRING, allowNull: false, unique: true },
  strategy: {
    type: DataTypes.ENUM(
      "ringall", "roundrobin", "leastrecent", "fewestcalls",
      "random", "rrmemory", "linear", "wrandom",
    ),
    allowNull: false,
    defaultValue: "ringall",
  },
  timeout: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
  maxlen: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  wrapuptime: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  musiconhold: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
  announce: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
});

export const AsteriskQueueMember = sequelize.define("AsteriskQueueMember", {
  extensionNumber: { type: DataTypes.STRING, allowNull: false },
  penalty: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
});

AsteriskQueue.hasMany(AsteriskQueueMember, {
  as: "members",
  foreignKey: "queueId",
  onDelete: "CASCADE",
});
AsteriskQueueMember.belongsTo(AsteriskQueue, { foreignKey: "queueId" });

// ── Central Telefônica (URA Receptiva) ───────────────────────

export const InboundIvr = sequelize.define("InboundIvr", {
  name: { type: DataTypes.STRING, allowNull: false },
  contextName: { type: DataTypes.STRING, allowNull: false, unique: true },
  voipLineId: { type: DataTypes.INTEGER, allowNull: true },
  audioFile: { type: DataTypes.STRING, allowNull: true },
  digitTimeoutSeconds: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 5,
  },
  maxInvalidAttempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 3,
  },
  fallbackExtension: { type: DataTypes.STRING, allowNull: true },
  fallbackLabel: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: "Transbordo",
  },
  dialTechnology: {
    type: DataTypes.ENUM("SIP"),
    allowNull: false,
    defaultValue: "SIP",
  },
  scheduleEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  scheduleJson: { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
  closedAudioFile: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
});

export const InboundIvrOption = sequelize.define("InboundIvrOption", {
  keyDigit: { type: DataTypes.STRING(1), allowNull: false },
  label: { type: DataTypes.STRING, allowNull: true },
  actionType: {
    type: DataTypes.ENUM("transfer_extension", "hangup"),
    allowNull: false,
    defaultValue: "transfer_extension",
  },
  targetExtension: { type: DataTypes.STRING, allowNull: true },
});

InboundIvr.hasMany(InboundIvrOption, {
  as: "options",
  foreignKey: "ivrId",
  onDelete: "CASCADE",
});
InboundIvrOption.belongsTo(InboundIvr, { foreignKey: "ivrId" });

VoipLine.hasMany(InboundIvr, { foreignKey: "voipLineId" });
InboundIvr.belongsTo(VoipLine, { foreignKey: "voipLineId" });

export const InboundRoute = sequelize.define("InboundRoute", {
  did: { type: DataTypes.STRING, allowNull: false, unique: true },
  description: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
  destinationType: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "extension",
  },
  destinationTarget: { type: DataTypes.STRING, allowNull: false },
  priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
});

// AgentStatusLog belongs to Extension
Extension.hasMany(AgentStatusLog, { foreignKey: "extensionId", onDelete: "CASCADE" });
AgentStatusLog.belongsTo(Extension, { foreignKey: "extensionId" });

export const syncDatabase = async () => {
  await sequelize.authenticate();

  const { migrator } = await import("./migrator");
  await migrator.up();

  await sequelize.sync();

  // Reset contatos travados em 'calling' após restart inesperado do backend
  const staleThreshold = new Date(Date.now() - 5 * 60 * 1000);
  await UraReverseContact.update(
    { status: "pending", lockedAt: null },
    { where: { status: "calling", lockedAt: { [Op.lt]: staleThreshold } } },
  ).catch(() => {});
};
