# Plan 001 — Security Fixes (Bundle #1 + #2 + #3)

**Status:** DONE  
**Effort:** S  
**Risk:** LOW  

## Why this matters

Three independent security bugs in `backend/src/routes.ts` and `backend/src/config.ts`:

1. Any `agent` role can call supervisor-only endpoints (spy, force-pause, resume agents) because the routes only check `verifyToken` but not role.
2. `/internal/ura/log` has no authentication when `INTERNAL_API_KEY` is unset (the default), letting anyone inject fake URA callback data.
3. SIP passwords are generated with `Math.random()` (not CSPRNG), making them statistically predictable.

---

## Repo context

- **Package manager:** pnpm (workspaces at root)
- **Backend:** Node.js + Express + TypeScript, no test suite
- **Verify command:** `cd backend && pnpm exec tsc --noEmit`
- **Code style:** TypeScript, no comments on obvious code, async route handlers, middleware chained as arguments to `router.get/post/...`

---

## Fix 1 — Supervisor role check (`routes.ts:332–426`)

### Current state

```typescript
// routes.ts:332 — only verifyToken, no role check
router.get("/supervisor/agents", verifyToken, async (req, res) => { ... });
router.post("/supervisor/agents/:id/force-pause", verifyToken, async ...);
router.post("/supervisor/agents/:id/spy", verifyToken, async ...);
router.post("/supervisor/agents/:id/resume", verifyToken, async ...);
```

### What to do

There is already a `requireAdmin` middleware defined at `routes.ts:197`:
```typescript
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") return res.status(403).json({ message: "Acesso negado" });
  return next();
};
```

Create a parallel middleware `requireSupervisor` that allows both `admin` and `supervisor` roles. Define it immediately after `requireAdmin` (around line 201). Then add it to the four supervisor routes.

```typescript
// Add after requireAdmin definition (~line 201)
const requireSupervisor = (req: Request, res: Response, next: any) => {
  if (!["admin", "supervisor"].includes(req.user?.role ?? ""))
    return res.status(403).json({ message: "Acesso negado" });
  return next();
};
```

Then add `requireSupervisor` to each of the four routes:
- `router.get("/supervisor/agents", verifyToken, requireSupervisor, async ...)`
- `router.post("/supervisor/agents/:id/force-pause", verifyToken, requireSupervisor, async ...)`
- `router.post("/supervisor/agents/:id/spy", verifyToken, requireSupervisor, async ...)`
- `router.post("/supervisor/agents/:id/resume", verifyToken, requireSupervisor, async ...)`

---

## Fix 2 — `/internal/ura/log` must always require key (`routes.ts:428–435`)

### Current state

```typescript
router.post("/internal/ura/log", async (req, res) => {
  const configuredKey = config.internalApiKey;
  if (configuredKey) {          // ← skips auth when key is ""
    const receivedKey = req.headers["x-internal-key"];
    if (receivedKey !== configuredKey) {
      return res.status(401).json({ message: "Chave interna inválida" });
    }
  }
  ...
});
```

`config.internalApiKey` defaults to `""` (config.ts:16: `process.env.INTERNAL_API_KEY || ""`).

### What to do

Change the guard to ALWAYS enforce the key check. If the key is not configured, refuse the request and log a warning so operators know they need to set `INTERNAL_API_KEY`.

Replace the guard block (lines 429–435) with:

```typescript
const configuredKey = config.internalApiKey;
if (!configuredKey) {
  logger.warn("[internal/ura/log] INTERNAL_API_KEY não configurada — requisição recusada");
  return res.status(503).json({ message: "Endpoint interno não configurado" });
}
const receivedKey = req.headers["x-internal-key"];
if (receivedKey !== configuredKey) {
  return res.status(401).json({ message: "Chave interna inválida" });
}
```

Also update `backend/src/config.ts` to log a startup warning (not a process.exit) when `INTERNAL_API_KEY` is missing, so operators are aware during boot. Add after the `internalApiKey` line:

```typescript
// In config object (not at top-level, since config is exported as object):
// After building the config object, before `export default config;`:
if (!process.env.INTERNAL_API_KEY) {
  console.warn("[CONFIG] INTERNAL_API_KEY não definida. O endpoint /internal/ura/log ficará indisponível até ser configurado.");
}
```

---

## Fix 3 — Replace `Math.random()` with `crypto.randomBytes()` (`routes.ts:937–944`)

### Current state

```typescript
function generateRandomPassword(length = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}
```

Also `routes.ts:1768`:
```typescript
const uraRef = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
```

### What to do

`crypto` is already available in Node.js without installation. Add `import { randomBytes } from "crypto";` to the imports at the top of routes.ts (after the existing imports).

Replace `generateRandomPassword`:
```typescript
function generateRandomPassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
```

Replace the `uraRef` at line 1768:
```typescript
const uraRef = `${Date.now()}-${randomBytes(6).toString("hex")}`;
```

---

## Files in scope

- `backend/src/routes.ts`
- `backend/src/config.ts`

## Files explicitly out of scope

Everything else. Do NOT modify `db.ts`, `auth.ts`, `server.ts`, or any service files.

---

## Verification

```bash
cd /Users/ohcamargo/Documents/eda-call/backend && pnpm exec tsc --noEmit
```

Expected: zero TypeScript errors.

---

## Done criteria

1. `tsc --noEmit` exits 0.
2. `routes.ts` — `requireSupervisor` middleware exists and is applied to all four supervisor routes.
3. `routes.ts` — `/internal/ura/log` handler refuses with 503 when key is not configured.
4. `routes.ts` — `generateRandomPassword` uses `randomBytes`.
5. `routes.ts` — `uraRef` uses `randomBytes(6).toString("hex")`.
6. No new `Math.random()` calls introduced.
