import express, { Request, Response } from "express";
import { verifyToken } from "../middleware/auth";
import { InboundRoute } from "../db";
import {
  upsertInboundDidRoute,
  removeInboundDidRoute,
  reprovisionAllInboundDidRoutes,
} from "../services/asteriskProvisioning";

export const createInboundRoutesRouter = () => {
  const router = express.Router();

  // ── Roteamento de Entrada (DID → Ramal) ───────────────────────────────────

  router.get("/inbound-routes", verifyToken, async (_req: Request, res: Response) => {
    const routes = await InboundRoute.findAll({ order: [["priority", "ASC"], ["did", "ASC"]] });
    return res.json(routes);
  });

  router.post("/inbound-routes", verifyToken, async (req: Request, res: Response) => {
    const { did, description, destinationType = "extension", destinationTarget, priority = 0, enabled = true } = req.body || {};
    if (!did || !/^\d{8,15}$/.test(String(did))) {
      return res.status(400).json({ message: "DID inválido (somente dígitos, 8-15 caracteres)" });
    }
    if (!destinationTarget || !String(destinationTarget).trim()) {
      return res.status(400).json({ message: "Destino obrigatório" });
    }
    try {
      const route = await InboundRoute.create({
        did: String(did).trim(),
        description: description ? String(description).trim() : null,
        destinationType: String(destinationType),
        destinationTarget: String(destinationTarget).trim(),
        priority: Number(priority) || 0,
        enabled: Boolean(enabled),
      });
      if (Boolean(enabled)) {
        await upsertInboundDidRoute({ did: String(did).trim(), destinationType: String(destinationType), destinationTarget: String(destinationTarget).trim() });
      }
      return res.status(201).json(route);
    } catch (err: any) {
      if (err.name === "SequelizeUniqueConstraintError") {
        return res.status(409).json({ message: "DID já cadastrado" });
      }
      return res.status(500).json({ message: "Erro ao criar rota", detail: err.message });
    }
  });

  router.patch("/inbound-routes/:id", verifyToken, async (req: Request, res: Response) => {
    const route = await InboundRoute.findByPk(String(req.params.id));
    if (!route) return res.status(404).json({ message: "Rota não encontrada" });

    const oldDid = String((route as any).did);
    const newDid = req.body?.did !== undefined ? String(req.body.did).trim() : oldDid;

    if (req.body?.did !== undefined && !/^\d{8,15}$/.test(newDid)) {
      return res.status(400).json({ message: "DID inválido (somente dígitos, 8-15 caracteres)" });
    }

    const newTarget = req.body?.destinationTarget !== undefined
      ? String(req.body.destinationTarget).trim()
      : String((route as any).destinationTarget);
    const newEnabled = req.body?.enabled !== undefined ? Boolean(req.body.enabled) : Boolean((route as any).enabled);

    if (!newTarget) return res.status(400).json({ message: "Destino obrigatório" });

    try {
      await route.update({
        did: newDid,
        description: req.body?.description !== undefined ? (req.body.description ? String(req.body.description).trim() : null) : (route as any).description,
        destinationType: req.body?.destinationType || (route as any).destinationType,
        destinationTarget: newTarget,
        priority: req.body?.priority !== undefined ? Number(req.body.priority) : (route as any).priority,
        enabled: newEnabled,
      });

      if (oldDid !== newDid) {
        await removeInboundDidRoute({ did: oldDid });
      }
      if (newEnabled) {
        const newType = req.body?.destinationType !== undefined ? String(req.body.destinationType) : String((route as any).destinationType);
        await upsertInboundDidRoute({ did: newDid, destinationType: newType, destinationTarget: newTarget });
      } else {
        await removeInboundDidRoute({ did: newDid });
      }
      return res.json(route);
    } catch (err: any) {
      if (err.name === "SequelizeUniqueConstraintError") {
        return res.status(409).json({ message: "DID já cadastrado" });
      }
      return res.status(500).json({ message: "Erro ao atualizar rota", detail: err.message });
    }
  });

  router.delete("/inbound-routes/:id", verifyToken, async (req: Request, res: Response) => {
    const route = await InboundRoute.findByPk(String(req.params.id));
    if (!route) return res.status(404).json({ message: "Rota não encontrada" });
    const did = String((route as any).did);
    await route.destroy();
    await removeInboundDidRoute({ did });
    return res.json({ message: "Rota removida" });
  });

  router.post("/inbound-routes/reprovision-all", verifyToken, async (_req: Request, res: Response) => {
    const routes = await InboundRoute.findAll();
    await reprovisionAllInboundDidRoutes(
      routes.map((r: any) => ({ did: r.did, destinationType: r.destinationType, destinationTarget: r.destinationTarget, enabled: r.enabled })),
    );
    return res.json({ total: routes.length });
  });

  return router;
};
