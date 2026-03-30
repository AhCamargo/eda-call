import { Sequelize, DataTypes } from "sequelize";
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
    ),
    allowNull: false,
    defaultValue: "offline",
  },
  voipLineId: { type: DataTypes.INTEGER, allowNull: true },
});

export const VoipLine = sequelize.define("VoipLine", {
  name: { type: DataTypes.STRING, allowNull: false, unique: true },
  username: { type: DataTypes.STRING, allowNull: false },
  secret: { type: DataTypes.STRING, allowNull: false },
  host: { type: DataTypes.STRING, allowNull: false },
  port: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5060 },
  context: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "default",
  },
  transport: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "transport-udp",
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
    type: DataTypes.ENUM("PJSIP", "SIP"),
    allowNull: false,
    defaultValue: "PJSIP",
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

export const syncDatabase = async () => {
  await sequelize.authenticate();
  await sequelize
    .query(
      "ALTER TYPE \"enum_Users_role\" ADD VALUE IF NOT EXISTS 'supervisor'",
    )
    .catch(() => {});
  await sequelize
    .query(
      "ALTER TYPE \"enum_Extensions_status\" ADD VALUE IF NOT EXISTS 'ringing'",
    )
    .catch(() => {});
  await sequelize
    .query(
      'ALTER TABLE "Extensions" ADD COLUMN IF NOT EXISTS "pauseReason" VARCHAR(255)',
    )
    .catch(() => {});
  await sequelize
    .query(
      'ALTER TABLE "Extensions" ADD COLUMN IF NOT EXISTS "voipLineId" INTEGER',
    )
    .catch(() => {});
  await sequelize
    .query(
      `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'CallLogs' AND column_name = 'campaignId'
        ) THEN
          ALTER TABLE "CallLogs" ADD COLUMN "campaignId" INTEGER;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'CallLogs' AND column_name = 'extensionId'
        ) THEN
          ALTER TABLE "CallLogs" ADD COLUMN "extensionId" INTEGER;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'CallLogs' AND column_name = 'voipLineId'
        ) THEN
          ALTER TABLE "CallLogs" ADD COLUMN "voipLineId" INTEGER;
        END IF;

        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'CallLogs' AND column_name = 'CampaignId'
        ) THEN
          UPDATE "CallLogs" SET "campaignId" = "CampaignId" WHERE "campaignId" IS NULL;
        END IF;

        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'CallLogs' AND column_name = 'ExtensionId'
        ) THEN
          UPDATE "CallLogs" SET "extensionId" = "ExtensionId" WHERE "extensionId" IS NULL;
        END IF;

        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'CallLogs' AND column_name = 'VoipLineId'
        ) THEN
          UPDATE "CallLogs" SET "voipLineId" = "VoipLineId" WHERE "voipLineId" IS NULL;
        END IF;
      END $$;
    `,
    )
    .catch(() => {});
  await sequelize
    .query(
      `CREATE TABLE IF NOT EXISTS "CallRecordings" ("id" SERIAL , "filePath" VARCHAR(255) NOT NULL, "durationSeconds" INTEGER NOT NULL DEFAULT 0, "callUniqueId" VARCHAR(255), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "campaignId" INTEGER REFERENCES "Campaigns" ("id") ON DELETE SET NULL ON UPDATE CASCADE, "extensionId" INTEGER REFERENCES "Extensions" ("id") ON DELETE SET NULL ON UPDATE CASCADE, "callLogId" INTEGER REFERENCES "CallLogs" ("id") ON DELETE SET NULL ON UPDATE CASCADE, PRIMARY KEY ("id"))`,
    )
    .catch(() => {});
  await sequelize
    .query(
      `CREATE TABLE IF NOT EXISTS "UraLogs" ("id" SERIAL , "phoneNumber" VARCHAR(255) NOT NULL, "selectedOption" VARCHAR(255), "audioPath" VARCHAR(255), "result" VARCHAR(255) NOT NULL DEFAULT 'pending', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "campaignId" INTEGER REFERENCES "Campaigns" ("id") ON DELETE SET NULL ON UPDATE CASCADE, "extensionId" INTEGER REFERENCES "Extensions" ("id") ON DELETE SET NULL ON UPDATE CASCADE, PRIMARY KEY ("id"))`,
    )
    .catch(() => {});
  await sequelize
    .query(
      'ALTER TABLE "UraLogs" ADD COLUMN IF NOT EXISTS "uraRef" VARCHAR(255)',
    )
    .catch(() => {});
  await sequelize
    .query(
      `CREATE TABLE IF NOT EXISTS "UraReverseCampaigns" (
        "id" SERIAL,
        "name" VARCHAR(255) NOT NULL,
        "status" VARCHAR(50) NOT NULL DEFAULT 'draft',
        "audioFile" VARCHAR(255),
        "digitTimeoutSeconds" INTEGER NOT NULL DEFAULT 5,
        "maxAttempts" INTEGER NOT NULL DEFAULT 2,
        "retryIntervalSeconds" INTEGER NOT NULL DEFAULT 30,
        "concurrentCalls" INTEGER NOT NULL DEFAULT 5,
        "codec" VARCHAR(30) NOT NULL DEFAULT 'ulaw',
        "callTimeoutSeconds" INTEGER NOT NULL DEFAULT 25,
        "detectVoicemail" BOOLEAN NOT NULL DEFAULT FALSE,
        "autoCallback" BOOLEAN NOT NULL DEFAULT FALSE,
        "dialTechnology" VARCHAR(10) NOT NULL DEFAULT 'PJSIP',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "voipLineId" INTEGER REFERENCES "VoipLines" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
        PRIMARY KEY ("id")
      )`,
    )
    .catch(() => {});
  await sequelize
    .query(
      `CREATE TABLE IF NOT EXISTS "UraReverseOptions" (
        "id" SERIAL,
        "keyDigit" VARCHAR(1) NOT NULL,
        "actionType" VARCHAR(50) NOT NULL DEFAULT 'hangup',
        "targetExtension" VARCHAR(255),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "campaignId" INTEGER REFERENCES "UraReverseCampaigns" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        PRIMARY KEY ("id")
      )`,
    )
    .catch(() => {});
  await sequelize
    .query(
      `CREATE TABLE IF NOT EXISTS "UraReverseContacts" (
        "id" SERIAL,
        "phoneNumber" VARCHAR(255) NOT NULL,
        "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
        "attempts" INTEGER NOT NULL DEFAULT 0,
        "selectedOption" VARCHAR(255),
        "recordingPath" VARCHAR(255),
        "lastResult" VARCHAR(255),
        "lastDialedAt" TIMESTAMP WITH TIME ZONE,
        "lockedAt" TIMESTAMP WITH TIME ZONE,
        "completedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "campaignId" INTEGER REFERENCES "UraReverseCampaigns" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        PRIMARY KEY ("id")
      )`,
    )
    .catch(() => {});
  await sequelize
    .query(
      'ALTER TABLE "UraReverseContacts" ADD COLUMN IF NOT EXISTS "selectedOption" VARCHAR(255)',
    )
    .catch(() => {});
  await sequelize
    .query(
      'ALTER TABLE "UraReverseContacts" ADD COLUMN IF NOT EXISTS "recordingPath" VARCHAR(255)',
    )
    .catch(() => {});
  await sequelize.sync();
};
