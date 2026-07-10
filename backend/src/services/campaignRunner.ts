import { Server } from "socket.io";
import {
  Campaign,
  CampaignContact,
  CallLog,
  UraLog,
  Extension,
  VoipLine,
} from "../db";
import { originateCall, getAmiClient } from "../ami";

const runningCampaigns = new Set<number>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const CAUSE_TO_RESULT: Record<number, string> = {
  16: "atendida",
  1: "numero_nao_existe",
  17: "rejeitada",
  21: "rejeitada",
};

const waitForHangup = (uniqueid: string, timeoutMs = 60000): Promise<string> =>
  new Promise((resolve) => {
    const ami = getAmiClient();
    const timer = setTimeout(() => {
      ami.removeListener("managerevent", handler);
      resolve("nao_atendida");
    }, timeoutMs);

    const handler = (event: any) => {
      if (event.Event !== "Hangup") return;
      if (event.Uniqueid !== uniqueid && event.Linkedid !== uniqueid) return;
      clearTimeout(timer);
      ami.removeListener("managerevent", handler);
      const cause = Number(event.Cause ?? event.cause ?? 0);
      resolve(CAUSE_TO_RESULT[cause] ?? "nao_atendida");
    };

    ami.on("managerevent", handler);
  });

export const runCampaign = async (campaignId: number, io: Server) => {
  if (runningCampaigns.has(campaignId)) {
    return;
  }

  runningCampaigns.add(campaignId);

  try {
    const campaign = await Campaign.findByPk(campaignId, {
      include: [
        { model: CampaignContact, as: "contacts" },
        { model: Extension, as: "extensions" },
        { model: VoipLine, as: "voipLines" },
      ],
    }) as any;

    if (!campaign) {
      return;
    }

    campaign.status = "in_progress";
    await campaign.save();

    if (campaign.extensions.length) {
      await Promise.all(
        campaign.extensions.map((ext: any) => ext.update({ status: "in_campaign" })),
      );
    }
    io.emit("dashboard:update");

    for (let index = 0; index < campaign.contacts.length; index += 1) {
      const contact = campaign.contacts[index];
      const extension = campaign.extensions.length
        ? campaign.extensions[
            Math.floor(Math.random() * campaign.extensions.length)
          ]
        : null;
      const voipLine = campaign.voipLines.length
        ? campaign.voipLines[index % campaign.voipLines.length]
        : null;

      let uniqueid: string | null = null;
      try {
        const response: any = await originateCall(
          contact.phoneNumber,
          extension?.number || "1000",
          voipLine?.name || null,
        );
        uniqueid = response?.Uniqueid ?? response?.uniqueid ?? null;
      } catch {}

      const result = uniqueid
        ? await waitForHangup(uniqueid, 60000)
        : "nao_atendida";
      const callLog = await CallLog.create({
        campaignId: campaign.id,
        extensionId: extension?.id || null,
        voipLineId: voipLine?.id || null,
        phoneNumber: contact.phoneNumber,
        result,
      });

      const callUniqueId = `${campaign.id}-${Date.now()}-${index}`;

      await UraLog.create({
        campaignId: campaign.id,
        extensionId: extension?.id || null,
        phoneNumber: contact.phoneNumber,
        selectedOption: result === "atendida" ? "1" : null,
        audioPath:
          result === "atendida" ? `/recordings/ura/${callUniqueId}.wav` : null,
        result,
      });

      if (extension) {
        await extension.update({
          status: result === "atendida" ? "in_call" : "online",
        });
      }

      io.emit("call:update", {
        campaignId: campaign.id,
        phoneNumber: contact.phoneNumber,
        extensionNumber: extension?.number || null,
        voipLineName: voipLine?.name || null,
        result,
      });
      io.emit("dashboard:update");

      if (index < campaign.contacts.length - 1) {
        await sleep(campaign.intervalSeconds * 1000);
      }
    }

    campaign.status = "completed";
    await campaign.save();

    if (campaign.extensions.length) {
      await Promise.all(
        campaign.extensions.map((ext: any) => ext.update({ status: "online" })),
      );
    }

    io.emit("dashboard:update");
  } finally {
    runningCampaigns.delete(campaignId);
  }
};
