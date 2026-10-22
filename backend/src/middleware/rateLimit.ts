import rateLimit from "express-rate-limit";

// Limite genérico para rotas sensíveis (troca de senha, criação de usuário,
// provisionamento no Asterisk, início de campanha, upload de arquivo) — alto
// o suficiente para não travar uso manual normal do painel, baixo o
// suficiente para impedir abuso automatizado por uma conta comprometida
// (ver achado R2 da auditoria de segurança).
export const actionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Muitas requisições. Tente novamente em instantes." },
});
