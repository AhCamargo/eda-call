import { Server } from "socket.io";
import {
  Campaign,
  CampaignContact,
  CallLog,
  UraLog,
  Extension,
  VoipLine,
} from "../db";
import {
  originateCall,
  newActionId,
  watchOriginate,
  waitForHangup,
  OriginateOutcome,
} from "../ami";

const runningCampaigns = new Set<number>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Tempo para o Asterisk dizer se atendeu (toque padrão de 30s + folga).
const ORIGINATE_TIMEOUT_MS = 60_000;
// Uma ligação atendida segura a campanha até terminar (no máximo isto).
const MAX_CALL_MS = 2 * 60 * 60_000;

const OUTCOME_TO_RESULT: Record<OriginateOutcome, string> = {
  answered: "atendida",
  no_answer: "nao_atendida",
  failed: "nao_atendida",
  busy: "rejeitada",
  rejected: "rejeitada",
  invalid: "numero_nao_existe",
};

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

      const actionId = newActionId(`dialer-${campaign.id}`);
      const watch = watchOriginate(actionId, ORIGINATE_TIMEOUT_MS);
      let result = "nao_atendida";
      let asteriskUniqueId: string | null = null;
      try {
        await originateCall(
          contact.phoneNumber,
          extension?.number || "1000",
          voipLine?.name || null,
          actionId,
        );
        const { outcome, uniqueid } = await watch.result;
        result = OUTCOME_TO_RESULT[outcome];
        asteriskUniqueId = uniqueid;
        // Só passa para o próximo número quando esta ligação terminar.
        if (outcome === "answered" && uniqueid) await waitForHangup(uniqueid, MAX_CALL_MS);
      } catch {
        watch.cancel();
      }
      // O CDR do Asterisk também registra esta ligação (mesmo uniqueid).
      // Se ele já chegou, completa aquela linha em vez de criar outra —
      // senão a ligação apareceria duas vezes nos relatórios.
      const campaignFields = {
        campaignId: campaign.id,
        extensionId: extension?.id || null,
        voipLineId: voipLine?.id || null,
        phoneNumber: contact.phoneNumber,
        result,
      };
      const cdrRow = asteriskUniqueId
        ? ((await CallLog.findOne({ where: { callUniqueId: asteriskUniqueId } })) as any)
        : null;
      if (cdrRow) await cdrRow.update(campaignFields);
      else
        await CallLog.create({
          ...campaignFields,
          callUniqueId: asteriskUniqueId,
          // Com uniqueid, o CDR que chegar depois é descartado como duplicata
          // e esta linha vale pela ligação; sem ele, o CDR (se vier) conta
          // a ligação nos indicadores e esta linha fica só como registro da campanha.
          direction: asteriskUniqueId ? "outbound" : null,
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

      // A ligação já terminou aqui; o ramal volta a ficar disponível para a
      // campanha (o status "em ligação" ao vivo vem do amiStatusMonitor).
      if (extension) {
        await extension.update({ status: "in_campaign" });
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
