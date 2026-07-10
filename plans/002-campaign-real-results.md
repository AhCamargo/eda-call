# Plan 002 — CampaignRunner: Replace Fake Results with Real AMI Data

**Status:** DONE (Step 3 skipped — see note below)  
**Effort:** M  
**Risk:** LOW  

> **Nota (2026-07-10):** o `UraLog.create` dentro do loop (Step 3) **é**
> referenciado em outro lugar: `GET /reports/ura-logs` (`routes.ts:2027`) lê
> todos os `UraLog` com join em `Campaign`, e são exatamente essas linhas
> criadas pelo `campaignRunner` que aparecem nesse relatório. Como o `result`
> agora vem do evento `Hangup` real (Steps 1 e 2), o `UraLog.create` foi
> mantido sem alterações — o relatório passa a mostrar dados reais em vez de
> aleatórios, sem precisar remover a chamada.

## Why this matters

`backend/src/services/campaignRunner.ts` calls `originateCall()` to place calls, then immediately logs a **randomly generated result** (`atendida`, `nao_atendida`, etc.) without waiting for Asterisk to report the actual outcome. All `CallLog` and `UraLog` records for the simple campaigns (`/campanhas/discador`) contain fabricated data. Reports built on top of these logs are meaningless.

The URA reversa worker (`uraReverseWorker.ts`) already does this correctly via an AMI callback to `/internal/ura/log`. The simple campaign runner needs the same approach: track the `UniqueID` from the Originate response, then listen for the AMI `Hangup` event to record the real result.

---

## Repo context

- **Package manager:** pnpm
- **Backend:** Node.js + Express + TypeScript
- **AMI client:** `asterisk-manager` npm package, singleton exported from `backend/src/ami.ts` via `getAmiClient()`
- **AMI events:** the client emits `event` for every AMI event; `event.Event` identifies the type (e.g. `"Hangup"`)
- **Verify command:** `cd backend && pnpm exec tsc --noEmit`
- **Code style:** TypeScript, no comments unless non-obvious, prefer `Promise`-based patterns

---

## Current state

In `backend/src/services/campaignRunner.ts`:

```typescript
// lines 66-82
try {
  await originateCall(contact.phoneNumber, extension?.number || "1000", voipLine?.name || null);
} catch {}

const result = randomResult();   // ← FAKE — should come from AMI Hangup event
const callLog = await CallLog.create({
  ...
  result,
});
```

`originateCall` in `backend/src/ami.ts` (lines 26-52) returns a Promise that resolves with the Originate response. The response contains a `Uniqueid` field (e.g. `"1720000000.42"`) that identifies the channel. When the call ends, Asterisk fires a `Hangup` event with the same `Uniqueid` and a `Cause` field.

AMI Cause codes → result mapping:
- 16 (Normal clearing, answered) → `"atendida"`
- 19, 21 (No answer / rejected) → `"nao_atendida"`
- 1 (Unallocated number) → `"numero_nao_existe"`
- 17, 21 (User busy / rejected) → `"rejeitada"`
- All others → `"nao_atendida"`

---

## What to do

### Step 1 — Add a `waitForHangup` helper in `campaignRunner.ts`

Add a helper that registers a one-time listener on the AMI client for a `Hangup` event matching a given `Uniqueid`, with a timeout fallback.

```typescript
import { getAmiClient } from "../ami";

const CAUSE_TO_RESULT: Record<number, string> = {
  16: "atendida",
  1:  "numero_nao_existe",
  17: "rejeitada",
  21: "rejeitada",
};

const waitForHangup = (uniqueid: string, timeoutMs = 60000): Promise<string> =>
  new Promise((resolve) => {
    const ami = getAmiClient();
    const timer = setTimeout(() => {
      ami.removeListener("managerevent", handler);
      resolve("nao_atendida");
    }, timeoutMs);

    const handler = (event: any) => {
      if (event.Event !== "Hangup") return;
      if (event.Uniqueid !== uniqueid && event.Linkedid !== uniqueid) return;
      clearTimeout(timer);
      ami.removeListener("managerevent", handler);
      const cause = Number(event.Cause ?? event.cause ?? 0);
      resolve(CAUSE_TO_RESULT[cause] ?? "nao_atendida");
    };

    ami.on("managerevent", handler);
  });
```

> **Note:** `asterisk-manager` emits AMI events as `"managerevent"`. Verify this by checking how `amiStatusMonitor.ts` registers listeners — it uses `amiClient.on("managerevent", ...)` (e.g. `amiStatusMonitor.ts:~120`). Use the same event name.

### Step 2 — Update `runCampaign` to use real results

Replace the block that calls `randomResult()` with a proper originate-then-wait pattern:

```typescript
// Remove: const randomResult = () => { ... }
// Remove: const result = randomResult();

// Replace with:
let uniqueid: string | null = null;
try {
  const response: any = await originateCall(
    contact.phoneNumber,
    extension?.number || "1000",
    voipLine?.name || null,
  );
  uniqueid = response?.Uniqueid ?? response?.uniqueid ?? null;
} catch {
  // originate failed (channel busy, no route, etc.)
}

const result = uniqueid
  ? await waitForHangup(uniqueid, 60000)
  : "nao_atendida";
```

The `campaign.intervalSeconds` sleep already follows this block — no change needed there.

### Step 3 — Remove dead code

Remove the `randomResult` function entirely. Remove the unused `UraLog.create` call inside the campaign loop (lines 86-94) — the `UraLog` table is for URA reverse campaigns only; simple campaigns log to `CallLog`.

**STOP if:** the `UraLog.create` inside `runCampaign` is referenced anywhere else in routes.ts (search for "UraLog.create" in the campaign runner context). Report back if it is — don't remove it silently.

---

## Files in scope

- `backend/src/services/campaignRunner.ts`

## Files explicitly out of scope

- `backend/src/ami.ts` — read it to understand the API but do not modify it
- `backend/src/routes.ts` — do not touch
- `backend/src/services/uraReverseWorker.ts` — do not touch

---

## Verification

```bash
cd /Users/ohcamargo/Documents/eda-call/backend && pnpm exec tsc --noEmit
```

Expected: zero TypeScript errors.

---

## Done criteria

1. `tsc --noEmit` exits 0.
2. `campaignRunner.ts` contains NO `randomResult` function.
3. `campaignRunner.ts` calls `waitForHangup` after each `originateCall`.
4. `CallLog.create` is called with a real result string from `waitForHangup` (not a random value).
5. No new imports added that aren't already in the `backend` package.json dependencies.
