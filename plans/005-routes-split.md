# Plan 005 — Split `routes.ts` Monolith into Domain Routers

**Status:** DONE  
**Effort:** L  
**Risk:** MEDIUM  

> **Nota (2026-07-10):** `routes.ts` caiu de ~2870 para 77 linhas (orquestrador).
> 14 routers de domínio em `src/routers/`, middleware compartilhado em
> `src/middleware/auth.ts` (`verifyToken`, `requireAdmin`, `requireSupervisor`),
> utilitários em `src/utils/routeHelpers.ts`. `/reports/*` ganhou um
> `reports.router.ts` próprio (não estava na lista do plano). `agent-reports`
> ficou em arquivo separado de `/dashboard` (não juntos como sugerido) para
> preservar um detalhe sutil do comportamento original: o middleware de erro
> customizado (`router.use((err,...) => ...)`) só cobre as rotas registradas
> antes dele — no arquivo original `/agent-reports/*` já vinha depois desse
> middleware e por isso cai no handler de erro padrão do Express, não no
> formatador JSON customizado. Juntar os dois no mesmo arquivo mudaria esse
> comportamento (mesmo sendo uma peculiaridade obscura). Verificação de
> paridade: os 52 pares método+path batem 1:1 entre o arquivo original e os
> novos routers (script de diff), contagem de `requireAdmin`/`requireSupervisor`
> idêntica, `tsc --noEmit` limpo, 20/20 testes passando, e `createRoutes(io)`
> carrega e monta sem erros num smoke test isolado.

## Why this matters

`backend/src/routes.ts` is 2865 lines covering ~15 unrelated domains (users, extensions, campaigns, URA, supervisor, recordings, security, settings, etc.). It imports every model, every service, and every utility. Any change risks accidental side effects on unrelated domains. Navigation is essentially impossible.

This plan extracts each domain into its own router file without changing any business logic. The end result is identical runtime behaviour — only file organization changes.

---

## Repo context

- **Package manager:** pnpm
- **Express version:** 4.x
- **Router pattern:** `express.Router()` — each domain file exports a factory `(io: Server) => Router`
- **Auth middlewares:** `verifyToken` and `requireAdmin` are defined in `routes.ts`; they must be moved to a shared middleware file
- **Shared utilities:** `asyncHandler`, `normalizePhone`, `normalizeExtensionNumber`, `isValidExtensionNumber`, `extractSector`, `withExtensionSector`, `toRecordingWebPath`, `parseWavFormat` — these are also defined in routes.ts and must move to a shared utilities file
- **Verify command:** `cd backend && pnpm exec tsc --noEmit`
- **Code style:** TypeScript, named exports, no default exports on routers (use named factory export)

---

## Target structure

```
backend/src/
  routes.ts                       ← becomes thin orchestrator (import + mount all routers)
  middleware/
    auth.ts                       ← verifyToken, requireAdmin, requireSupervisor
  utils/
    routeHelpers.ts               ← asyncHandler, normalizePhone, etc.
  routers/
    auth.router.ts                ← /auth/*, /users
    extensions.router.ts          ← /extensions
    voipLines.router.ts           ← /voip-lines
    supervisor.router.ts          ← /supervisor/*
    campaigns.router.ts           ← /campaigns/* (simple discador)
    uraReverse.router.ts          ← /ura-reverse/*
    inboundIvr.router.ts          ← /central-telefonica/* (InboundIvr)
    queues.router.ts              ← /queues/*
    inboundRoutes.router.ts       ← /inbound-routes/*
    recordings.router.ts          ← /recordings/*
    sounds.router.ts              ← /sounds/*
    dashboard.router.ts           ← /dashboard, /agent-reports
    security.router.ts            ← /security/*
    settings.router.ts            ← /settings
    internal.router.ts            ← /internal/*
```

---

## What to do

### Step 1 — Create `backend/src/middleware/auth.ts`

Move `requireAdmin` and `requireSupervisor` (from plan 001) here. Keep `verifyToken` in `backend/src/auth.ts` where it already lives (it's imported from there by routes.ts — just re-export from middleware/auth.ts if needed, or import directly from auth.ts).

```typescript
// backend/src/middleware/auth.ts
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
```

### Step 2 — Create `backend/src/utils/routeHelpers.ts`

Move these utilities from routes.ts:
- `asyncHandler`
- `normalizePhone`
- `normalizeExtensionNumber`
- `isValidExtensionNumber`
- `extractSector`
- `withExtensionSector`
- `toRecordingWebPath`
- `parseWavFormat`
- `PHONE_REGEX`

### Step 3 — Extract routers one domain at a time

For each domain, create a new file `backend/src/routers/<domain>.router.ts`:

```typescript
import express from "express";
import { Server } from "socket.io";
// import only what this domain needs

export const create<Domain>Router = (io: Server) => {
  const router = express.Router();
  // paste routes here
  return router;
};
```

Extract in this order (least risky first):
1. `security.router.ts` (2 routes, no dependencies on other domains)
2. `dashboard.router.ts` (dashboard + agent-reports, no write side effects)
3. `sounds.router.ts` (4 routes, admin only)
4. `settings.router.ts` (2 routes, admin only)
5. `supervisor.router.ts` (4 routes)
6. `auth.router.ts` (users CRUD + auth/me)
7. `voipLines.router.ts`
8. `extensions.router.ts`
9. `queues.router.ts`
10. `inboundRoutes.router.ts`
11. `campaigns.router.ts`
12. `uraReverse.router.ts`
13. `inboundIvr.router.ts`
14. `recordings.router.ts`
15. `internal.router.ts`

### Step 4 — Replace routes.ts body with mounting code

After all routers are extracted, routes.ts becomes:

```typescript
import express from "express";
import { Server } from "socket.io";
import { verifyToken } from "./middleware/auth";
import { createAuthRouter } from "./routers/auth.router";
// ... all other router imports

export const createRoutes = (io: Server) => {
  const app = express.Router();
  
  app.get("/health", (_, res) => res.json({ ok: true }));
  app.use(createAuthRouter(io));
  app.use(createExtensionsRouter(io));
  // ... etc.
  
  return app;
};
```

### Step 5 — Global `verifyToken` middleware

The current `routes.ts` has `router.use(verifyToken)` at line 503 which protects all routes after that point. When splitting into separate routers, each router must apply `verifyToken` explicitly to each route (the global middleware won't carry across router files). Go through each extracted router and ensure every route that was after line 503 has `verifyToken` in its middleware chain.

**STOP if:** you find a route that was accidentally unprotected or protected in the original (check carefully around the router.use(verifyToken) at line 503). Report back before proceeding.

---

## Files in scope

- `backend/src/routes.ts` (becomes thin orchestrator)
- New files under `backend/src/middleware/`, `backend/src/utils/`, `backend/src/routers/`

## Files explicitly out of scope

- `backend/src/server.ts` — only imports `createRoutes`, which keeps the same signature
- `backend/src/db.ts`, `backend/src/ami.ts`, all service files

---

## Verification

```bash
cd /Users/ohcamargo/Documents/eda-call/backend && pnpm exec tsc --noEmit
```

Expected: zero TypeScript errors.

---

## Done criteria

1. `tsc --noEmit` exits 0.
2. `backend/src/routes.ts` is under 80 lines (just imports and mounts).
3. Each domain has its own file under `backend/src/routers/`.
4. `middleware/auth.ts` exists with `requireAdmin`, `requireSupervisor`, `verifyToken`.
5. `utils/routeHelpers.ts` exists with all shared utilities.
6. No route logic changed — only moved between files.
7. All routes that were protected by the global `router.use(verifyToken)` at the old line 503 are still protected in their new router files.

## Maintenance note

After this refactor, new routes should be added to the appropriate domain router file, never to `routes.ts` directly.
