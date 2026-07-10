import { Request, Response } from "express";
import { verifyToken } from "../auth";

export { verifyToken };

export const requireAdmin = (req: Request, res: Response, next: any) => {
  if (req.user?.role !== "admin")
    return res.status(403).json({ message: "Acesso negado" });
  return next();
};

export const requireSupervisor = (req: Request, res: Response, next: any) => {
  if (!["admin", "supervisor"].includes(req.user?.role ?? ""))
    return res.status(403).json({ message: "Acesso negado" });
  return next();
};
