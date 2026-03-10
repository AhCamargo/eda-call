const { getAmiClient } = require("../ami");
const { runCommand } = require("../ami");
const { Extension } = require("../db");

let started = false;
let extensionsCache = [];
let cacheAt = 0;
let pollInterval = null;

const CACHE_TTL_MS = 10000;
const POLL_INTERVAL_MS = 3000;

const loadExtensions = async () => {
  if (Date.now() - cacheAt < CACHE_TTL_MS && extensionsCache.length) {
    return extensionsCache;
  }

  const extensions = await Extension.findAll({
    attributes: ["id", "number", "status"],
  });

  extensionsCache = extensions
    .map((ext) => ({ id: ext.id, number: ext.number, status: ext.status }))
    .sort((a, b) => b.number.length - a.number.length);
  cacheAt = Date.now();
  return extensionsCache;
};

const extensionNumberFromChannel = (channel, extensionNumbers) => {
  if (!channel || typeof channel !== "string" || !channel.startsWith("SIP/")) {
    return null;
  }

  const content = channel.slice(4);
  const contentUpper = content.toUpperCase();
  for (const extNumber of extensionNumbers) {
    const extUpper = String(extNumber).toUpperCase();

    if (contentUpper === extUpper) {
      return extNumber;
    }

    if (
      contentUpper.startsWith(`${extUpper}-`) ||
      contentUpper.startsWith(`${extUpper}/`)
    ) {
      return extNumber;
    }
  }

  return null;
};

const getEventChannels = (event) => {
  const values = [
    event.Channel,
    event.DestChannel,
    event.Channel1,
    event.Channel2,
    event.Source,
    event.Destination,
  ].filter(Boolean);

  return [...new Set(values)];
};

const normalizeCommandOutput = (response) => {
  if (!response) return [];

  const output = response.Output ?? response.output;
  const message = response.Message ?? response.message;

  if (Array.isArray(output)) {
    return output.map((line) => String(line || ""));
  }

  if (typeof output === "string") {
    return output.split("\n");
  }

  if (typeof message === "string") {
    return message.split("\n");
  }

  return String(response)
    .split("\n")
    .map((line) => String(line || ""));
};

const parsePeersOnlineMap = (lines, extensionNumbersSet) => {
  const map = new Map();

  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed || trimmed.startsWith("Name/username")) {
      continue;
    }

    const nameField = trimmed.split(/\s+/)[0] || "";
    const candidate = nameField.split("/")[0];

    if (!candidate || !extensionNumbersSet.has(candidate)) {
      continue;
    }

    const lowerLine = trimmed.toLowerCase();
    const isOnline =
      lowerLine.includes(" ok (") ||
      lowerLine.includes(" unmonitored") ||
      lowerLine.includes(" reachable");

    map.set(candidate, isOnline);
  }

  return map;
};

const parseCallStatusMap = (lines, extensionNumbers, extensionNumbersSet) => {
  const map = new Map();

  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed || !trimmed.includes("!")) {
      continue;
    }

    const parts = trimmed.split("!");
    const channel = parts[0] || "";
    const dialedExt = parts[2] || "";
    const channelState = String(parts[4] || "").toLowerCase();

    const candidates = [];
    if (channel.startsWith("SIP/")) {
      const channelExtension = extensionNumberFromChannel(
        channel,
        extensionNumbers,
      );
      if (channelExtension) {
        candidates.push(channelExtension);
      }
    }
    candidates.push(String(dialedExt || "").trim());

    for (const candidate of candidates) {
      const normalizedCandidate = String(candidate || "").toUpperCase();
      const matchedExtension = extensionNumbers.find(
        (extNumber) => String(extNumber).toUpperCase() === normalizedCandidate,
      );

      if (!matchedExtension || !extensionNumbersSet.has(matchedExtension)) {
        continue;
      }

      const nextStatus =
        channelState.includes("ring") && !channelState.includes("up")
          ? "ringing"
          : "in_call";

      const current = map.get(matchedExtension);
      if (current !== "in_call") {
        map.set(matchedExtension, nextStatus);
      }
    }
  }

  return map;
};

const syncStatusesFromAsterisk = async (io) => {
  const extensions = await Extension.findAll({
    attributes: ["id", "number", "status"],
  });

  if (!extensions.length) {
    return;
  }

  const extensionNumbers = extensions.map((ext) => ext.number);
  const extensionNumbersSet = new Set(extensionNumbers);

  const [peersResponse, channelsResponse] = await Promise.allSettled([
    runCommand("sip show peers"),
    runCommand("core show channels concise"),
  ]);

  const peerLines =
    peersResponse.status === "fulfilled"
      ? normalizeCommandOutput(peersResponse.value)
      : [];
  const channelLines =
    channelsResponse.status === "fulfilled"
      ? normalizeCommandOutput(channelsResponse.value)
      : [];

  const peersOnlineMap = parsePeersOnlineMap(peerLines, extensionNumbersSet);
  const callStatusMap = parseCallStatusMap(
    channelLines,
    extensionNumbers,
    extensionNumbersSet,
  );

  let changed = false;

  for (const extension of extensions) {
    if (extension.status === "paused" || extension.status === "in_campaign") {
      continue;
    }

    let nextStatus = callStatusMap.get(extension.number);
    if (!nextStatus) {
      const isOnline = peersOnlineMap.get(extension.number) === true;
      nextStatus = isOnline ? "online" : "offline";
    }

    if (extension.status !== nextStatus) {
      extension.status = nextStatus;
      await extension.save();
      changed = true;
    }
  }

  if (changed) {
    cacheAt = 0;
    io.emit("dashboard:update");
  }
};

const startAsteriskStatusPolling = (io) => {
  if (pollInterval) {
    return;
  }

  const runSync = async () => {
    try {
      await syncStatusesFromAsterisk(io);
    } catch (error) {
      console.error("Erro no polling de status do Asterisk:", error.message);
    }
  };

  runSync();
  pollInterval = setInterval(runSync, POLL_INTERVAL_MS);
};

const updateStatusForChannels = async (channels, nextStatus, io) => {
  const extensions = await loadExtensions();
  const extensionNumbers = extensions.map((ext) => ext.number);

  const affectedNumbers = [
    ...new Set(
      channels
        .map((channel) => extensionNumberFromChannel(channel, extensionNumbers))
        .filter(Boolean),
    ),
  ];

  if (!affectedNumbers.length) {
    return;
  }

  for (const number of affectedNumbers) {
    const extension = await Extension.findOne({ where: { number } });
    if (!extension) {
      continue;
    }

    if (
      nextStatus === "online" &&
      extension.status !== "in_call" &&
      extension.status !== "ringing"
    ) {
      continue;
    }

    if (extension.status === nextStatus) {
      continue;
    }

    extension.status = nextStatus;
    await extension.save();
  }

  cacheAt = 0;
  io.emit("dashboard:update");
};

const startAmiStatusMonitor = (io) => {
  if (started) {
    return;
  }

  started = true;
  const client = getAmiClient();

  client.on("managerevent", async (event) => {
    try {
      const eventName = String(event.Event || "").toLowerCase();
      const channels = getEventChannels(event);

      if (!channels.length) {
        return;
      }

      if (
        eventName === "bridgeenter" ||
        (eventName === "newstate" &&
          String(event.ChannelStateDesc || "").toLowerCase() === "up")
      ) {
        await updateStatusForChannels(channels, "in_call", io);
        return;
      }

      if (
        eventName === "dialbegin" ||
        (eventName === "newstate" &&
          String(event.ChannelStateDesc || "").toLowerCase() === "ringing")
      ) {
        await updateStatusForChannels(channels, "ringing", io);
        return;
      }

      if (eventName === "hangup" || eventName === "bridgeleave") {
        await updateStatusForChannels(channels, "online", io);
      }
    } catch (error) {
      console.error("Erro ao processar evento AMI:", error.message);
    }
  });

  startAsteriskStatusPolling(io);
};

module.exports = { startAmiStatusMonitor };
