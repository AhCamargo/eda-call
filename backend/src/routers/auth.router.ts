import express, { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { login } from "../auth";
import { verifyToken, requireAdmin } from "../middleware/auth";
import { User } from "../db";

export const createAuthRouter = () => {
  const router = express.Router();

  // Rate limiter: máx 10 tentativas de login por IP a cada 15 min
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Muitas tentativas de login. Tente novamente em 15 minutos." },
  });

  router.post("/auth/login", loginLimiter, login);

  // Retorna dados do usuário autenticado
  router.get("/auth/me", verifyToken, async (req: Request, res: Response) => {
    const user = await User.findByPk(req.user!.id, {
      attributes: ["id", "username", "role"],
    });
    if (!user)
      return res.status(404).json({ message: "Usuário não encontrado" });
    return res.json(user);
  });

  // Altera senha do próprio usuário autenticado
  router.patch("/auth/me/password", verifyToken, async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ message: "Preencha todos os campos" });
    if (String(newPassword).length < 6)
      return res.status(400).json({ message: "A nova senha deve ter pelo menos 6 caracteres" });
    const user = (await User.findByPk(req.user!.id)) as any;
    if (!user) return res.status(404).json({ message: "Usuário não encontrado" });
    const valid = bcrypt.compareSync(String(currentPassword), user.passwordHash);
    if (!valid) return res.status(401).json({ message: "Senha atual incorreta" });
    user.passwordHash = bcrypt.hashSync(String(newPassword), 10);
    await user.save();
    return res.json({ message: "Senha alterada com sucesso" });
  });

  // ── CRUD de Usuários (admin only) ────────────────────────────────
  router.get(
    "/users",
    verifyToken,
    requireAdmin,
    async (req: Request, res: Response) => {
      const users = await User.findAll({
        attributes: ["id", "username", "role", "createdAt"],
        order: [["createdAt", "ASC"]],
      });
      return res.json(users);
    },
  );

  router.post(
    "/users",
    verifyToken,
    requireAdmin,
    async (req: Request, res: Response) => {
      const { username, password, role } = req.body;
      if (!username || !password || !role)
        return res.status(400).json({ message: "Preencha todos os campos" });
      if (!["admin", "supervisor", "agent"].includes(role))
        return res.status(400).json({ message: "Role inválido" });
      const existing = await User.findOne({ where: { username } });
      if (existing)
        return res.status(409).json({ message: "Username já existe" });
      const passwordHash = bcrypt.hashSync(password, 10);
      const user = await User.create({ username, passwordHash, role });
      return res.status(201).json({
        id: (user as any).id,
        username: (user as any).username,
        role: (user as any).role,
        createdAt: (user as any).createdAt,
      });
    },
  );

  router.patch(
    "/users/:id",
    verifyToken,
    requireAdmin,
    async (req: Request, res: Response) => {
      const user = (await User.findByPk(req.params.id as string)) as any;
      if (!user)
        return res.status(404).json({ message: "Usuário não encontrado" });
      const { username, password, role } = req.body;
      if (username) user.username = username;
      if (password) user.passwordHash = bcrypt.hashSync(password, 10);
      if (role && ["admin", "supervisor", "agent"].includes(role))
        user.role = role;
      await user.save();
      return res.json({
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt,
      });
    },
  );

  router.delete(
    "/users/:id",
    verifyToken,
    requireAdmin,
    async (req: Request, res: Response) => {
      if (String(req.user!.id) === String(req.params.id))
        return res
          .status(400)
          .json({ message: "Não é possível excluir sua própria conta" });
      const user = await User.findByPk(req.params.id as string);
      if (!user)
        return res.status(404).json({ message: "Usuário não encontrado" });
      await user.destroy();
      return res.json({ message: "Usuário excluído" });
    },
  );

  return router;
};
