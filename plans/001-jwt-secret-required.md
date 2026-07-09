# 001 — JWT_SECRET obrigatório no boot

## Por que isso importa

`backend/src/config.ts:6` contém:
```typescript
jwtSecret: process.env.JWT_SECRET || "supersecret",
```

Se a variável `JWT_SECRET` não for configurada no ambiente (esquecimento no deploy, `.env` ausente), o fallback `"supersecret"` é um segredo trivialmente conhecido. Qualquer pessoa pode forjar um token JWT válido com role `admin` e obter acesso irrestrito à API — incluindo CRUD de usuários, controle do Asterisk via AMI e acesso a gravações.

O `.env.example` já usa `JWT_SECRET=supersecret` como valor padrão, o que significa que clientes que copiam o exemplo sem alterar estão vulneráveis.

## Escopo

**Arquivo a alterar:** `backend/src/config.ts`  
**Arquivo fora do escopo:** qualquer outro arquivo — a mudança é completamente localizada.

## Estado atual (arquivo completo)

```typescript
// backend/src/config.ts
import "dotenv/config";

const config = {
  port: Number(process.env.PORT || 5000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || "supersecret",   // ← linha 6, o problema
  backendInternalUrl: process.env.BACKEND_INTERNAL_URL || "http://backend:5000",
  // ... resto das props
};

export default config;
```

## Mudança a fazer

Remover o fallback `"supersecret"` e falhar com mensagem clara se a variável estiver ausente. Usar o mesmo padrão de fail-fast já estabelecido no arquivo para `DATABASE_URL` (que já lança erro em `db.ts` se ausente).

**Substituição exata em `backend/src/config.ts`:**

Localizar:
```typescript
  jwtSecret: process.env.JWT_SECRET || "supersecret",
```

Substituir por:
```typescript
  jwtSecret: (() => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error("[FATAL] JWT_SECRET não configurada. Defina a variável de ambiente antes de iniciar.");
      process.exit(1);
    }
    return secret;
  })(),
```

> **Alternativa mais simples** (se preferir não usar IIFE): validar no início do arquivo antes de montar o objeto config, com `if (!process.env.JWT_SECRET) { ... process.exit(1); }`. Ambas as abordagens são corretas.

## Verificação

1. **Typecheck:**
   ```bash
   cd backend && npx tsc --noEmit
   ```
   Esperado: zero erros.

2. **Teste funcional — sem a variável:**
   ```bash
   cd backend && JWT_SECRET="" tsx src/server.ts 2>&1 | head -5
   ```
   Esperado: saída contendo `[FATAL] JWT_SECRET não configurada` e o processo termina.

3. **Teste funcional — com a variável:**
   ```bash
   cd backend && JWT_SECRET="minha-chave-segura" tsx src/server.ts
   ```
   Esperado: servidor inicia normalmente (pode falhar depois no DB se DATABASE_URL não estiver configurada, mas não deve falhar no JWT).

## Manutenção

Após este fix, atualizar o `.env.example` para deixar `JWT_SECRET` em branco com instrução:
```
JWT_SECRET=          # OBRIGATÓRIO — gere com: openssl rand -hex 32
```
Isso força o operador a definir um valor antes de usar.

## Escape hatches

- Se o projeto usar algum mecanismo de injeção de variáveis que seta `JWT_SECRET` depois do import de `config.ts` (ex: AWS Secrets Manager síncrono): **PARE e reporte**. Nesse caso a validação deve ser movida para dentro de `bootstrap()` em `server.ts`.
- Se `process.exit(1)` dentro do config.ts causar problemas em testes unitários futuros: mover a validação para `server.ts` antes de `syncDatabase()`.
