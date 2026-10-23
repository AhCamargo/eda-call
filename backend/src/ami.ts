// eslint-disable-next-line @typescript-eslint/no-require-imports
const AsteriskManager = require("asterisk-manager");
import config from "./config";
import { signUraCallback } from "./utils/network";

const { ami: amiConfig, backendInternalUrl } = config;

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

// ── Resultado real de um Originate assíncrono ────────────────────────────
// Com Async: true a resposta da ação só diz "queued"; o desfecho chega depois
// no evento OriginateResponse (mesmo ActionID). Atenção: o asterisk-manager
// entrega os campos dos eventos em minúsculas (event.event, event.reason,
// event.uniqueid) — nunca Event/Reason/Uniqueid.
export type OriginateOutcome =
  | "answered"
  | "no_answer"
  | "busy"
  | "rejected"
  | "invalid"
  | "failed";

// Campo Reason do OriginateResponse (códigos AST_CONTROL_* do Asterisk).
const REASON_TO_OUTCOME: Record<number, OriginateOutcome> = {
  4: "answered",
  3: "no_answer", // tocou até o tempo limite
  5: "busy",
  1: "rejected", // desligou/recusou antes de atender
  8: "invalid", // congestionamento: número inexistente ou rota indisponível
  0: "failed",
};

export const newActionId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Registre ANTES de enviar o Originate para não perder o evento.
export const watchOriginate = (actionId: string, timeoutMs: number) => {
  const client = getAmiClient();
  let handler: (event: any) => void = () => {};
  let timer: ReturnType<typeof setTimeout>;
  const cancel = () => {
    clearTimeout(timer);
    client.removeListener("managerevent", handler);
  };
  const result = new Promise<{ outcome: OriginateOutcome; uniqueid: string | null }>(
    (resolve) => {
      timer = setTimeout(() => {
        cancel();
        resolve({ outcome: "no_answer", uniqueid: null });
      }, timeoutMs);
      handler = (event: any) => {
        if (String(event.event || "").toLowerCase() !== "originateresponse") return;
        if (String(event.actionid || "") !== actionId) return;
        cancel();
        const answered = String(event.response || "").toLowerCase() === "success";
        const outcome = answered
          ? "answered"
          : REASON_TO_OUTCOME[Number(event.reason)] ?? "failed";
        const uid = String(event.uniqueid || "");
        resolve({ outcome, uniqueid: uid && uid !== "<null>" ? uid : null });
      };
      client.on("managerevent", handler);
    },
  );
  return { result, cancel };
};

// Espera a ligação terminar (evento Hangup do canal).
export const waitForHangup = (uniqueid: string, timeoutMs: number) =>
  new Promise<void>((resolve) => {
    const client = getAmiClient();
    const handler = (event: any) => {
      if (String(event.event || "").toLowerCase() !== "hangup") return;
      if (event.uniqueid !== uniqueid && event.linkedid !== uniqueid) return;
      done();
    };
    const timer = setTimeout(() => done(), timeoutMs);
    const done = () => {
      clearTimeout(timer);
      client.removeListener("managerevent", handler);
      resolve();
    };
    client.on("managerevent", handler);
  });

export const originateCall = (
  phoneNumber: string,
  extensionNumber = "1000",
  voipLineName: string | null = null,
  actionId?: string,
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
        ...(actionId ? { actionid: actionId } : {}),
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
  actionId,
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
  actionId?: string;
}) => {
  const client = getAmiClient();
  const channel = voipLineName
    ? `SIP/${voipLineName}/${phoneNumber}`
    : `SIP/${phoneNumber}`;

  // Cada variável precisa ser um elemento separado no array.
  // O asterisk-manager envia um header "Variable:" por elemento,
  // que é o único formato que o AMI parse corretamente como variáveis individuais.
  // Não use .join("|") — o Asterisk trataria a string inteira como valor de APP_PHONE.
  const vars = [
    `APP_PHONE=${phoneNumber}`,
    `APP_CAMPAIGN_ID=${campaignId || ""}`,
    `APP_EXTENSION_ID=${extensionId || ""}`,
    `APP_TARGET_EXTEN=${targetExtension || "2001"}`,
    `APP_TARGET_EXTEN_1=${option1TargetExtension || ""}`,
    `APP_TARGET_EXTEN_2=${option2TargetExtension || ""}`,
    `APP_TARGET_EXTEN_3=${option3TargetExtension || ""}`,
    `APP_DIAL_TECH=${channelTechnology}`,
    `APP_URA_PROMPT=${promptAudio || "custom/edacall-menu-ptbr"}`,
    `APP_DIGIT_TIMEOUT=${digitTimeoutSeconds || 5}`,
    `APP_URA_REF=${uraRef}`,
    `URA_CALLBACK_URL=${backendInternalUrl}/internal/ura/log?sig=${signUraCallback(uraRef)}`,
    ...Object.entries(extraVariables).map(
      ([key, value]) => `${key}=${value == null ? "" : value}`,
    ),
  ];

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
        ...(actionId ? { actionid: actionId } : {}),
      },
      (err: any, response: any) => {
        if (err) return reject(err);
        return resolve(response);
      },
    );
  });
};
