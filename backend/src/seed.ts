import bcrypt from "bcryptjs";
import { User } from "./db";
import logger from "./logger";

/**
 * Cria o usuário admin no primeiro boot.
 * A senha é lida de ADMIN_PASSWORD (variável de ambiente).
 * Se não definida, gera uma senha aleatória e a exibe no log UMA VEZ.
 * Em produção, sempre defina ADMIN_PASSWORD via .env / Coolify.
 */
export const seedAdmin = async () => {
  const existing = await User.findOne({ where: { username: "admin" } });
  if (existing) return;

  const envPassword = process.env.ADMIN_PASSWORD;
  let password: string;

  if (envPassword && envPassword.length >= 6) {
    password = envPassword;
  } else {
    // Gera senha aleatória segura para o primeiro boot
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
    password = Array.from({ length: 14 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join("");
    logger.warn(
      `[seed] ADMIN_PASSWORD não definido. Senha gerada automaticamente: ${password}` +
      ` — Salve esta senha agora! Ela não será exibida novamente.`
    );
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  await User.create({ username: "admin", passwordHash, role: "admin" });
  logger.info("[seed] Usuário admin criado com sucesso.");
};
