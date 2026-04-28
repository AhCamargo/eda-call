import fs from "fs/promises";
import config from "../config";
import { runCommand } from "../ami";

const {
  asteriskSipCustomFile,
  asteriskExtensionsCustomFile,
  asteriskQueuesCustomFile,
} = config;

const buildExtensionBlock = (
  number: string,
  secret: string,
  context = "default",
  voipLineName: string | null = null,
) => {
  const setvarLine = voipLineName ? `setvar=VOIPLINE=${voipLineName}\n` : "";
  return `\n[${number}]\ntype=friend\nhost=dynamic\nsecret=${secret}\ncontext=${context}\n${setvarLine}disallow=all\nallow=ulaw\nallow=alaw\ndtmfmode=rfc2833\ndirectmedia=no\nqualify=yes\nqualifyfreq=30\n\n`;
};

const buildSipVoipLineBlock = ({
  name,
  username,
  secret,
  host,
  port = 5060,
  context = "default",
  inboundContext,
  type = "peer",
  dtmfmode = "rfc2833",
  fromdomain,
  codecs = "ulaw,alaw",
  callLimit = 0,
  insecure = "invite,port",
}: {
  name: string;
  username: string;
  secret: string;
  host: string;
  port?: number;
  context?: string;
  inboundContext?: string | null;
  type?: string;
  dtmfmode?: string;
  fromdomain?: string | null;
  codecs?: string;
  callLimit?: number;
  insecure?: string | null;
}) => {
  // Monta as linhas allow= para cada codec
  const codecList = (codecs || "ulaw,alaw")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const allowLines = codecList.map((c) => `allow=${c}`).join("\n");

  // fromdomain e domain (alguns provedores exigem)
  const fromdomainLine = fromdomain
    ? `fromdomain=${fromdomain}\ndomain=${fromdomain}`
    : "";

  // insecure (pode ser vazio para troncos que exigem autenticação)
  const insecureLine = insecure ? `insecure=${insecure}` : "";

  // call-limit (0 = sem limite, não escreve a linha)
  const callLimitLine = callLimit > 0 ? `call-limit=${callLimit}` : "";

  // Se definido, adiciona contexto de entrada (inboundContext) comentado para referência
  const inboundContextComment = inboundContext
    ? `; Contexto de entrada (URA/receptivo): ${inboundContext}`
    : "";

  return (
    `
[${name}]
type=${type}
host=${host}
port=${port}
defaultuser=${username}
fromuser=${username}
${fromdomainLine}
secret=${secret}
context=${context}
${inboundContextComment}
disallow=all
${allowLines}
${insecureLine}
qualify=yes
directmedia=no
dtmfmode=${dtmfmode}
${callLimitLine}
`
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
};

const ensureFile = async (filePath: string) => {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, "", "utf-8");
  }
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const upsertNamedBlock = async ({
  filePath,
  sectionName,
  blockContent,
  scope,
}: {
  filePath: string;
  sectionName: string;
  blockContent: string;
  scope: string;
}) => {
  await ensureFile(filePath);
  const content = await fs.readFile(filePath, "utf-8");

  const markerId = `${scope}:${sectionName}`;
  const beginMarker = `; BEGIN EDACALL ${markerId}`;
  const endMarker = `; END EDACALL ${markerId}`;
  const markerRegex = new RegExp(
    `${escapeRegExp(beginMarker)}[\\s\\S]*?${escapeRegExp(endMarker)}`,
    "m",
  );
  const wrappedBlock = `${beginMarker}\n${blockContent.trim()}\n${endMarker}`;

  const updated = markerRegex.test(content)
    ? content.replace(markerRegex, wrappedBlock)
    : `${content.trimEnd()}\n\n${wrappedBlock}\n`;

  await fs.writeFile(filePath, `${updated.trimEnd()}\n`, "utf-8");
};

const removeNamedBlock = async ({
  filePath,
  sectionName,
  scope,
}: {
  filePath: string;
  sectionName: string;
  scope: string;
}) => {
  await ensureFile(filePath);
  const content = await fs.readFile(filePath, "utf-8");

  const markerId = `${scope}:${sectionName}`;
  const beginMarker = `; BEGIN EDACALL ${markerId}`;
  const endMarker = `; END EDACALL ${markerId}`;
  const markerRegex = new RegExp(
    `\\n?${escapeRegExp(beginMarker)}[\\s\\S]*?${escapeRegExp(endMarker)}\\n?`,
    "m",
  );

  const updated = content.replace(markerRegex, "\n");
  await fs.writeFile(filePath, `${updated.trimEnd()}\n`, "utf-8");
};

// ─────────────────────────────────────────────────────────

export const upsertSipExtension = async ({
  number,
  secret = "1234",
  context = "default",
  voipLineName = null,
}: {
  number: string;
  secret?: string;
  context?: string;
  voipLineName?: string | null;
}) => {
  const numberText = String(number).trim();
  if (!numberText) {
    throw new Error("Número do ramal inválido");
  }

  await upsertNamedBlock({
    filePath: asteriskSipCustomFile,
    sectionName: numberText,
    blockContent: buildExtensionBlock(
      numberText,
      secret,
      context,
      voipLineName,
    ),
    scope: "sip-extension",
  });

  try {
    await runCommand("sip reload");
  } catch {}
};

export const upsertSipVoipLine = async ({
  name,
  username,
  secret,
  host,
  port = 5060,
  context = "default",
  inboundContext,
  type = "peer",
  dtmfmode = "rfc2833",
  fromdomain,
  codecs = "ulaw,alaw",
  callLimit = 0,
  insecure = "invite,port",
}: {
  name: string;
  username: string;
  secret: string;
  host: string;
  port?: number;
  context?: string;
  inboundContext?: string | null;
  type?: string;
  dtmfmode?: string;
  fromdomain?: string | null;
  codecs?: string;
  callLimit?: number;
  insecure?: string | null;
}) => {
  const lineName = String(name || "").trim();
  if (!lineName) {
    throw new Error("Nome da linha VoIP inválido");
  }

  if (!username || !secret || !host) {
    throw new Error("Linha VoIP requer username, secret e host");
  }

  await upsertNamedBlock({
    filePath: asteriskSipCustomFile,
    sectionName: lineName,
    blockContent: buildSipVoipLineBlock({
      name: lineName,
      username,
      secret,
      host,
      port,
      context,
      inboundContext,
      type,
      dtmfmode,
      fromdomain,
      codecs,
      callLimit,
      insecure,
    }),
    scope: "sip-voip-line",
  });

  try {
    await runCommand("sip reload");
  } catch {}
};

export const removeExtensionProvision = async ({
  number,
}: {
  number: string;
}) => {
  const numberText = String(number).trim();
  if (!numberText) {
    return;
  }

  await removeNamedBlock({
    filePath: asteriskSipCustomFile,
    sectionName: numberText,
    scope: "sip-extension",
  });

  try {
    await runCommand("sip reload");
  } catch {}
};

export const removeVoipLineProvision = async ({ name }: { name: string }) => {
  const lineName = String(name || "").trim();
  if (!lineName) {
    return;
  }

  await removeNamedBlock({
    filePath: asteriskSipCustomFile,
    sectionName: lineName,
    scope: "sip-voip-line",
  });

  try {
    await runCommand("sip reload");
  } catch {}
};

// ─────────────────────────────────────────────────────────
// Central Telefônica (URA Receptiva) – dialplan
// ─────────────────────────────────────────────────────────

interface InboundIvrOptionParam {
  keyDigit: string;
  label?: string | null;
  actionType: string;
  targetExtension?: string | null;
}

const buildInboundIvrDialplan = ({
  contextName,
  name,
  audioFile,
  digitTimeoutSeconds,
  maxInvalidAttempts,
  fallbackExtension,
  fallbackLabel,
  dialTechnology,
  options,
}: {
  contextName: string;
  name: string;
  audioFile?: string | null;
  digitTimeoutSeconds: number;
  maxInvalidAttempts: number;
  fallbackExtension?: string | null;
  fallbackLabel?: string | null;
  dialTechnology: string;
  options: InboundIvrOptionParam[];
}) => {
  const audio = audioFile || "silence/1";
  const tech = (dialTechnology || "SIP").toUpperCase();
  const fallback = fallbackExtension ? String(fallbackExtension).trim() : null;
  const fbLabel = fallbackLabel || "Transbordo";

  const optionLines = options
    .map((opt) => {
      const digit = String(opt.keyDigit).trim();
      const lbl = opt.label || `Opção ${digit}`;
      if (opt.actionType === "hangup" || !opt.targetExtension) {
        return `exten => ${digit},1,NoOp(${contextName}: ${lbl} - desligar)\n same => n,Hangup()`;
      }
      const target = String(opt.targetExtension).trim();
      if (opt.actionType === "transfer_queue") {
        return `exten => ${digit},1,NoOp(${contextName}: ${lbl} -> fila ${target})\n same => n,Queue(${target},t,,,,60)\n same => n,Hangup()`;
      }
      return `exten => ${digit},1,NoOp(${contextName}: ${lbl} -> ${target})\n same => n,Dial(SIP/${target},30)\n same => n,Hangup()`;
    })
    .join("\n\n");

  const fallbackBlock = fallback
    ? `exten => transbordo,1,NoOp(${contextName}: ${fbLabel} -> ${fallback})\n same => n,Dial(${tech}/${fallback},30)\n same => n,Hangup()`
    : `exten => transbordo,1,NoOp(${contextName}: sem transbordo configurado)\n same => n,Hangup()`;

  return `
[${contextName}]
exten => s,1,NoOp(URA Receptiva: ${name})
 same => n,Answer()
 same => n,Wait(1)
 same => n,Set(ATTEMPTS=0)
 same => n(menu),Set(ATTEMPTS=\$[\${ATTEMPTS}+1])
 same => n,Background(${audio})
 same => n,WaitExten(${digitTimeoutSeconds})
 same => n,Goto(transbordo,1)

${optionLines}

exten => i,1,NoOp(Opcao invalida - tentativa \${ATTEMPTS} de ${maxInvalidAttempts})
 same => n,GotoIf(\$[\${ATTEMPTS} >= ${maxInvalidAttempts}]?transbordo,1)
 same => n,Goto(s,menu)

exten => t,1,NoOp(Timeout waiting for digit)
 same => n,Goto(transbordo,1)

${fallbackBlock}
`;
};

export const upsertInboundIvrDialplan = async (params: {
  contextName: string;
  name: string;
  audioFile?: string | null;
  digitTimeoutSeconds: number;
  maxInvalidAttempts: number;
  fallbackExtension?: string | null;
  fallbackLabel?: string | null;
  dialTechnology: string;
  options: InboundIvrOptionParam[];
}) => {
  const contextName = String(params.contextName || "").trim();
  if (!contextName) throw new Error("contextName é obrigatório");

  const blockContent = buildInboundIvrDialplan(params);

  await upsertNamedBlock({
    filePath: asteriskExtensionsCustomFile,
    sectionName: contextName,
    blockContent,
    scope: "inbound-ivr",
  });

  try {
    await runCommand("dialplan reload");
  } catch {}
};

export const removeInboundIvrDialplan = async ({
  contextName,
}: {
  contextName: string;
}) => {
  const ctx = String(contextName || "").trim();
  if (!ctx) return;

  await removeNamedBlock({
    filePath: asteriskExtensionsCustomFile,
    sectionName: ctx,
    scope: "inbound-ivr",
  });

  try {
    await runCommand("dialplan reload");
  } catch {}
};

// ─────────────────────────────────────────────────────────
// Roteamento de entrada do tronco (trunk inbound route)
// Atualiza o contexto do tronco para rotear chamadas entrantes
// para o IVR configurado na central telefônica.
// ─────────────────────────────────────────────────────────

export const upsertTrunkInboundRoute = async ({
  trunkContext,
  ivrContext,
}: {
  trunkContext: string;
  ivrContext: string;
}) => {
  const trunk = String(trunkContext || "").trim();
  const ivr = String(ivrContext || "").trim();
  if (!trunk || !ivr) return;

  const blockContent = `
[${trunk}]
; Inbound do tronco: roteia para a central configurada
exten => s,1,NoOp(Chamada entrante ${trunk} -> ${ivr})
 same => n,Goto(${ivr},s,1)
include => local-ramais
`;

  await upsertNamedBlock({
    filePath: asteriskExtensionsCustomFile,
    sectionName: trunk,
    blockContent,
    scope: "trunk-inbound-route",
  });

  try {
    await runCommand("dialplan reload");
  } catch {}
};

export const removeTrunkInboundRoute = async ({
  trunkContext,
}: {
  trunkContext: string;
}) => {
  const trunk = String(trunkContext || "").trim();
  if (!trunk) return;

  await removeNamedBlock({
    filePath: asteriskExtensionsCustomFile,
    sectionName: trunk,
    scope: "trunk-inbound-route",
  });

  try {
    await runCommand("dialplan reload");
  } catch {}
};

// ─────────────────────────────────────────────────────────
// Filas (Asterisk Queues) — queues_custom.conf
// ─────────────────────────────────────────────────────────

const buildQueueBlock = ({
  name,
  strategy,
  timeout,
  maxlen,
  wrapuptime,
  musiconhold,
  announce,
  members,
}: {
  name: string;
  strategy: string;
  timeout: number;
  maxlen: number;
  wrapuptime: number;
  musiconhold?: string | null;
  announce?: string | null;
  members: Array<{ extensionNumber: string; penalty: number }>;
}) => {
  const lines: string[] = [
    `[${name}]`,
    `strategy=${strategy}`,
    `timeout=${timeout}`,
    `maxlen=${maxlen}`,
    `wrapuptime=${wrapuptime}`,
    `joinempty=yes`,
    `leavewhenempty=no`,
    `ringinuse=no`,
  ];
  if (musiconhold) lines.push(`musiconhold=${musiconhold}`);
  if (announce) lines.push(`announce=${announce}`);
  for (const m of members) {
    lines.push(`member => SIP/${m.extensionNumber},${m.penalty}`);
  }
  return lines.join("\n");
};

const ensureQueuesHeader = async () => {
  await ensureFile(asteriskQueuesCustomFile);
  const content = await fs.readFile(asteriskQueuesCustomFile, "utf-8");
  if (!content.includes("[general]")) {
    await fs.writeFile(
      asteriskQueuesCustomFile,
      `[general]\npersistentmembers=yes\nautofill=yes\nmonitor-format=wav\nshared_lastcall=yes\n\n${content}`,
      "utf-8",
    );
  }
};

export const upsertQueue = async ({
  name,
  strategy = "ringall",
  timeout = 30,
  maxlen = 0,
  wrapuptime = 0,
  musiconhold = null,
  announce = null,
  members = [],
}: {
  name: string;
  strategy?: string;
  timeout?: number;
  maxlen?: number;
  wrapuptime?: number;
  musiconhold?: string | null;
  announce?: string | null;
  members?: Array<{ extensionNumber: string; penalty: number }>;
}) => {
  const queueName = String(name || "").trim();
  if (!queueName) throw new Error("Nome da fila é obrigatório");

  await ensureQueuesHeader();

  const blockContent = buildQueueBlock({
    name: queueName,
    strategy,
    timeout,
    maxlen,
    wrapuptime,
    musiconhold,
    announce,
    members,
  });

  await upsertNamedBlock({
    filePath: asteriskQueuesCustomFile,
    sectionName: queueName,
    blockContent,
    scope: "queue",
  });

  try {
    await runCommand("queue reload all");
  } catch {}
};

export const removeQueue = async ({ name }: { name: string }) => {
  const queueName = String(name || "").trim();
  if (!queueName) return;

  await removeNamedBlock({
    filePath: asteriskQueuesCustomFile,
    sectionName: queueName,
    scope: "queue",
  });

  try {
    await runCommand("queue reload all");
  } catch {}
};
