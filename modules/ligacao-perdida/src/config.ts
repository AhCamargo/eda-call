const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    console.error(`[FATAL] ${name} não configurada.`);
    process.exit(1);
  }
  return value;
};

export const MODULE_ID = "ligacao-perdida";
export const MODULE_VERSION = "1.0.2";

export const loadConfig = () => ({
  port: Number(process.env.PORT || 4100),
  databaseUrl: required("DATABASE_URL"),
  modulesSecret: required("MODULES_SECRET"),
  /** Endereço do backend do EdaCall na rede interna do Docker. */
  coreUrl: (process.env.CORE_URL || "http://backend:5000").replace(/\/$/, ""),
  /** Como o núcleo alcança este container (vai no registro do módulo). */
  internalUrl: (process.env.MODULE_INTERNAL_URL || "http://mod-ligacao-perdida:4100").replace(/\/$/, ""),
  whatsappProvider: (process.env.WHATSAPP_PROVIDER || "waha") as "waha",
  waha: {
    url: (process.env.WAHA_URL || "http://waha:3000").replace(/\/$/, ""),
    apiKey: process.env.WAHA_API_KEY || "",
    // O WAHA Core só aceita a sessão "default" (um número por instalação).
    session: process.env.WAHA_SESSION || "default",
  },
  timeZone: process.env.MODULE_TZ || "America/Sao_Paulo",
});

export type ModuleConfig = ReturnType<typeof loadConfig>;
