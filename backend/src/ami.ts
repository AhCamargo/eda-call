// eslint-disable-next-line @typescript-eslint/no-require-imports
const AsteriskManager = require("asterisk-manager");
import config from "./config";

const { ami: amiConfig, backendInternalUrl, internalApiKey } = config;

let amiClient: any = null;

export const getAmiClient = () => {
  if (amiClient) {
    return amiClient;
  }

  amiClient = new AsteriskManager(
    amiConfig.port,
    amiConfig.host,
    amiConfig.username,
    amiConfig.password,
    true,
  );

  amiClient.keepConnected();
  return amiClient;
};

export const originateCall = (
  phoneNumber: string,
  extensionNumber = "1000",
  voipLineName: string | null = null,
) => {
  const client = getAmiClient();
  const channel = voipLineName
    ? `SIP/${voipLineName}/${phoneNumber}`
    : `SIP/${phoneNumber}`;

  return new Promise((resolve, reject) => {
    client.action(
      {
        Action: "Originate",
        Channel: channel,
        Context: "default",
        Exten: extensionNumber,
        Priority: 1,
        CallerID: extensionNumber,
        Async: true,
      },
      (err: any, response: any) => {
        if (err) return reject(err);
        return resolve(response);
      },
    );
  });
};

export const runCommand = (command: string) => {
  const client = getAmiClient();

  return new Promise((resolve, reject) => {
    client.action(
      {
        Action: "Command",
        Command: command,
      },
      (err: any, response: any) => {
        if (err) return reject(err);
        return resolve(response);
      },
    );
  });
};

export const originateReverseIvr = ({
  phoneNumber,
  voipLineName = null,
  campaignId = null,
  extensionId = null,
  targetExtension = "2001",
  option1TargetExtension = null,
  option2TargetExtension = null,
  option3TargetExtension = null,
  promptAudio = "custom/edacall-menu-ptbr",
  channelTechnology = "SIP",
  timeoutMs = 30000,
  digitTimeoutSeconds = 5,
  extraVariables = {},
  uraRef,
}: {
  phoneNumber: string;
  voipLineName?: string | null;
  campaignId?: string | number | null;
  extensionId?: string | number | null;
  targetExtension?: string;
  option1TargetExtension?: string | null;
  option2TargetExtension?: string | null;
  option3TargetExtension?: string | null;
  promptAudio?: string;
  channelTechnology?: string;
  timeoutMs?: number;
  digitTimeoutSeconds?: number;
  extraVariables?: Record<string, any>;
  uraRef: string;
}) => {
  const client = getAmiClient();
  const tech = String(channelTechnology || "SIP").toUpperCase();
  const channel = voipLineName
    ? tech === "PJSIP"
      ? `PJSIP/${phoneNumber}@${voipLineName}`
      : `SIP/${voipLineName}/${phoneNumber}`
    : `${tech}/${phoneNumber}`;

  const vars = [
    `APP_PHONE=${phoneNumber}`,
    `APP_CAMPAIGN_ID=${campaignId || ""}`,
    `APP_EXTENSION_ID=${extensionId || ""}`,
    `APP_TARGET_EXTEN=${targetExtension || "2001"}`,
    `APP_TARGET_EXTEN_1=${option1TargetExtension || ""}`,
    `APP_TARGET_EXTEN_2=${option2TargetExtension || ""}`,
    `APP_TARGET_EXTEN_3=${option3TargetExtension || ""}`,
    `APP_DIAL_TECH=${tech}`,
    `APP_URA_PROMPT=${promptAudio || "custom/edacall-menu-ptbr"}`,
    `APP_DIGIT_TIMEOUT=${digitTimeoutSeconds || 5}`,
    `APP_URA_REF=${uraRef}`,
    `URA_CALLBACK_URL=${backendInternalUrl}/internal/ura/log`,
    `URA_INTERNAL_KEY=${internalApiKey}`,
    ...Object.entries(extraVariables).map(
      ([key, value]) => `${key}=${value == null ? "" : value}`,
    ),
  ].join("|");

  return new Promise((resolve, reject) => {
    client.action(
      {
        Action: "Originate",
        Channel: channel,
        Context: "ura-reversa",
        Exten: "s",
        Priority: 1,
        CallerID: String(phoneNumber),
        Async: true,
        Timeout: Number(timeoutMs) || 30000,
        Variable: vars,
      },
      (err: any, response: any) => {
        if (err) return reject(err);
        return resolve(response);
      },
    );
  });
};
