import { InboundIvr, InboundIvrOption, InboundRoute } from "../db";
import {
  upsertInboundIvrDialplan,
  reprovisionAllInboundDidRoutes,
} from "./asteriskProvisioning";
import logger from "../logger";

// Regera no boot o dialplan das centrais telefônicas e do roteamento de
// entrada a partir do banco. Assim, mudanças no gerador (ex.: gravação das
// ligações recebidas) chegam aos servidores só com o update.sh, sem ninguém
// precisar abrir e salvar cada central.
export const reprovisionInboundDialplans = async () => {
  const ivrs = (await InboundIvr.findAll({
    include: [{ model: InboundIvrOption, as: "options" }],
  })) as any[];

  let failed = 0;
  for (const ivr of ivrs) {
    try {
      await upsertInboundIvrDialplan({
        contextName: ivr.contextName,
        name: ivr.name,
        audioFile: ivr.audioFile,
        digitTimeoutSeconds: ivr.digitTimeoutSeconds,
        maxInvalidAttempts: ivr.maxInvalidAttempts,
        fallbackExtension: ivr.fallbackExtension,
        fallbackLabel: ivr.fallbackLabel,
        dialTechnology: ivr.dialTechnology,
        options: (ivr.options ?? []).map((o: any) => o.toJSON()),
        scheduleEnabled: ivr.scheduleEnabled,
        scheduleJson: ivr.scheduleJson,
        closedAudioFile: ivr.closedAudioFile,
      });
    } catch (error: any) {
      failed += 1;
      logger.error(`[InboundReprovision] Central "${ivr.name}" não reaplicada: ${error.message}`);
    }
  }

  const routes = (await InboundRoute.findAll()) as any[];
  try {
    await reprovisionAllInboundDidRoutes(
      routes.map((r) => ({
        did: r.did,
        destinationType: r.destinationType,
        destinationTarget: r.destinationTarget,
        enabled: r.enabled,
      })),
    );
  } catch (error: any) {
    logger.error(`[InboundReprovision] Rotas de entrada não reaplicadas: ${error.message}`);
  }

  logger.info(
    `[InboundReprovision] ${ivrs.length - failed}/${ivrs.length} centrais e ${routes.length} rotas de entrada reaplicadas.`,
  );
};
