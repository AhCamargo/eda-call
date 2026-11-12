// O módulo fala com "um WhatsApp" por esta interface. Hoje a implementação é
// o WAHA (QR Code, sem custo de licença); a API oficial da Meta pode entrar
// depois como outra implementação, sem mexer nas regras nem na tela.

export type ConnectionStatus =
  | "CONNECTED" // número pareado e pronto
  | "WAITING_QR" // aguardando leitura do QR Code
  | "STARTING"
  | "DISCONNECTED" // parado ou nunca pareado
  | "FAILED"
  | "UNAVAILABLE"; // o serviço do WhatsApp não respondeu

export interface ConnectionInfo {
  status: ConnectionStatus;
  /** Número conectado (só dígitos), quando houver. */
  phone: string | null;
  detail?: string;
}

export interface WhatsAppConnector {
  readonly provider: string;
  getStatus(): Promise<ConnectionInfo>;
  /** Cria/inicia a sessão para aparecer o QR Code. */
  connect(): Promise<void>;
  /** QR Code atual como data URL (image/png). */
  getQrDataUrl(): Promise<string>;
  /** Desfaz o pareamento (o aparelho sai de "Dispositivos conectados"). */
  logout(): Promise<void>;
  /** Endereço do número no WhatsApp, ou null se ele não tem WhatsApp. */
  resolveChat(digits: string): Promise<string | null>;
  sendText(chatId: string, text: string): Promise<void>;
}

export class ConnectorError extends Error {
  constructor(
    readonly code: "not_configured" | "unauthorized" | "unreachable" | "timeout" | "not_connected" | "rejected" | "invalid_response",
    message: string,
  ) {
    super(message);
    this.name = "ConnectorError";
  }
}
