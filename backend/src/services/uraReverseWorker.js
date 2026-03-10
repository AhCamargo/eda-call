const { Op } = require("sequelize");
const {
  UraReverseCampaign,
  UraReverseContact,
  UraReverseOption,
  VoipLine,
} = require("../db");
const { originateReverseIvr } = require("../ami");

const runningState = {
  io: null,
  timer: null,
  activeByCampaign: new Map(),
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isPhoneValid = (phone) => /^\d{10,14}$/.test(String(phone || "").trim());

const emitCampaignStats = async (campaignId) => {
  if (!runningState.io) return;

  const contacts = await UraReverseContact.findAll({
    where: { campaignId },
    attributes: ["status"],
  });

  const stats = {
    calling: 0,
    answered: 0,
    no_answer: 0,
    invalid: 0,
    busy: 0,
    hangup: 0,
    pending: 0,
    finished: 0,
  };

  for (const contact of contacts) {
    const key = contact.status;
    if (stats[key] === undefined) continue;
    stats[key] += 1;
  }

  runningState.io.emit("ura-reverse:stats", { campaignId, stats });
};

const emitCallEvent = (payload) => {
  if (!runningState.io) return;
  runningState.io.emit("ura-reverse:call-event", payload);
};

const markContactResult = async ({
  contactId,
  campaignId,
  status,
  result,
  selectedOption = null,
  recordingPath = null,
}) => {
  const contact = await UraReverseContact.findByPk(contactId);
  if (!contact) return;

  contact.status = status;
  contact.lastResult = result;
  if (selectedOption !== null && selectedOption !== undefined) {
    contact.selectedOption = selectedOption;
  }
  if (recordingPath) {
    contact.recordingPath = recordingPath;
  }
  contact.lockedAt = null;

  if (status !== "pending" && status !== "calling") {
    contact.completedAt = new Date();
  }

  await contact.save();

  emitCallEvent({
    campaignId,
    contactId,
    phoneNumber: contact.phoneNumber,
    eventType: status,
    result,
    selectedOption,
    recordingPath: recordingPath || contact.recordingPath || null,
  });
  await emitCampaignStats(campaignId);
};

const buildOptionMaps = (options) => {
  const actionMap = {};
  const targetMap = {};

  for (let digit = 0; digit <= 9; digit += 1) {
    actionMap[String(digit)] = "hangup";
    targetMap[String(digit)] = "";
  }

  for (const option of options) {
    actionMap[option.keyDigit] = option.actionType;
    targetMap[option.keyDigit] = option.targetExtension || "";
  }

  return { actionMap, targetMap };
};

const processContact = async (campaign, contact, options) => {
  const activeSet = runningState.activeByCampaign.get(campaign.id) || new Set();
  activeSet.add(contact.id);
  runningState.activeByCampaign.set(campaign.id, activeSet);

  const line = await VoipLine.findByPk(campaign.voipLineId);

  contact.status = "calling";
  contact.attempts += 1;
  contact.lastDialedAt = new Date();
  contact.lockedAt = new Date();
  await contact.save();

  emitCallEvent({
    campaignId: campaign.id,
    contactId: contact.id,
    phoneNumber: contact.phoneNumber,
    eventType: "calling",
  });

  const { actionMap, targetMap } = buildOptionMaps(options);

  try {
    await originateReverseIvr({
      phoneNumber: contact.phoneNumber,
      voipLineName: line?.name || null,
      targetExtension: "2001",
      option1TargetExtension: targetMap["1"] || "2001",
      option2TargetExtension: targetMap["2"] || "2001",
      option3TargetExtension: targetMap["3"] || "2001",
      promptAudio: campaign.audioFile || "custom/edacall-menu-ptbr",
      uraRef: `uracamp-${campaign.id}-${contact.id}-${Date.now()}`,
      channelTechnology: campaign.dialTechnology || "PJSIP",
      digitTimeoutSeconds: campaign.digitTimeoutSeconds,
      timeoutMs: campaign.callTimeoutSeconds * 1000,
      extraVariables: {
        APP_URA_CAMPAIGN_ID: String(campaign.id),
        APP_URA_CONTACT_ID: String(contact.id),
        APP_URA_CODEC: campaign.codec,
        APP_URA_MAX_ATTEMPTS: String(campaign.maxAttempts),
        APP_URA_AUTOCALLBACK: campaign.autoCallback ? "1" : "0",
        APP_ACT_0: actionMap["0"],
        APP_ACT_1: actionMap["1"],
        APP_ACT_2: actionMap["2"],
        APP_ACT_3: actionMap["3"],
        APP_ACT_4: actionMap["4"],
        APP_ACT_5: actionMap["5"],
        APP_ACT_6: actionMap["6"],
        APP_ACT_7: actionMap["7"],
        APP_ACT_8: actionMap["8"],
        APP_ACT_9: actionMap["9"],
        APP_TGT_0: targetMap["0"],
        APP_TGT_1: targetMap["1"],
        APP_TGT_2: targetMap["2"],
        APP_TGT_3: targetMap["3"],
        APP_TGT_4: targetMap["4"],
        APP_TGT_5: targetMap["5"],
        APP_TGT_6: targetMap["6"],
        APP_TGT_7: targetMap["7"],
        APP_TGT_8: targetMap["8"],
        APP_TGT_9: targetMap["9"],
      },
    });
  } catch (error) {
    const nextStatus =
      contact.attempts < campaign.maxAttempts ? "pending" : "busy";
    await markContactResult({
      contactId: contact.id,
      campaignId: campaign.id,
      status: nextStatus,
      result: error.message || "originate_error",
    });
    activeSet.delete(contact.id);
    return;
  }

  const waitMs =
    (campaign.callTimeoutSeconds + campaign.digitTimeoutSeconds + 2) * 1000;
  await sleep(waitMs);

  const freshContact = await UraReverseContact.findByPk(contact.id);
  if (freshContact && freshContact.status === "calling") {
    const nextStatus =
      freshContact.attempts < campaign.maxAttempts ? "pending" : "no_answer";

    await markContactResult({
      contactId: freshContact.id,
      campaignId: campaign.id,
      status: nextStatus,
      result: nextStatus,
    });
  }

  activeSet.delete(contact.id);
};

const processCampaign = async (campaign) => {
  const activeSet = runningState.activeByCampaign.get(campaign.id) || new Set();
  const availableSlots = Math.max(0, campaign.concurrentCalls - activeSet.size);
  if (availableSlots === 0) return;

  const options = await UraReverseOption.findAll({
    where: { campaignId: campaign.id },
  });

  const contacts = await UraReverseContact.findAll({
    where: {
      campaignId: campaign.id,
      status: "pending",
      [Op.and]: [
        {
          [Op.or]: [
            { lockedAt: null },
            { lockedAt: { [Op.lt]: new Date(Date.now() - 120000) } },
          ],
        },
        {
          [Op.or]: [
            { lastDialedAt: null },
            {
              lastDialedAt: {
                [Op.lt]: new Date(
                  Date.now() - campaign.retryIntervalSeconds * 1000,
                ),
              },
            },
          ],
        },
      ],
      attempts: { [Op.lt]: campaign.maxAttempts },
    },
    order: [["updatedAt", "ASC"]],
    limit: availableSlots,
  });

  for (const contact of contacts) {
    if (!isPhoneValid(contact.phoneNumber)) {
      await markContactResult({
        contactId: contact.id,
        campaignId: campaign.id,
        status: "invalid",
        result: "invalid_phone",
      });
      continue;
    }

    processContact(campaign, contact, options).catch(() => {});
  }

  const pendingCount = await UraReverseContact.count({
    where: {
      campaignId: campaign.id,
      [Op.or]: [{ status: "pending" }, { status: "calling" }],
      attempts: { [Op.lte]: campaign.maxAttempts },
    },
  });

  if (pendingCount === 0 && campaign.status === "running") {
    campaign.status = "finished";
    await campaign.save();
    await emitCampaignStats(campaign.id);
  }
};

const tick = async () => {
  const campaigns = await UraReverseCampaign.findAll({
    where: { status: "running" },
  });
  for (const campaign of campaigns) {
    await processCampaign(campaign);
  }
};

const startUraReverseWorker = (io) => {
  runningState.io = io;

  if (runningState.timer) {
    clearInterval(runningState.timer);
  }

  runningState.timer = setInterval(() => {
    tick().catch(() => {});
  }, 1000);
};

const handleUraReverseDtmfEvent = async ({
  campaignId,
  contactId,
  selectedOption,
  result,
  recordingPath = null,
}) => {
  const campaign = await UraReverseCampaign.findByPk(campaignId);
  if (!campaign) return;

  if (!contactId) return;

  const normalizedResult = String(result || "").toLowerCase();
  let status = "answered";
  if (normalizedResult.includes("busy")) status = "busy";
  if (normalizedResult.includes("hangup")) status = "hangup";
  if (normalizedResult.includes("sem_opcao")) status = "no_answer";
  if (normalizedResult.includes("invalid")) status = "invalid";

  await markContactResult({
    contactId,
    campaignId,
    status,
    result,
    selectedOption,
    recordingPath,
  });
};

module.exports = {
  startUraReverseWorker,
  handleUraReverseDtmfEvent,
  emitCampaignStats,
};
