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

  const validPassword = bcrypt.compareSync(password, user.passwordHash);
  if (!validPassword) {
    return res.status(401).json({ message: "Senha inválida" });
  }

  const token = jwt.sign({ id: user.id, role: user.role, username: user.username }, config.jwtSecret, {
    expiresIn: "8h",
  });
  return res.json({ token });
};

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(403).json({ message: "Token ausente" });
  }

  try {
    req.user = jwt.verify(token, config.jwtSecret) as { id: number; role: string; username: string };
    return next();
  } catch {
    return res.status(401).json({ message: "Token inválido" });
  }
};
