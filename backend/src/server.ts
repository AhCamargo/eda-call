import "express-async-errors"; // deve ser o primeiro import — patcha o Express para capturar erros async
import http from "http";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import config from "./config";
import logger from "./logger";
import { syncDatabase } from "./db";
import { seedAdmin } from "./seed";
import { createRoutes } from "./routes";
import { startAmiStatusMonitor } from "./services/amiStatusMonitor";
import { startRecordingsSyncService } from "./services/recordingsSyncService";
import { startUraReverseWorker } from "./services/uraReverseWorker";
import { reprovisionInboundDialplans } from "./services/inboundReprovision";
import { initStatusLogsFromCurrentState } from "./services/agentStatusLogger";

const bootstrap = async () => {
  await syncDatabase();
  await seedAdmin();
  await initStatusLogsFromCurrentState(); // fecha entradas abertas de restarts anteriores e abre novas

  const app = express();
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json());
  // NUNCA servir /recordings como diretório estático: isso ignorava
  // completamente a autenticação/autorização da rota
  // GET /recordings/:filename (recordings.router.ts), expondo todas as
  // gravações de chamada sem login (achado F2 da auditoria de segurança).
  // O streaming autenticado é feito exclusivamente por essa rota.

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: config.corsOrigin } });

  // Exige um JWT válido no handshake — sem isso, qualquer cliente na rede
  // podia conectar ao socket e receber eventos com dados sensíveis (ex.:
  // telefones discados em campanhas de URA reversa) sem estar logado
  // (achado F17 da auditoria de segurança).
  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.query?.token as string | undefined);
    if (!token) return next(new Error("unauthorized"));
    try {
      jwt.verify(String(token), config.jwtSecret);
      return next();
    } catch {
      return next(new Error("unauthorized"));
    }
  });

  io.on("connection", () => {});

  startAmiStatusMonitor(io);
  startRecordingsSyncService();
  startUraReverseWorker(io);
  // Em segundo plano: não atrasa a subida da API se o Asterisk demorar.
  reprovisionInboundDialplans().catch((error: any) =>
    logger.error(`[InboundReprovision] Falhou: ${error.message}`),
  );

  app.use(createRoutes(io));

  server.listen(config.port, () => {
    logger.info(`API rodando na porta ${config.port}`);
  });
};

bootstrap().catch((error) => {
  logger.error("Falha ao iniciar API", { error });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error("[unhandledRejection]", { reason });
});

process.on("uncaughtException", (err) => {
  logger.error("[uncaughtException]", { err });
});
