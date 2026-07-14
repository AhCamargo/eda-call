# Plan 007 — Backend Unit/Integration Test Coverage

**Status:** TODO  
**Effort:** L  
**Risk:** LOW  

## Why this matters

The backend has zero tests. The three most complex and critical services — `campaignRunner.ts`, `uraReverseWorker.ts`, `asteriskProvisioning.ts` — have no coverage at all. Bugs in these directly affect customer calls and billing. The Cypress e2e suite requires a running Asterisk PBX, making it useless for CI.

The goal: install Vitest (zero-config, no Babel, native TypeScript) and write focused unit tests for the three critical services, plus integration tests for the most important routes.

---

## Repo context

- **Package manager:** pnpm
- **Runtime:** Node.js + TypeScript (`"module": "commonjs"`)
- **No test runner currently installed** in backend
- **AMI dependency:** `asterisk-manager` — must be mocked in tests
- **DB dependency:** Sequelize + PostgreSQL — use `sequelize-mock` or mock at the model level
- **Verify:** `cd backend && pnpm test` after setup

---

## What to do

### Step 1 — Install Vitest

```bash
cd backend && pnpm add -D vitest @vitest/coverage-v8
```

Add to `backend/package.json`:
```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

Create `backend/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

### Step 2 — Test `asteriskProvisioning.ts`

Create `backend/src/services/asteriskProvisioning.test.ts`.

This service reads/writes `.conf` files and calls `runCommand` (AMI). Mock the filesystem with `vi.mock("fs/promises")` and mock `runCommand` from `"../ami"`.

Tests to write:
- `upsertNamedBlock` inserts a new block when it doesn't exist
- `upsertNamedBlock` replaces an existing block without touching other blocks
- `removeNamedBlock` removes the block and leaves surrounding content intact
- `upsertSipExtension` writes correct SIP config format
- `upsertQueue` writes correct queue config format

```typescript
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("../ami", () => ({
  runCommand: vi.fn().mockResolvedValue({}),
}));

import * as fs from "fs/promises";
import { upsertSipExtension } from "./asteriskProvisioning";

describe("upsertSipExtension", () => {
  beforeEach(() => {
    vi.mocked(fs.readFile).mockResolvedValue("" as any);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
  });

  it("writes a new SIP block", async () => {
    await upsertSipExtension({ number: "1001", secret: "abc", context: "default", voipLineName: null });
    const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
    expect(written).toContain("[1001]");
    expect(written).toContain("secret=abc");
    expect(written).toContain("context=default");
  });
});
```

### Step 3 — Test `campaignRunner.ts` (after plan 002 is applied)

Create `backend/src/services/campaignRunner.test.ts`.

Mock `originateCall` from `"../ami"` and all Sequelize models from `"../db"`.

Tests to write:
- Campaign with no contacts completes immediately
- Campaign marks itself `in_progress` at start and `completed` at end
- `originateCall` is called once per contact
- If `originateCall` throws, CallLog is still created with `nao_atendida`
- Concurrent campaign start is idempotent (second call to `runCampaign` with same id returns early)

### Step 4 — Test `uraReverseWorker.ts` key functions

Create `backend/src/services/uraReverseWorker.test.ts`.

Tests to write:
- `emitCampaignStats` emits correct shape `{ campaignId, stats }` via socket
- `handleUraReverseDtmfEvent` with `result: "answered"` marks contact as `answered`
- `handleUraReverseDtmfEvent` with `result: "no_answer"` marks as `no_answer`
- Contact with `lockedAt > 120s ago` is treated as pending in next cycle

### Step 5 — Route integration tests (optional, add if time allows)

Create `backend/src/routes.test.ts` using Vitest + supertest:

```bash
cd backend && pnpm add -D supertest @types/supertest
```

Tests to write:
- `POST /auth/login` with valid credentials returns JWT
- `POST /auth/login` with invalid credentials returns 401
- `GET /extensions` without token returns 403
- `POST /supervisor/agents/:id/spy` with agent role returns 403 (after plan 001)

---

## Files in scope

- `backend/package.json` (add vitest, supertest)
- `backend/vitest.config.ts` (new)
- `backend/src/services/asteriskProvisioning.test.ts` (new)
- `backend/src/services/campaignRunner.test.ts` (new)
- `backend/src/services/uraReverseWorker.test.ts` (new)
- Optionally: `backend/src/routes.test.ts`

## Files explicitly out of scope

- Existing source files — do NOT modify them to make tests pass; if a test requires a structural change, report back
- Frontend test files

---

## Verification

```bash
cd /Users/ohcamargo/Documents/eda-call/backend && pnpm test
```

Expected: all tests pass, zero failures.

```bash
cd /Users/ohcamargo/Documents/eda-call/backend && pnpm exec tsc --noEmit
```

Expected: zero TypeScript errors.

---

## Done criteria

1. `pnpm test` exits 0 with at least 15 passing tests.
2. `vitest.config.ts` exists.
3. `asteriskProvisioning.test.ts` exists with at least 5 tests.
4. `campaignRunner.test.ts` exists with at least 5 tests.
5. `uraReverseWorker.test.ts` exists with at least 4 tests.
6. No source files modified (tests mock all external dependencies).
