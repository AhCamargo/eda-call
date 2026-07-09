/**
 * EdaCall — Serviço de Validação de Licença
 * ──────────────────────────────────────────
 * Valida o arquivo .lic assinado com RSA-SHA256.
 * A chave pública é embutida aqui — nunca distribua a privada!
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

// ── Chave pública RSA (embutida em build) ─────────────────────────────────────
// Gerada em: license/keys/public.pem
// Para atualizar: substitua o conteúdo abaixo pelo da nova public.pem
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAt140f93810NhcfzVOUDA
2p4Ed6UrV0bY8iwpgtyjDOCK+JyqOkna5Iw4dFVhzmawoGmJd8Gh9j/wfFgleKQM
Quti9KZ/GWpLl/F4sLmaSWnQ2KiUJX4WHTG0Me+xwsKFxwSXEWIwb8/qPVtbSo+w
HpMTsC14rNsUyK9PTii+RgxU9lwr2NaZl6TKN69KHQTJi2eeotbLlAyRNv7kE2/M
iFeM192zjwkEXP/MIe2r10ufQ7XLH9PD3u8qObqnOlOOTMyUanLQSeiwpdsDP6sI
YbNs+GjCGbrd9NBJkcENY/kFLP2NgG5u5a2RjfHLWT9iZtJh73Gw5vtSX82PLBNR
EQIDAQAB
-----END PUBLIC KEY-----`;

// ── Caminho padrão do arquivo de licença ──────────────────────────────────────
const DEFAULT_LICENSE_PATH =
  process.env.LICENSE_FILE || "/etc/edacall/license.lic";

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface LicenseFeatures {
  recording: boolean;
  queues: boolean;
  ivr: boolean;
  campaigns: boolean;
}

export interface LicensePayload {
  clientId: string;
  clientName: string;
  clientEmail: string | null;
  issuedAt: string;
  expiresAt: string | null; // null = vitalício
  maxExtensions: number;    // 0 = ilimitado
  features: LicenseFeatures;
  notes: string | null;
}

export interface LicenseFile {
  payload: LicensePayload;
  signature: string;
}

export interface LicenseStatus {
  valid: boolean;
  expired: boolean;
  daysRemaining: number | null; // null = vitalício
  payload: LicensePayload | null;
  error: string | null;
}

// ── Estado em memória (validado na inicialização) ─────────────────────────────
let _licenseStatus: LicenseStatus | null = null;

// ── Lógica de validação ───────────────────────────────────────────────────────
export function validateLicenseFile(filePath: string = DEFAULT_LICENSE_PATH): LicenseStatus {
  try {
    if (!fs.existsSync(filePath)) {
      return {
        valid: false, expired: false, daysRemaining: null, payload: null,
        error: `Arquivo de licença não encontrado: ${filePath}`,
      };
    }

    const raw = fs.readFileSync(filePath, "utf8");
    const license: LicenseFile = JSON.parse(raw);

    if (!license.payload || !license.signature) {
      return {
        valid: false, expired: false, daysRemaining: null, payload: null,
        error: "Formato de licença inválido (payload ou assinatura ausente)",
      };
    }

    // Verifica assinatura RSA
    const verify = crypto.createVerify("SHA256");
    verify.update(JSON.stringify(license.payload));
    const signatureValid = verify.verify(PUBLIC_KEY, license.signature, "base64");

    if (!signatureValid) {
      return {
        valid: false, expired: false, daysRemaining: null, payload: null,
        error: "Assinatura da licença inválida — arquivo corrompido ou não autorizado",
      };
    }

    // Verifica expiração
    const { expiresAt } = license.payload;
    let expired = false;
    let daysRemaining: number | null = null;

    if (expiresAt) {
      const expDate = new Date(expiresAt);
      const now = new Date();
      const diffMs = expDate.getTime() - now.getTime();
      daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      expired = daysRemaining < 0;
    }

    if (expired) {
      return {
        valid: false, expired: true, daysRemaining, payload: license.payload,
        error: `Licença expirada em ${expiresAt}`,
      };
    }

    return {
      valid: true, expired: false, daysRemaining,
      payload: license.payload, error: null,
    };
  } catch (err: any) {
    return {
      valid: false, expired: false, daysRemaining: null, payload: null,
      error: `Erro ao ler licença: ${err.message}`,
    };
  }
}

// ── Inicialização (chamada no bootstrap do servidor) ──────────────────────────
export function initLicense(): LicenseStatus {
  _licenseStatus = validateLicenseFile();

  if (!_licenseStatus.valid) {
    console.error("\n╔══════════════════════════════════════════════════════╗");
    console.error("║  ⚠  LICENÇA EDACALL INVÁLIDA                         ║");
    console.error(`║  ${(_licenseStatus.error || "").padEnd(52)}║`);
    console.error("║  Contate o suporte: suporte@edacall.com.br           ║");
    console.error("╚══════════════════════════════════════════════════════╝\n");
  } else {
    const p = _licenseStatus.payload!;
    const expInfo = _licenseStatus.daysRemaining === null
      ? "vitalício"
      : `${_licenseStatus.daysRemaining} dias restantes`;
    console.log(`✔  Licença válida — ${p.clientName} (${p.clientId}) — ${expInfo}`);

    if (_licenseStatus.daysRemaining !== null && _licenseStatus.daysRemaining <= 30) {
      console.warn(`⚠  Licença expira em ${_licenseStatus.daysRemaining} dias! Renove em breve.`);
    }
  }

  return _licenseStatus;
}

// ── Getters ───────────────────────────────────────────────────────────────────
export function getLicenseStatus(): LicenseStatus {
  if (!_licenseStatus) return validateLicenseFile();
  return _licenseStatus;
}

export function isLicenseValid(): boolean {
  return getLicenseStatus().valid;
}

export function getLicensePayload(): LicensePayload | null {
  return getLicenseStatus().payload;
}

/**
 * Verifica se uma feature está habilitada na licença.
 * Se a licença for inválida, retorna false para todas as features.
 */
export function hasFeature(feature: keyof LicenseFeatures): boolean {
  const status = getLicenseStatus();
  if (!status.valid || !status.payload) return false;
  return status.payload.features[feature] === true;
}

/**
 * Verifica se o número de ramais está dentro do limite da licença.
 * Se maxExtensions for 0, não há limite.
 */
export function checkExtensionLimit(currentCount: number): boolean {
  const payload = getLicensePayload();
  if (!payload) return false;
  if (payload.maxExtensions === 0) return true;
  return currentCount < payload.maxExtensions;
}
