import { vi, describe, it, expect, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import config from "./config";

const { User } = vi.hoisted(() => ({ User: { findByPk: vi.fn(), findOne: vi.fn() } }));
vi.mock("./db", () => ({ User }));

import { login, verifyToken } from "./auth";

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe("JWT — emissão e revogação por tokenVersion (achado R3 da auditoria)", () => {
  beforeEach(() => {
    User.findByPk.mockReset();
    User.findOne.mockReset();
  });

  it("login inclui tokenVersion no payload do token", async () => {
    User.findOne.mockResolvedValue({
      id: 1,
      username: "admin",
      role: "admin",
      passwordHash: bcrypt.hashSync("123456", 10),
      tokenVersion: 3,
    });

    const req = { body: { username: "admin", password: "123456" } } as Request;
    const res = makeRes();
    await login(req, res);

    const token = (res.json as any).mock.calls[0][0].token;
    const decoded = jwt.verify(token, config.jwtSecret) as any;
    expect(decoded.tokenVersion).toBe(3);
  });

  it("verifyToken aceita um token cuja tokenVersion bate com a do banco", async () => {
    const token = jwt.sign({ id: 1, role: "agent", username: "joao", tokenVersion: 2 }, config.jwtSecret);
    User.findByPk.mockResolvedValue({ id: 1, role: "agent", username: "joao", tokenVersion: 2 });

    const req = { headers: { authorization: `Bearer ${token}` } } as unknown as Request;
    const res = makeRes();
    const next = vi.fn();
    await verifyToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({ id: 1, role: "agent", username: "joao" });
  });

  it("verifyToken rejeita um token emitido antes de uma troca de senha (tokenVersion desatualizada)", async () => {
    const token = jwt.sign({ id: 1, role: "agent", username: "joao", tokenVersion: 1 }, config.jwtSecret);
    // Senha foi trocada depois que o token foi emitido -> tokenVersion incrementada no banco
    User.findByPk.mockResolvedValue({ id: 1, role: "agent", username: "joao", tokenVersion: 2 });

    const req = { headers: { authorization: `Bearer ${token}` } } as unknown as Request;
    const res = makeRes();
    const next = vi.fn();
    await verifyToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("verifyToken rejeita um token de um usuário que foi deletado", async () => {
    const token = jwt.sign({ id: 99, role: "agent", username: "ex-funcionario", tokenVersion: 0 }, config.jwtSecret);
    User.findByPk.mockResolvedValue(null);

    const req = { headers: { authorization: `Bearer ${token}` } } as unknown as Request;
    const res = makeRes();
    const next = vi.fn();
    await verifyToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("verifyToken aceita um token antigo (sem tokenVersion no payload) enquanto o usuário estiver na versão 0", async () => {
    // Compatibilidade com tokens emitidos antes desta correção existir.
    const token = jwt.sign({ id: 1, role: "agent", username: "joao" }, config.jwtSecret);
    User.findByPk.mockResolvedValue({ id: 1, role: "agent", username: "joao", tokenVersion: 0 });

    const req = { headers: { authorization: `Bearer ${token}` } } as unknown as Request;
    const res = makeRes();
    const next = vi.fn();
    await verifyToken(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
