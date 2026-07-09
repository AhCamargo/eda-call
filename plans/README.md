# EDACall — Planos de Melhoria

Gerado em: 2026-06-26  
Auditoria: padrão (standard depth)

## Índice de prioridade

| # | Plano | Categoria | Impacto | Esforço | Status |
|---|-------|-----------|---------|---------|--------|
| 001 | [JWT_SECRET obrigatório no boot](001-jwt-secret-required.md) | Segurança | ALTO | S | TODO |
| 002 | [Credenciais AMI obrigatórias](002-ami-credentials-required.md) | Segurança | ALTO | S | TODO |
| 003 | [Autenticação do /internal/ura/log](003-internal-ura-log-auth.md) | Segurança | MÉDIO | S | TODO |
| 004 | [Tick do uraReverseWorker 1s → 5s](004-ura-worker-tick-interval.md) | Performance | MÉDIO | S | TODO |
| 005 | [Otimizar recordingsSyncService](005-recordings-sync-optimize.md) | Performance | MÉDIO | S | TODO |

## Ordem de execução recomendada

001 → 002 → 003 (segurança primeiro, independentes entre si)  
004 → 005 (performance, independentes entre si e de segurança)

## Dependências

Nenhum plano depende de outro para ser executado. Podem ser feitos em qualquer ordem ou em paralelo.

## Como verificar

Cada plano contém seus próprios critérios de verificação. O comando de typecheck padrão do projeto:
```bash
cd backend && npx tsc --noEmit
```
