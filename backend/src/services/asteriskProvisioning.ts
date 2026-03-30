import fs from "fs/promises";
import config from "../config";
import { runCommand } from "../ami";

const { asteriskSipCustomFile } = config;

const buildExtensionBlock = (
  number: string,
  secret: string,
  context = "default",
  voipLineName: string | null = null,
) => {
  const setvarLine = voipLineName ? `setvar=VOIPLINE=${voipLineName}\n` : "";
  return `\n[${number}]\ntype=friend\nhost=dynamic\nsecret=${secret}\ncontext=${context}\n${setvarLine}disallow=all\nallow=ulaw\nallow=alaw\ndtmfmode=rfc2833\nnat=force_rport,comedia\ndirectmedia=no\nqualify=yes\nqualifyfreq=30\n\n`;
};

const buildSipVoipLineBlock = ({
  name,
  username,
  secret,
  host,
  port = 5060,
  context = "default",
}: {
  name: string;
  username: string;
  secret: string;
  host: string;
  port?: number;
  context?: string;
}) => `
[${name}]
type=peer
host=${host}
port=${port}
username=${username}
fromuser=${username}
secret=${secret}
context=${context}
disallow=all
allow=ulaw
allow=alaw
insecure=invite,port
qualify=yes
`;

const ensureFile = async (filePath: string) => {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, "", "utf-8");
  }
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

const removeNamedBlock = async ({ filePath, sectionName, scope }: {
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
}: {
  name: string;
  username: string;
  secret: string;
  host: string;
  port?: number;
  context?: string;
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
    }),
    scope: "sip-voip-line",
  });

  try {
    await runCommand("sip reload");
  } catch {}
};

export const removeExtensionProvision = async ({ number }: { number: string }) => {
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
