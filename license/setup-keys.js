#!/usr/bin/env node
/**
 * EdaCall — Geração inicial do par de chaves RSA
 * ─────────────────────────────────────────────
 * Execute UMA VEZ para criar o par de chaves RSA usado para assinar licenças.
 *
 * ⚠  GUARDE private.pem em local seguro e NUNCA comite no git!
 *    A chave pública (public.pem) deve ser copiada para o backend.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const KEYS_DIR = path.join(__dirname, "keys");

const bold  = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow= (s) => `\x1b[33m${s}\x1b[0m`;
const red   = (s) => `\x1b[31m${s}\x1b[0m`;
const cyan  = (s) => `\x1b[36m${s}\x1b[0m`;

if (!fs.existsSync(KEYS_DIR)) fs.mkdirSync(KEYS_DIR, { recursive: true });

const privateKeyPath = path.join(KEYS_DIR, "private.pem");
const publicKeyPath  = path.join(KEYS_DIR, "public.pem");

if (fs.existsSync(privateKeyPath)) {
  console.log(yellow("⚠  Chaves já existem. Delete manualmente se quiser regenerar."));
  console.log(`   ${privateKeyPath}`);
  console.log(`   ${publicKeyPath}`);
  process.exit(0);
}

console.log(cyan("\nGerando par de chaves RSA 2048-bit..."));

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding:  { type: "spki",  format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

fs.writeFileSync(privateKeyPath, privateKey,  { mode: 0o600 });
fs.writeFileSync(publicKeyPath,  publicKey);

console.log(green("\n✔  Par de chaves gerado com sucesso!\n"));
console.log(`   Chave privada : ${bold(privateKeyPath)}`);
console.log(`   Chave pública : ${bold(publicKeyPath)}`);
console.log();
console.log(bold(yellow("  ════════════════════════════════════════════════════════")));
console.log(bold(yellow("  ⚠  IMPORTANTE:")));
console.log(yellow("     1. Guarde private.pem em local seguro (ex: cofre, 1Password)"));
console.log(yellow("     2. Nunca comite private.pem no git (já está no .gitignore)"));
console.log(yellow("     3. Copie o conteúdo de public.pem para o backend:")));
console.log(yellow("        backend/src/services/license.ts → PUBLIC_KEY constant"));
console.log(bold(yellow("  ════════════════════════════════════════════════════════")));
console.log();
console.log(bold("  Chave pública (cole no backend/src/services/license.ts):\n"));
console.log(publicKey);
