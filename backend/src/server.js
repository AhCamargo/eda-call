const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const { port, asteriskRecordingsDir } = require("./config");
const { syncDatabase } = require("./db");
const { seedAdmin } = require("./seed");
const { createRoutes } = require("./routes");
const { startAmiStatusMonitor } = require("./services/amiStatusMonitor");
const {
  startRecordingsSyncService,
} = require("./services/recordingsSyncService");
const { startUraReverseWorker } = require("./services/uraReverseWorker");

const bootstrap = async () => {
  await syncDatabase();
  await seedAdmin();

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use("/recordings", express.static(asteriskRecordingsDir));

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: "*" } });

  io.on("connection", () => {});

  startAmiStatusMonitor(io);
  startRecordingsSyncService();
  startUraReverseWorker(io);

  app.use(createRoutes(io));

  server.listen(port, () => {
    console.log(`API rodando na porta ${port}`);
  });
};

bootstrap().catch((error) => {
  console.error("Falha ao iniciar API:", error);
  process.exit(1);
});
