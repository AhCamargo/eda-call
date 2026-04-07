import "dotenv/config";

const config = {
  port: Number(process.env.PORT || 5000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || "supersecret",
  backendInternalUrl: process.env.BACKEND_INTERNAL_URL || "http://backend:5000",
  internalApiKey: process.env.INTERNAL_API_KEY || "edacall-internal-key",
  asteriskRecordingsDir:
    process.env.ASTERISK_RECORDINGS_DIR || "/asterisk-recordings",
  asteriskSoundsDir: process.env.ASTERISK_SOUNDS_DIR || "/asterisk-sounds",
  asteriskSipCustomFile:
    process.env.ASTERISK_SIP_CUSTOM_FILE || "/asterisk-config/sip_custom.conf",
  asteriskPjsipCustomFile:
    process.env.ASTERISK_PJSIP_CUSTOM_FILE ||
    "/asterisk-config/pjsip_custom.conf",
  asteriskExtensionsCustomFile:
    process.env.ASTERISK_EXTENSIONS_CUSTOM_FILE ||
    "/asterisk-config/extensions_custom.conf",
  asteriskQueuesCustomFile:
    process.env.ASTERISK_QUEUES_CUSTOM_FILE ||
    "/asterisk-config/queues_custom.conf",
  asteriskWsUrl: process.env.ASTERISK_WS_URL || "ws://localhost:8088/ws",
  ami: {
    host: process.env.AMI_HOST || "asterisk",
    port: Number(process.env.AMI_PORT || 5038),
    username: process.env.AMI_USERNAME || "admin",
    password: process.env.AMI_PASSWORD || "admin",
  },
};

export default config;
