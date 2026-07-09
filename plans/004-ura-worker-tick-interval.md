# 004 — Reduzir tick do uraReverseWorker de 1s para 5s

## Por que isso importa

`backend/src/services/uraReverseWorker.ts:301-303`:
```typescript
runningState.timer = setInterval(() => {
  tick().catch(() => {});
}, 1000);
```

O worker roda a cada **1 segundo**, mesmo quando não há campanhas ativas. A cada tick, `tick()` executa:
1. `UraReverseCampaign.findAll({ where: { status: "running" } })` — query no banco
2. Para cada campanha running: `UraReverseOption.findAll(...)` — query por campanha
3. `UraReverseContact.findAll(...)` — query com filtros complexos por campanha
4. `UraReverseContact.count(...)` — query de contagem

Isso resulta em **60+ queries de banco por minuto** apenas pelo worker, independente de haver campanhas ativas. Em sistema com múltiplas campanhas, o impacto é multiplicado.

O intervalo mínimo de retry de contatos já é `retryIntervalSeconds` (padrão 30s). Reduzir o tick para 5s não tem nenhum impacto funcional — um contato que ficaria disponível num determinado segundo ainda será processado em até 5s após ficar disponível, bem dentro da margem de operação normal de um discador.

## Escopo

**Arquivo a alterar:** `backend/src/services/uraReverseWorker.ts` — apenas a linha do `setInterval`.  
**Arquivos fora do escopo:** todos os demais.

## Estado atual

```typescript
// uraReverseWorker.ts:294-304
export const startUraReverseWorker = (io: Server) => {
  runningState.io = io;

  if (runningState.timer) {
    clearInterval(runningState.timer);
  }

  runningState.timer = setInterval(() => {
    tick().catch(() => {});
  }, 1000);  // ← 1000ms = 1 segundo
};
```

## Mudança a fazer

**Substituição exata em `backend/src/services/uraReverseWorker.ts`:**

Localizar:
```typescript
  }, 1000);
```
(dentro de `startUraReverseWorker`, logo após o `tick().catch(() => {})`)

Substituir por:
```typescript
  }, 5000);
```

Isso é tudo. Uma linha.

## Por que 5s e não outro valor

- **1s**: estado atual — excessivo para a granularidade real da operação
- **5s**: bom equilíbrio — reduz queries em 80%, ainda responde rápido o suficiente para campanhas ativas
- **10s**: ainda aceitável, mas pode causar atraso visível na atualização de stats em tempo real na UI
- **30s**: mesmo valor do retryInterval mínimo — funcionaria, mas a UI ficaria sem atualização por muito tempo

Se no futuro houver necessidade de ajuste sem redeploy, pode-se tornar o valor configurável via env var: `Number(process.env.URA_WORKER_INTERVAL_MS) || 5000`.

## Verificação

1. **Typecheck:**
   ```bash
   cd backend && npx tsc --noEmit
   ```
   Esperado: zero erros.

2. **Verificação funcional:**
   - Iniciar o backend
   - Criar uma campanha URA Reversa e colocá-la em `running`
   - Confirmar que contatos são processados (discados) normalmente
   - Confirmar que as estatísticas da campanha atualizam na UI em no máximo ~5 segundos após uma mudança de status de contato

3. **Verificação de carga (opcional):**
   Monitorar logs do PostgreSQL com `log_min_duration_statement = 0` por 1 minuto com e sem a mudança — confirmar redução de ~80% nas queries do worker.

## Manutenção

Nenhuma. Esta mudança não cria dependências ou estados novos.

## Escape hatches

- Se clientes reportarem que as estatísticas de campanha na tela de URA Reversa demoram demais para atualizar: considerar reduzir para 3000ms. Não voltar para 1000ms sem avaliar o impacto de carga.
- Se campanhas com `concurrentCalls` muito alto (ex: 50+) começarem a ter contatos presos em `calling` por mais tempo que o esperado: verificar se o problema é o tick interval ou a lógica de lock (o lock expira em 120s — o tick interval de 5s não afeta isso).
