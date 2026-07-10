# Plan 003 — URA Reverse: Replace JS Stats Loop with SQL Aggregation

**Status:** DONE  
**Effort:** S  
**Risk:** LOW  

## Why this matters

`emitCampaignStats` in `backend/src/services/uraReverseWorker.ts` (lines 25–51) is called after **every single call event** during a URA reverse campaign. It fetches ALL contacts for the campaign and counts them in JavaScript. For a campaign with 10,000 contacts this is a 10k-row full scan on every hangup — potentially dozens per second during peak dialing.

A single `COUNT ... GROUP BY status` query returns the same answer in one round-trip, regardless of campaign size.

---

## Repo context

- **ORM:** Sequelize 6 (`sequelize` package)
- **DB:** PostgreSQL
- **Model:** `UraReverseContact` — columns include `status` (string), `campaignId` (integer)
- **Sequelize aggregate docs:** use `sequelize.literal`, `fn`, `col`, and `group` on `findAll`
- **Verify command:** `cd backend && pnpm exec tsc --noEmit`

---

## Current state (`uraReverseWorker.ts:25–51`)

```typescript
export const emitCampaignStats = async (campaignId: number) => {
  if (!runningState.io) return;

  const contacts = await UraReverseContact.findAll({
    where: { campaignId },
    attributes: ["status"],
  }) as any[];

  const stats: Record<string, number> = {
    calling: 0, answered: 0, no_answer: 0, invalid: 0,
    busy: 0, hangup: 0, pending: 0, finished: 0,
  };

  for (const contact of contacts) {
    const key = contact.status;
    if (stats[key] === undefined) continue;
    stats[key] += 1;
  }

  runningState.io.emit("ura-reverse:stats", { campaignId, stats });
};
```

---

## What to do

Replace the `findAll` + JS loop with a Sequelize `GROUP BY` aggregate query. The import for `sequelize` (the instance) is NOT currently imported in `uraReverseWorker.ts` — import `sequelize` from `"../db"`.

```typescript
import { Op } from "sequelize";
import { sequelize, UraReverseCampaign, UraReverseContact, UraReverseOption, VoipLine } from "../db";
// Add sequelize to the existing import ↑

export const emitCampaignStats = async (campaignId: number) => {
  if (!runningState.io) return;

  const rows = await UraReverseContact.findAll({
    where: { campaignId },
    attributes: [
      "status",
      [sequelize.fn("COUNT", sequelize.col("id")), "count"],
    ],
    group: ["status"],
    raw: true,
  }) as unknown as Array<{ status: string; count: string }>;

  const stats: Record<string, number> = {
    calling: 0, answered: 0, no_answer: 0, invalid: 0,
    busy: 0, hangup: 0, pending: 0, finished: 0,
  };

  for (const row of rows) {
    if (row.status in stats) {
      stats[row.status] = Number(row.count);
    }
  }

  runningState.io.emit("ura-reverse:stats", { campaignId, stats });
};
```

> **Why `count` is a string:** PostgreSQL returns `COUNT(*)` as a string in the raw result. `Number(row.count)` converts it correctly.

---

## Files in scope

- `backend/src/services/uraReverseWorker.ts`

## Files explicitly out of scope

Everything else. Do not modify `db.ts`, `routes.ts`, or any other service.

---

## Verification

```bash
cd /Users/ohcamargo/Documents/eda-call/backend && pnpm exec tsc --noEmit
```

Expected: zero TypeScript errors.

---

## Done criteria

1. `tsc --noEmit` exits 0.
2. `emitCampaignStats` does NOT call `findAll` with `attributes: ["status"]` and loop in JS.
3. `emitCampaignStats` uses a single `findAll` with `group: ["status"]` and `fn("COUNT", ...)`.
4. `sequelize` is imported from `"../db"` in `uraReverseWorker.ts`.
5. The emitted payload shape (`{ campaignId, stats }`) is unchanged.
