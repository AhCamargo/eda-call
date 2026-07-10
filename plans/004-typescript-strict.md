# Plan 004 — Enable TypeScript Strict Mode in Backend

**Status:** DONE  
**Effort:** M  
**Risk:** LOW  

> **Nota (2026-07-10):** o codebase já era bem tipado — strict mode só
> revelou 3 erros, todos a mesma causa (`bcryptjs` sem declaração de tipos).
> `@types/bcryptjs@3.0.0` é um stub vazio e depreciado (a versão instalada,
> 2.4.3, não tem tipos embutidos), então em vez de instalar uma dependência
> inútil foi criado `backend/src/types/bcryptjs.d.ts` com
> `declare module "bcryptjs";`. Nenhuma outra mudança de tipo foi necessária.

## Why this matters

`backend/tsconfig.json` has `"strict": false`. With strict mode off, TypeScript silently accepts `null`/`undefined` dereferences, implicit `any`, and unchecked index access — the exact class of bugs that cause runtime crashes in production. The codebase has 84 `as any` casts in `routes.ts` alone, many of which are workarounds for missing types rather than deliberate escapes.

Enabling strict mode will surface real latent bugs and make the `as any` casts visible as the red flags they are. The goal here is NOT to fix all 84 casts — it's to turn on the flag and fix only the errors that block compilation, patching them with the minimal safe change (usually a targeted `as any` or a null guard).

---

## Repo context

- **TypeScript version:** `^6.0.2` (see backend/package.json)
- **Strict flags enabled by `"strict": true`:** `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`, `alwaysStrict`, `useUnknownInCatchVariables`
- **Verify command:** `cd backend && pnpm exec tsc --noEmit`
- **Goal:** Make `tsc --noEmit` exit 0 with `"strict": true`

---

## What to do

### Step 1 — Enable strict mode

In `backend/tsconfig.json`, change:
```json
"strict": false,
```
to:
```json
"strict": true,
```

### Step 2 — Run the compiler and catalogue errors

Run `cd backend && pnpm exec tsc --noEmit 2>&1 | head -200` to see the first batch of errors. Then fix them file by file. Prioritize errors in source files over type declaration files.

### Step 3 — Fix strategy

**For `useUnknownInCatchVariables` (catch clauses):**
Catch variables change from `any` to `unknown`. The pattern throughout the codebase is:
```typescript
} catch (err: any) {   // existing — already typed, no change needed
```
Any catch clause that doesn't already have `: any` will error. Fix by adding `: any`:
```typescript
} catch (err: any) {
```

**For `noImplicitAny` on function parameters:**
If a parameter has no type annotation and TypeScript can't infer it, add an explicit type or `any`:
```typescript
const fn = (x: any) => { ... };
```

**For `strictNullChecks` (the most common):**
- `req.user` is typed as `{ id: number; role: string; username: string } | undefined` (auth.ts:10). All accesses like `req.user.id` or `req.user!.id` in routes that already have `verifyToken` are safe — add `!` non-null assertion where missing.
- Sequelize `findByPk` returns `Model | null`. Existing checks like `if (!user) return res.status(404)` already guard the null path. If TypeScript still errors, add a type assertion after the null check: `const u = user as SomeType`.
- For `as any` casts on Sequelize model instances (already pervasive): keep them as-is. The goal is compilation, not eliminating every `as any`.

**For `strictPropertyInitialization`:**
This only applies to class fields. The codebase uses Sequelize models (not class-based instances) and module-level variables. This flag should produce zero errors here.

**STOP and report if:** the total error count exceeds 150. That indicates a structural problem that needs more than targeted fixes. Do not attempt to fix more than 150 errors — report back with the count and the top 5 error categories.

### Step 4 — Do NOT refactor

- Do not change `as any` casts that are already there.
- Do not add Zod schemas or validation.
- Do not rename variables.
- Do not extract functions.
- The only changes allowed are: type annotations on parameters, `!` non-null assertions, `as SomeType` after null guards, and `: any` on catch variables.

---

## Files in scope

- `backend/tsconfig.json` (change strict flag)
- Any `.ts` file in `backend/src/` that has compilation errors after enabling strict

## Files explicitly out of scope

- `frontend/` — do not touch
- Any file that compiles cleanly with no changes needed

---

## Verification

```bash
cd /Users/ohcamargo/Documents/eda-call/backend && pnpm exec tsc --noEmit
```

Expected: zero TypeScript errors.

---

## Done criteria

1. `backend/tsconfig.json` has `"strict": true`.
2. `tsc --noEmit` exits 0 with no errors.
3. No logic changes — only type annotations, non-null assertions, and catch clause types.
4. Diff touches at most 10 files (if more than 10 files need changes, report back before proceeding).
