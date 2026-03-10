const AsteriskManager = require("asterisk-manager");
const {
  ami: amiConfig,
  backendInternalUrl,
  internalApiKey,
} = require("./config");

let amiClient = null;

const getAmiClient = () => {
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

const originateCall = (
  phoneNumber,
  extensionNumber = "1000",
  voipLineName = null,
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
      (err, response) => {
        if (err) return reject(err);
        return resolve(response);
      },
    );
  });
};

const runCommand = (command) => {
  const client = getAmiClient();

  return new Promise((resolve, reject) => {
    client.action(
      {
        Action: "Command",
        Command: command,
      },
      (err, response) => {
        if (err) return reject(err);
        return resolve(response);
      },
    );
  });
};

const originateReverseIvr = ({
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
      (err, response) => {
        if (err) return reject(err);
        return resolve(response);
      },
    );
  });
};

module.exports = {
  getAmiClient,
  originateCall,
  originateReverseIvr,
  runCommand,
};
