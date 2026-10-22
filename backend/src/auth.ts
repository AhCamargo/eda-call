import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Request, Response, NextFunction } from "express";
import { User } from "./db";
import config from "./config";

declare global {
  namespace Express {
    interface Request {
      user?: { id: number; role: string; username: string };
    }
  }
}

export const login = async (req: Request, res: Response) => {
  const { username, password } = req.body;
  const user = await User.findOne({ where: { username } });

  if (!user) {
    return res.status(404).json({ message: "Usuário não encontrado" });
  }

  const u = user as any;
  const validPassword = bcrypt.compareSync(password, u.passwordHash);
  if (!validPassword) {
    return res.status(401).json({ message: "Senha inválida" });
  }

  const token = jwt.sign(
    { id: u.id, role: u.role, username: u.username, tokenVersion: u.tokenVersion },
    config.jwtSecret,
    {
      expiresIn: "8h",
    },
  );
  return res.json({ token });
};

export const verifyToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(403).json({ message: "Token ausente" });
  }

  let decoded: { id: number; role: string; username: string; tokenVersion?: number };
  try {
    decoded = jwt.verify(token, config.jwtSecret) as typeof decoded;
  } catch {
    return res.status(401).json({ message: "Token inválido" });
  }

  // Consulta leve por PK (indexada) — permite revogar o token imediatamente
  // ao trocar senha/papel ou deletar o usuário, em vez de esperar a
  // expiração natural de até 8h (achado R3 da auditoria de segurança).
  const user = (await User.findByPk(decoded.id)) as any;
  if (!user || user.tokenVersion !== (decoded.tokenVersion ?? 0)) {
    return res
      .status(401)
      .json({ message: "Sessão inválida ou expirada. Faça login novamente." });
  }

  req.user = { id: user.id, role: user.role, username: user.username };
  return next();
};
