# 002 — Credenciais AMI obrigatórias no boot

## Por que isso importa

`backend/src/config.ts:36-37` contém:
```typescript
ami: {
  host: process.env.AMI_HOST || "asterisk",
  port: Number(process.env.AMI_PORT || 5038),
  username: process.env.AMI_USERNAME || "admin",
  password: process.env.AMI_PASSWORD || "admin",
},
```

Se `AMI_USERNAME` e `AMI_PASSWORD` não forem configuradas, o sistema usa `admin`/`admin` — as credenciais padrão do Asterisk. O AMI (Asterisk Manager Interface) permite executar qualquer comando no Asterisk: originar chamadas, listar canais, executar comandos shell (`System()`), encerrar o processo. Se um atacante descobrir que o AMI está acessível com credenciais padrão, tem controle total sobre a central telefônica.

O `.env.example` também tem `AMI_USERNAME=admin` e `AMI_PASSWORD=admin`, o que agrava o risco para implantações que copiam o exemplo sem modificar.

## Escopo

**Arquivo a alterar:** `backend/src/config.ts`  
**Arquivos fora do escopo:** `ami.ts`, `server.ts`, qualquer outro.

## Estado atual

```typescript
// backend/src/config.ts — trecho relevante
ami: {
  host: process.env.AMI_HOST || "asterisk",
  port: Number(process.env.AMI_PORT || 5038),
  username: process.env.AMI_USERNAME || "admin",  // ← fallback perigoso
  password: process.env.AMI_PASSWORD || "admin",  // ← fallback perigoso
},
```

## Mudança a fazer

Remover os fallbacks `"admin"` e falhar com mensagem clara se as variáveis estiverem ausentes. `AMI_HOST` e `AMI_PORT` podem continuar com fallback pois têm valores convencionais seguros.

**Substituição exata em `backend/src/config.ts`:**

Localizar:
```typescript
  ami: {
    host: process.env.AMI_HOST || "asterisk",
    port: Number(process.env.AMI_PORT || 5038),
    username: process.env.AMI_USERNAME || "admin",
    password: process.env.AMI_PASSWORD || "admin",
  },
```

Substituir por:
```typescript
  ami: {
    host: process.env.AMI_HOST || "asterisk",
    port: Number(process.env.AMI_PORT || 5038),
    username: (() => {
      const u = process.env.AMI_USERNAME;
      if (!u) {
        console.error("[FATAL] AMI_USERNAME não configurada. Defina a variável de ambiente antes de iniciar.");
        process.exit(1);
      }
      return u;
    })(),
    password: (() => {
      const p = process.env.AMI_PASSWORD;
      if (!p) {
        console.error("[FATAL] AMI_PASSWORD não configurada. Defina a variável de ambiente antes de iniciar.");
        process.exit(1);
      }
      return p;
    })(),
  },
```

> **Alternativa mais limpa** (menos repetição): criar uma função helper privada no arquivo:
> ```typescript
> const requireEnv = (name: string): string => {
>   const value = process.env[name];
>   if (!value) {
>     console.error(`[FATAL] ${name} não configurada. Defina a variável de ambiente antes de iniciar.`);
>     process.exit(1);
>   }
>   return value;
> };
> ```
> E então usar `requireEnv("AMI_USERNAME")` e `requireEnv("AMI_PASSWORD")`. Essa helper também pode ser usada para o `JWT_SECRET` do plano 001, eliminando a IIFE duplicada.

## Verificação

1. **Typecheck:**
   ```bash
   cd backend && npx tsc --noEmit
   ```
   Esperado: zero erros.

2. **Teste funcional — sem as variáveis:**
   ```bash
   cd backend && AMI_USERNAME="" tsx src/server.ts 2>&1 | head -5
   ```
   Esperado: saída contendo `[FATAL] AMI_USERNAME não configurada` e o processo termina.

   ```bash
   cd backend && AMI_USERNAME="admin" AMI_PASSWORD="" tsx src/server.ts 2>&1 | head -5
   ```
   Esperado: saída contendo `[FATAL] AMI_PASSWORD não configurada` e o processo termina.

3. **Teste funcional — com as variáveis:**
   Definir `AMI_USERNAME` e `AMI_PASSWORD` no `.env` local e iniciar normalmente. O servidor deve iniciar sem erros relacionados ao AMI.

## Manutenção

Após este fix, atualizar o `.env.example`:
```
AMI_USERNAME=        # OBRIGATÓRIO — usuário definido no manager.conf do Asterisk
AMI_PASSWORD=        # OBRIGATÓRIO — senha definida no manager.conf do Asterisk
```

## Aplicar 001 antes ou junto

Se o plano 001 implementou a função `requireEnv`, use-a aqui para eliminar a IIFE. Caso contrário, a IIFE acima funciona de forma independente.

## Escape hatches

- Se o sistema for implantado em ambiente onde o Asterisk usa credenciais AMI geradas dinamicamente (ex: Kubernetes Secrets injetados em runtime): **PARE e verifique** se as variáveis chegam antes do import de `config.ts`. Caso contrário, mova a validação para `bootstrap()` em `server.ts`.
