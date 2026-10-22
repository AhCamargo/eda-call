import express, { Request, Response } from "express";
import logger from "../logger";
import { UraLog } from "../db";
import { handleUraReverseDtmfEvent } from "../services/uraReverseWorker";
import { isInternalRequest, isValidUraCallbackSignature } from "../utils/network";

// Quem chama este endpoint é sempre o próprio Asterisk (via curl no
// dialplan, extensions_custom.conf), rodando no mesmo host ou na mesma rede
// Docker — nunca a internet pública. Em vez de uma chave compartilhada
// (INTERNAL_API_KEY, removida a pedido), restringe por IP de origem:
// loopback ou faixas privadas (RFC1918 / rede bridge do Docker), sem headers
// de proxy, e exige a assinatura `?sig=` que o backend anexa à
// URA_CALLBACK_URL ao originar a chamada (ver signUraCallback).

export const createInternalRouter = () => {
  const router = express.Router();

  router.post("/internal/ura/log", async (req: Request, res: Response) => {
    const remoteAddress = req.socket.remoteAddress;
    if (!isInternalRequest(req)) {
      logger.warn(`[internal/ura/log] chamada rejeitada — origem fora da rede interna: ${remoteAddress}`);
      return res.status(403).json({ message: "Acesso restrito à rede interna" });
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

    if (!isValidUraCallbackSignature(uraRef, req.query.sig)) {
      logger.warn(`[internal/ura/log] chamada rejeitada — assinatura inválida (uraRef=${uraRef})`);
      return res.status(403).json({ message: "Assinatura inválida" });
    }

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
