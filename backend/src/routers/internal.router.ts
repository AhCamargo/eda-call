import express, { Request, Response } from "express";
import config from "../config";
import { UraLog } from "../db";
import { handleUraReverseDtmfEvent } from "../services/uraReverseWorker";

export const createInternalRouter = () => {
  const router = express.Router();

  router.post("/internal/ura/log", async (req: Request, res: Response) => {
    const configuredKey = config.internalApiKey;
    if (configuredKey) {
      const receivedKey = req.headers["x-internal-key"];
      if (receivedKey !== configuredKey) {
        return res.status(401).json({ message: "Chave interna inválida" });
      }
    }

    const {
      uraRef = null,
      campaignId = null,
      extensionId = null,
      uraCampaignId = null,
      uraContactId = null,
      phoneNumber,
      selectedOption = null,
      audioPath = null,
      result = "pending",
    } = req.body || {};

    if (!phoneNumber) {
      return res.status(400).json({ message: "phoneNumber é obrigatório" });
    }

    let uraLog: any = null;
    if (uraRef) {
      uraLog = await UraLog.findOne({ where: { uraRef } });
    }

    if (uraLog) {
      uraLog.campaignId = campaignId || uraLog.campaignId;
      uraLog.extensionId = extensionId || uraLog.extensionId;
      uraLog.phoneNumber = String(phoneNumber);
      uraLog.selectedOption = selectedOption;
      uraLog.audioPath = audioPath;
      uraLog.result = result;
      await uraLog.save();

      if (uraCampaignId && uraContactId) {
        await handleUraReverseDtmfEvent({
          campaignId: Number(uraCampaignId),
          contactId: Number(uraContactId),
          selectedOption,
          result,
          recordingPath: audioPath,
        });
      }

      return res.json(uraLog);
    }

    const created = await UraLog.create({
      uraRef,
      campaignId,
      extensionId,
      phoneNumber: String(phoneNumber),
      selectedOption,
      audioPath,
      result,
    });

    if (uraCampaignId && uraContactId) {
      await handleUraReverseDtmfEvent({
        campaignId: Number(uraCampaignId),
        contactId: Number(uraContactId),
        selectedOption,
        result,
        recordingPath: audioPath,
      });
    }

    return res.status(201).json(created);
  });

  return router;
};
