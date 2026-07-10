# Plan 006 — Formal DB Migrations with Umzug

**Status:** DONE  
**Effort:** L  
**Risk:** MEDIUM  

> **Nota (2026-07-10):** Extraídas as 27 chamadas `sequelize.query(...).catch(() => {})`
> de `syncDatabase()` (não 17 como o plano estimava) para
> `backend/src/migrations/001..027-*.sql`, uma por arquivo, na ordem original.
> Cada arquivo foi conferido por diff normalizado contra o bloco original —
> conteúdo idêntico, sem erro de transcrição. O bloco final de
> `syncDatabase()` (`sequelize.sync()` + reset de contatos `UraReverseContact`
> travados em `calling` após restart) foi preservado tal como estava, depois
> do `migrator.up()`.
>
> **Achado fora do escopo do plano:** o build de produção
> (`Dockerfile.prod` → `RUN npx tsc`) compila só `.ts` para `dist/` e não
> copiava os `.sql` novos — em produção o glob do migrator acharia zero
> arquivos e nenhuma tabela seria criada num banco novo. Corrigido com um
> script `build` (`tsc && cp -r src/migrations dist/migrations`) e
> `Dockerfile.prod` atualizado para usá-lo. Testado localmente
> (`pnpm build` copia os 27 arquivos para `dist/migrations/`).
>
> **Atualização (mesmo dia): testado de ponta a ponta contra Postgres real
> via Docker (a limitação acima foi contornada — Docker ficou disponível).**
> Isso revelou **dois bugs reais** que só apareceriam em produção:
>
> 1. **Ordem `migrator.up()` → `sync()` quebrava instalação nova.** Rodar as
>    migrations antes do `sequelize.sync()` falha na primeira migration
>    (`ALTER TYPE "enum_Users_role" ADD VALUE IF NOT EXISTS 'supervisor'`)
>    porque em um banco vazio o tipo enum ainda nem existe. No código
>    original isso já acontecia, mas o `.catch(() => {})` escondia o erro —
>    o schema real vinha inteiro do `sequelize.sync()` no fim, e as queries
>    inline serviam só para atualizar bancos *antigos* (por isso a ordem
>    nunca importou antes). Como o plano pedia para remover os `.catch()`,
>    a ordem passou a importar. **Corrigido:** invertida a ordem em
>    `syncDatabase()` — `sequelize.sync()` primeiro (cria o schema atual
>    completo a partir dos models), `migrator.up()` depois (essas queries
>    então só encontram tudo já correto e viram no-ops seguros num banco
>    novo; num banco antigo, corrigem de verdade o que falta).
> 2. **Migration 023 não era idempotente num banco novo.** O enum
>    `dialTechnology` nasce só com `'SIP'` (único valor do model atual);
>    comparar a coluna com o literal `'PJSIP'` no `UPDATE` falha direto
>    ("invalid input value for enum"), não é um "0 linhas afetadas". Essa
>    é exatamente a condição de "STOP" que o próprio plano previa.
>    **Corrigido:** a migration agora só roda o `UPDATE` se `'PJSIP'`
>    de fato existir como valor do enum (checagem via `pg_enum`/`pg_type`).
>
> **Verificação real feita** (Postgres 15 em container Docker descartável,
> destruído ao final):
> - Instalação nova (schema vazio) → `syncDatabase()` completo, 20 tabelas
>   criadas, 27 migrations registradas em `SequelizeMeta`.
> - Reexecução (simulando restart do backend) → sem erros, nada re-executa.
> - Banco "legado" simulado à mão (enums sem os valores novos, tabelas sem
>   as colunas novas, uma campanha `UraReverseCampaigns` real com
>   `dialTechnology = 'PJSIP'`) → `syncDatabase()` corrige tudo: enums
>   ganham os valores que faltavam, colunas são adicionadas, e a linha
>   legada é preservada e corrigida para `'SIP'` (sem perda de dado).
>
> Ainda assim, testar em staging antes do deploy de produção continua sendo
> a recomendação — a simulação de banco "legado" foi construída à mão e
> pode não cobrir 100% do formato real do banco de produção.

## Why this matters

`backend/src/db.ts` has ~330 lines of inline `ALTER TABLE` and `CREATE TABLE IF NOT EXISTS` SQL inside `syncDatabase()`. This approach has no rollback capability, no migration history, and no ordering guarantee beyond "they run in source order". As the schema grows, this file becomes a deployment minefield — a broken migration silently `.catch(() => {})` can leave the schema in an inconsistent state.

The goal: migrate to [Umzug](https://github.com/sequelize/umzug) (Sequelize's official migration library) with SQL-based migration files, while keeping the existing schema and data intact.

---

## Repo context

- **ORM:** Sequelize 6 (`sequelize` package)
- **DB:** PostgreSQL
- **Package manager:** pnpm
- **Existing migrations:** all inline in `backend/src/db.ts` inside `syncDatabase()`
- **Verify command:** `cd backend && pnpm exec tsc --noEmit`
- **Do NOT run migrations against the actual DB** — this plan is code-only; migrations run at deploy time

---

## What to do

### Step 1 — Install Umzug

```bash
cd backend && pnpm add umzug
```

Umzug ships its own types. No separate `@types/umzug` needed.

### Step 2 — Create migration directory

```
backend/src/migrations/
  001-initial-schema.sql
  002-ura-logs-ura-ref.sql
  003-voip-lines-extra-cols.sql
  004-ura-reverse-campaigns.sql
  005-ura-reverse-options.sql
  006-ura-reverse-contacts.sql
  007-ura-contacts-columns.sql
  008-inbound-ivrs.sql
  009-inbound-ivr-options.sql
  010-asterisk-queues.sql
  011-asterisk-queue-members.sql
  012-inbound-ivr-schedule.sql
  013-action-type-enum-queue.sql
  014-fix-dial-technology.sql
  015-inbound-routes.sql
  016-agent-status-logs.sql
  017-agent-status-logs-indexes.sql
```

### Step 3 — Extract SQL into migration files

Each migration file contains the SQL that was previously inside a `sequelize.query(...).catch(() => {})` call in `syncDatabase()`. Migration files are plain SQL — Umzug will execute them.

**Migration 001** — initial `CREATE TABLE IF NOT EXISTS` for all original tables (Extensions, VoipLines, Campaigns, CampaignContacts, CallLogs, CallRecordings, UraLogs, Users). Extract the full `CREATE TABLE IF NOT EXISTS` SQL from `db.ts`.

Continue extracting in chronological order as they appear in `db.ts`.

**For DDL statements that were silently ignored** (the `.catch(() => {})`): migrations should NOT silently swallow errors. Remove the catch. If the migration is truly idempotent (`IF NOT EXISTS`, `IF NOT EXISTS` column check), it can run multiple times safely. If it's not idempotent, add a check:
```sql
DO $$ BEGIN
  ALTER TABLE "Foo" ADD COLUMN "bar" VARCHAR(255);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
```

### Step 4 — Create `backend/src/migrator.ts`

```typescript
import { Umzug, SequelizeStorage } from "umzug";
import path from "path";
import { sequelize } from "./db";

export const migrator = new Umzug({
  migrations: {
    glob: path.join(__dirname, "migrations/*.sql"),
    resolve: ({ name, path: filePath, context }) => ({
      name,
      up: async () => {
        const sql = require("fs").readFileSync(filePath!, "utf-8");
        await context.query(sql);
      },
      down: async () => {
        // down migrations not implemented — add manually per migration
      },
    }),
  },
  context: sequelize,
  storage: new SequelizeStorage({ sequelize, tableName: "SequelizeMeta" }),
  logger: console,
});
```

### Step 5 — Update `syncDatabase()` in `db.ts`

Replace all the inline `ALTER TABLE` / `CREATE TABLE` calls with a single migrator call:

```typescript
import { migrator } from "./migrator";

export const syncDatabase = async () => {
  await migrator.up();                    // run pending migrations
  await sequelize.sync({ alter: false }); // sync model associations only
};
```

Remove all inline `sequelize.query(...)` calls from `syncDatabase()`. The Sequelize `sync()` call at the end still handles junction tables and new model columns via Sequelize's own `sync`.

**STOP if:** you find a migration that cannot be made idempotent safely (e.g., an `ALTER TYPE ADD VALUE` for an enum that already has a newer value). Report back — these need manual handling.

### Step 6 — Update tsconfig if needed

Ensure `"resolveJsonModule": true` is already set (it is). Ensure `__dirname` is available — it is since `"module": "commonjs"`.

---

## Files in scope

- `backend/package.json` (add umzug dependency)
- `backend/src/db.ts` (remove inline migrations from syncDatabase)
- `backend/src/migrator.ts` (new file)
- `backend/src/migrations/*.sql` (new files)

## Files explicitly out of scope

- `backend/src/routes.ts`
- Any service file
- The Sequelize model definitions at the top of `db.ts` — do not touch those

---

## Verification

```bash
cd /Users/ohcamargo/Documents/eda-call/backend && pnpm exec tsc --noEmit
```

Expected: zero TypeScript errors.

---

## Done criteria

1. `tsc --noEmit` exits 0.
2. `backend/src/migrations/` directory exists with at least 15 `.sql` files.
3. `backend/src/migrator.ts` exists and exports `migrator`.
4. `syncDatabase()` in `db.ts` calls `migrator.up()` instead of inline `sequelize.query()` chains.
5. The inline `CREATE TABLE` / `ALTER TABLE` blocks are removed from `syncDatabase()`.
6. `pnpm add umzug` recorded in `backend/package.json`.

## Risk note

This change is safe for new installs (migrations run from scratch). For existing databases: Umzug will record already-run migrations in `SequelizeMeta` table. On first deploy after this change, all migrations will appear "pending" and will run again. Since all SQL is `IF NOT EXISTS` / idempotent, this is safe — but test on a staging DB first.
