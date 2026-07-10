import express, { Response } from "express";
import { Extension, Campaign } from "../db";

export const createDashboardRouter = () => {
  const router = express.Router();

  router.get("/dashboard", async (_, res: Response) => {
    const extensions = (await Extension.findAll()) as any[];
    const campaigns = await Campaign.findAll({
      order: [["createdAt", "DESC"]],
      limit: 5,
    });

    const statusCounts: Record<string, number> = {
      online: 0,
      offline: 0,
      paused: 0,
      ringing: 0,
      in_call: 0,
      in_campaign: 0,
    };

    for (const extension of extensions) {
      statusCounts[extension.status] += 1;
    }

    res.json({ statusCounts, latestCampaigns: campaigns });
  });

  return router;
};
