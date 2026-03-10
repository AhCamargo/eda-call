const fs = require("fs/promises");
const { asteriskSipCustomFile } = require("../config");
const { runCommand } = require("../ami");

const buildExtensionBlock = (number, secret) =>
  `\n[${number}]\ntype=friend\nhost=dynamic\nsecret=${secret}\ncontext=default\ndisallow=all\nallow=g729\nallow=ulaw\nallow=alaw\ndtmfmode=rfc2833\nnat=force_rport,comedia\ndirectmedia=no\nqualify=yes\nqualifyfreq=30\n\n`;

const buildSipVoipLineBlock = ({
  name,
  username,
  secret,
  host,
  port = 5060,
  context = "default",
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

const ensureFile = async (filePath) => {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, "", "utf-8");
  }
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const upsertNamedBlock = async ({
  filePath,
  sectionName,
  blockContent,
  scope,
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

const removeNamedBlock = async ({ filePath, sectionName, scope }) => {
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

const upsertSipExtension = async ({ number, secret = "1234" }) => {
  const numberText = String(number).trim();
  if (!numberText) {
    throw new Error("Número do ramal inválido");
  }

  await upsertNamedBlock({
    filePath: asteriskSipCustomFile,
    sectionName: numberText,
    blockContent: buildExtensionBlock(numberText, secret),
    scope: "sip-extension",
  });

  try {
    await runCommand("sip reload");
  } catch {}
};

const upsertSipVoipLine = async ({
  name,
  username,
  secret,
  host,
  port = 5060,
  context = "default",
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

const removeExtensionProvision = async ({ number }) => {
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

const removeVoipLineProvision = async ({ name }) => {
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

module.exports = {
  upsertSipExtension,
  upsertSipVoipLine,
  removeExtensionProvision,
  removeVoipLineProvision,
};
