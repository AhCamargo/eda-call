import "express-async-errors"; // deve ser o primeiro import — patcha o Express para capturar erros async
import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import config from "./config";
import logger from "./logger";
import { syncDatabase } from "./db";
import { seedAdmin } from "./seed";
import { createRoutes } from "./routes";
import { startAmiStatusMonitor } from "./services/amiStatusMonitor";
import { startRecordingsSyncService } from "./services/recordingsSyncService";
import { startUraReverseWorker } from "./services/uraReverseWorker";
import { initStatusLogsFromCurrentState } from "./services/agentStatusLogger";

const bootstrap = async () => {
  await syncDatabase();
  await seedAdmin();
  await initStatusLogsFromCurrentState(); // fecha entradas abertas de restarts anteriores e abre novas

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use("/recordings", express.static(config.asteriskRecordingsDir));

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: "*" } });

  io.on("connection", () => {});

  startAmiStatusMonitor(io);
  startRecordingsSyncService();
  startUraReverseWorker(io);

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
