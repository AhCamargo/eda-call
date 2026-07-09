import "dotenv/config";

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    console.error(`[FATAL] ${name} não configurada. Defina a variável de ambiente antes de iniciar.`);
    process.exit(1);
  }
  return value;
};

const config = {
  port: Number(process.env.PORT || 5000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: requireEnv("JWT_SECRET"),
  internalApiKey: process.env.INTERNAL_API_KEY || "",
  backendInternalUrl: process.env.BACKEND_INTERNAL_URL || "http://backend:5000",
  asteriskRecordingsDir:
    process.env.ASTERISK_RECORDINGS_DIR || "/asterisk-recordings",
  asteriskSoundsDir: process.env.ASTERISK_SOUNDS_DIR || "/asterisk-sounds",
  asteriskSipNatFile:
    process.env.ASTERISK_SIP_NAT_FILE || "/etc/asterisk/sip_nat_runtime.conf",
  serverConfigDir: process.env.SERVER_CONFIG_DIR || "/edacall-config",
  asteriskSipCustomFile:
    process.env.ASTERISK_SIP_CUSTOM_FILE ||
    "/etc/asterisk-custom/sip_custom.conf",
  asteriskExtensionsCustomFile:
    process.env.ASTERISK_EXTENSIONS_CUSTOM_FILE ||
    "/etc/asterisk-custom/extensions_custom.conf",
  asteriskQueuesCustomFile:
    process.env.ASTERISK_QUEUES_CUSTOM_FILE ||
    "/etc/asterisk-custom/queues_custom.conf",
  asteriskSipRegistrationsFile:
    process.env.ASTERISK_SIP_REGISTRATIONS_FILE ||
    "/etc/asterisk-custom/sip_registrations.conf",
  asteriskSipMainFile:
    process.env.ASTERISK_SIP_MAIN_FILE || "/etc/asterisk/sip.conf",
  asteriskInboundRoutesFile:
    process.env.ASTERISK_INBOUND_ROUTES_FILE ||
    "/etc/asterisk-custom/extensions_inbound.conf",
  asteriskWsUrl: process.env.ASTERISK_WS_URL || "ws://localhost:8088/ws",
  ami: {
    host: process.env.AMI_HOST || "asterisk",
    port: Number(process.env.AMI_PORT || 5038),
    username: requireEnv("AMI_USERNAME"),
    password: requireEnv("AMI_PASSWORD"),
  },
};

export default config;
