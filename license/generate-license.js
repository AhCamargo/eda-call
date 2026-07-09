#!/usr/bin/env node
/**
 * EdaCall — Gerador de Licenças
 * ─────────────────────────────
 * Uso: node generate-license.js
 *
 * Requer: license/keys/private.pem (gerado pelo setup-keys.js)
 * Gera:   <clientId>_<YYYYMMDD>.lic
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

// ── Configurações ─────────────────────────────────────────────────────────────
const KEYS_DIR = path.join(__dirname, "keys");
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, "private.pem");
const OUTPUT_DIR = path.join(__dirname, "generated");

// ── Helpers ───────────────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const ask = (question, defaultVal) =>
  new Promise((resolve) => {
    const hint = defaultVal !== undefined ? ` [${defaultVal}]` : "";
    rl.question(`  ${question}${hint}: `, (answer) => {
      resolve(answer.trim() || defaultVal || "");
    });
  });

const askYesNo = async (question, defaultVal = true) => {
  const hint = defaultVal ? "S/n" : "s/N";
  const answer = await ask(`${question} (${hint})`);
  if (!answer) return defaultVal;
  return answer.toLowerCase().startsWith("s");
};

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function formatDate(date) {
  return date.toISOString().split("T")[0];
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log();
  console.log(bold(cyan("══════════════════════════════════════════")));
  console.log(bold(cyan("   EdaCall — Gerador de Licenças")));
  console.log(bold(cyan("══════════════════════════════════════════")));
  console.log();

  // Verifica chave privada
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    console.error(red(`✖  Chave privada não encontrada em: ${PRIVATE_KEY_PATH}`));
    console.error(red("   Execute: node setup-keys.js"));
    process.exit(1);
  }

  const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, "utf8");

  // ── Coleta de dados ──────────────────────────────────────────────────────
  console.log(bold("● Dados do cliente\n"));

  const clientId = await ask("ID do cliente (ex: cliente-001)");
  if (!clientId) { console.error(red("ID obrigatório.")); process.exit(1); }

  const clientName = await ask("Nome / empresa");
  if (!clientName) { console.error(red("Nome obrigatório.")); process.exit(1); }

  const clientEmail = await ask("E-mail do contato");

  // ── Validade ─────────────────────────────────────────────────────────────
  console.log();
  console.log(bold("● Validade da licença\n"));
  console.log("  1) 30 dias");
  console.log("  2) 90 dias");
  console.log("  3) 6 meses");
  console.log("  4) 1 ano");
  console.log("  5) 2 anos");
  console.log("  6) Vitalício (sem expiração)");
  console.log("  7) Data customizada");
  console.log();

  const validityChoice = await ask("Escolha", "4");
  const now = new Date();
  let expiresAt;

  switch (validityChoice) {
    case "1": expiresAt = addDays(now, 30); break;
    case "2": expiresAt = addDays(now, 90); break;
    case "3": expiresAt = addMonths(now, 6); break;
    case "4": expiresAt = addMonths(now, 12); break;
    case "5": expiresAt = addMonths(now, 24); break;
    case "6": expiresAt = null; break;
    case "7": {
      const raw = await ask("Data (YYYY-MM-DD)");
      expiresAt = new Date(raw);
      if (isNaN(expiresAt.getTime())) {
        console.error(red("Data inválida.")); process.exit(1);
      }
      break;
    }
    default:
      expiresAt = addMonths(now, 12);
  }

  // ── Limites ───────────────────────────────────────────────────────────────
  console.log();
  console.log(bold("● Limites e plano\n"));

  const maxExtensionsRaw = await ask("Máximo de ramais SIP (0 = ilimitado)", "0");
  const maxExtensions = parseInt(maxExtensionsRaw, 10) || 0;

  console.log();
  console.log(bold("● Features habilitadas\n"));

  const featureRecording   = await askYesNo("Gravação de chamadas", true);
  const featureQueues      = await askYesNo("Filas (Queues)", true);
  const featureIvr         = await askYesNo("URA (IVR)", true);
  const featureCampaigns   = await askYesNo("Campanhas (Discador)", false);

  // ── Notas internas ───────────────────────────────────────────────────────
  console.log();
  const notes = await ask("Observações internas (opcional)");

  // ── Resumo ────────────────────────────────────────────────────────────────
  console.log();
  console.log(bold(cyan("── Resumo da licença ──────────────────────")));
  console.log(`  Cliente    : ${bold(clientName)} (${clientId})`);
  console.log(`  E-mail     : ${clientEmail || "-"}`);
  console.log(`  Emitida em : ${formatDate(now)}`);
  console.log(`  Expira em  : ${expiresAt ? formatDate(expiresAt) : bold(yellow("NUNCA (vitalício)"))}`);
  console.log(`  Max ramais : ${maxExtensions === 0 ? "Ilimitado" : maxExtensions}`);
  console.log(`  Features   : ${[
    featureRecording ? "gravação" : null,
    featureQueues    ? "filas"    : null,
    featureIvr       ? "ura"      : null,
    featureCampaigns ? "campanhas": null,
  ].filter(Boolean).join(", ") || "nenhuma"}`);
  if (notes) console.log(`  Notas      : ${notes}`);
  console.log();

  const confirm = await askYesNo("Gerar licença com esses dados?", true);
  if (!confirm) {
    console.log(yellow("Cancelado."));
    rl.close();
    return;
  }

  // ── Geração ───────────────────────────────────────────────────────────────
  const payload = {
    clientId,
    clientName,
    clientEmail: clientEmail || null,
    issuedAt: now.toISOString(),
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    maxExtensions,
    features: {
      recording:  featureRecording,
      queues:     featureQueues,
      ivr:        featureIvr,
      campaigns:  featureCampaigns,
    },
    notes: notes || null,
  };

  const payloadStr = JSON.stringify(payload);
  const sign = crypto.createSign("SHA256");
  sign.update(payloadStr);
  const signature = sign.sign(privateKey, "base64");

  const license = { payload, signature };

  // ── Salvar ────────────────────────────────────────────────────────────────
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const dateSuffix = formatDate(now).replace(/-/g, "");
  const filename = `${clientId}_${dateSuffix}.lic`;
  const outputPath = path.join(OUTPUT_DIR, filename);

  fs.writeFileSync(outputPath, JSON.stringify(license, null, 2), "utf8");

  console.log();
  console.log(green(`✔  Licença gerada: ${bold(outputPath)}`));
  console.log();
  console.log(cyan("  Próximos passos:"));
  console.log(`  1. Envie o arquivo ${bold(filename)} ao cliente`);
  console.log(`  2. Durante a instalação, o cliente informa o caminho do .lic`);
  console.log(`  3. O install.sh valida e instala automaticamente`);
  console.log();

  rl.close();
}

main().catch((err) => {
  console.error(red(`Erro: ${err.message}`));
  process.exit(1);
});
