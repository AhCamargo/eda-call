import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import config from "./config";
import { syncDatabase } from "./db";
import { seedAdmin } from "./seed";
import { createRoutes } from "./routes";
import { startAmiStatusMonitor } from "./services/amiStatusMonitor";
import { startRecordingsSyncService } from "./services/recordingsSyncService";
import { startUraReverseWorker } from "./services/uraReverseWorker";

const bootstrap = async () => {
  await syncDatabase();
  await seedAdmin();

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
    console.log(`API rodando na porta ${config.port}`);
  });
};

bootstrap().catch((error) => {
  console.error("Falha ao iniciar API:", error);
  process.exit(1);
});
