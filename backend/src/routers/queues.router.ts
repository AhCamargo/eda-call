import express, { Request, Response } from "express";
import { AsteriskQueue, AsteriskQueueMember } from "../db";
import { upsertQueue, removeQueue } from "../services/asteriskProvisioning";

export const createQueuesRouter = () => {
  const router = express.Router();

  // ── Filas (Asterisk Queues) ─────────────────────────────────────────────

  router.get("/queues", async (_req: Request, res: Response) => {
    const queues = (await AsteriskQueue.findAll({
      include: [{ model: AsteriskQueueMember, as: "members" }],
      order: [["name", "ASC"]],
    })) as any[];
    return res.json(queues.map((q) => q.toJSON()));
  });

  router.get("/queues/:id", async (req: Request, res: Response) => {
    const queue = (await AsteriskQueue.findByPk(req.params.id as string, {
      include: [{ model: AsteriskQueueMember, as: "members" }],
    })) as any;
    if (!queue) return res.status(404).json({ message: "Fila não encontrada" });
    return res.json(queue.toJSON());
  });

  router.post("/queues", async (req: Request, res: Response) => {
    const {
      name,
      strategy = "ringall",
      timeout = 30,
      maxlen = 0,
      wrapuptime = 0,
      musiconhold = null,
      announce = null,
      members = [],
    } = req.body;

    if (!name) return res.status(400).json({ message: "name é obrigatório" });

    const queue = (await AsteriskQueue.create({
      name: String(name).trim().toLowerCase().replace(/\s+/g, "-"),
      strategy,
      timeout: Number(timeout),
      maxlen: Number(maxlen),
      wrapuptime: Number(wrapuptime),
      musiconhold: musiconhold || null,
      announce: announce || null,
    })) as any;

    const createdMembers: any[] = [];
    for (const m of members as any[]) {
      const member = await AsteriskQueueMember.create({
        queueId: queue.id,
        extensionNumber: String(m.extensionNumber).trim(),
        penalty: Number(m.penalty ?? 0),
      });
      createdMembers.push((member as any).toJSON());
    }

    await upsertQueue({
      name: queue.name,
      strategy: queue.strategy,
      timeout: queue.timeout,
      maxlen: queue.maxlen,
      wrapuptime: queue.wrapuptime,
      musiconhold: queue.musiconhold,
      announce: queue.announce,
      members: createdMembers,
    });

    return res.status(201).json({ ...queue.toJSON(), members: createdMembers });
  });

  router.put("/queues/:id", async (req: Request, res: Response) => {
    const queue = (await AsteriskQueue.findByPk(req.params.id as string, {
      include: [{ model: AsteriskQueueMember, as: "members" }],
    })) as any;
    if (!queue) return res.status(404).json({ message: "Fila não encontrada" });

    const { name, strategy, timeout, maxlen, wrapuptime, musiconhold, announce, members } = req.body;

    const oldName = queue.name;
    if (name !== undefined) queue.name = String(name).trim().toLowerCase().replace(/\s+/g, "-");
    if (strategy !== undefined) queue.strategy = strategy;
    if (timeout !== undefined) queue.timeout = Number(timeout);
    if (maxlen !== undefined) queue.maxlen = Number(maxlen);
    if (wrapuptime !== undefined) queue.wrapuptime = Number(wrapuptime);
    if (musiconhold !== undefined) queue.musiconhold = musiconhold || null;
    if (announce !== undefined) queue.announce = announce || null;
    await queue.save();

    let updatedMembers = queue.members?.map((m: any) => m.toJSON()) ?? [];
    if (Array.isArray(members)) {
      await AsteriskQueueMember.destroy({ where: { queueId: queue.id } });
      updatedMembers = [];
      for (const m of members) {
        const member = await AsteriskQueueMember.create({
          queueId: queue.id,
          extensionNumber: String(m.extensionNumber).trim(),
          penalty: Number(m.penalty ?? 0),
        });
        updatedMembers.push((member as any).toJSON());
      }
    }

    if (oldName !== queue.name) {
      await removeQueue({ name: oldName });
    }
    await upsertQueue({
      name: queue.name,
      strategy: queue.strategy,
      timeout: queue.timeout,
      maxlen: queue.maxlen,
      wrapuptime: queue.wrapuptime,
      musiconhold: queue.musiconhold,
      announce: queue.announce,
      members: updatedMembers,
    });

    return res.json({ ...queue.toJSON(), members: updatedMembers });
  });

  router.delete("/queues/:id", async (req: Request, res: Response) => {
    const queue = (await AsteriskQueue.findByPk(req.params.id as string)) as any;
    if (!queue) return res.status(404).json({ message: "Fila não encontrada" });

    await removeQueue({ name: queue.name });
    await AsteriskQueueMember.destroy({ where: { queueId: queue.id } });
    await queue.destroy();
    return res.json({ message: "Fila removida com sucesso" });
  });

  return router;
};
