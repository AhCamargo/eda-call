# 003 — Autenticação do endpoint /internal/ura/log

## Por que isso importa

O endpoint `POST /internal/ura/log` (`routes.ts:427`) é chamado pelo Asterisk via `System(curl ...)` no dialplan quando uma URA Reversa completa um atendimento. Ele escreve diretamente no banco de dados: cria e atualiza registros de `UraLog`, muda o status de contatos de campanha e dispara eventos Socket.IO para a interface.

O endpoint está registrado **antes** do `router.use(verifyToken)` na linha 494, portanto **não tem autenticação**. Qualquer cliente HTTP na rede pode:
- Marcar contatos de campanha como "atendidos" com opções forjadas
- Criar logs falsos de URA
- Manipular estatísticas de campanhas em tempo real

O `.env.example` já define `INTERNAL_API_KEY=edacall-internal-key` mas a chave nunca é lida nem validada em lugar nenhum.

## Como funciona o fluxo atual

1. `uraReverseWorker.ts` chama `originateReverseIvr()` em `ami.ts`
2. `ami.ts:124` passa `URA_CALLBACK_URL=${backendInternalUrl}/internal/ura/log` como variável AMI
3. O dialplan em `asterisk/config/extensions_custom.conf:136,148` executa `System(curl -s -X POST ... ${URA_CALLBACK_URL})`
4. O backend recebe a requisição em `routes.ts:427` sem verificar nenhum segredo

## Escopo

**Arquivos a alterar:**
1. `backend/src/config.ts` — adicionar `internalApiKey`
2. `backend/src/ami.ts` — passar `APP_INTERNAL_KEY` como variável AMI
3. `asterisk/config/extensions_custom.conf` — adicionar header `-H "X-Internal-Key: ..."` nos curls
4. `backend/src/routes.ts` — validar o header no handler de `/internal/ura/log`

**Fora do escopo:** qualquer outro arquivo.

## Convenções do projeto a seguir

- Novas env vars devem ter fallback razoável se não são obrigatórias, ou `process.exit(1)` se obrigatórias — ver padrão do `config.ts`
- Variáveis AMI são passadas como array de strings `"CHAVE=valor"` em `ami.ts` — não mudar esse formato
- O dialplan em `extensions_custom.conf` usa `System(curl ...)` para callbacks — manter esse padrão

## Mudanças detalhadas

### 1. `backend/src/config.ts`

Adicionar `internalApiKey` ao objeto config.

Localizar o trecho (após a linha de `jwtSecret`):
```typescript
  jwtSecret: process.env.JWT_SECRET || "supersecret",
```

Adicionar logo abaixo (na mesma indentação das outras propriedades):
```typescript
  internalApiKey: process.env.INTERNAL_API_KEY || "",
```

> Se estiver aplicando o plano 001 também, use `requireEnv("INTERNAL_API_KEY")` em vez de `|| ""`. Se aplicar isoladamente, o fallback vazio permite que o endpoint aceite requisições sem chave configurada (mantém comportamento atual como fallback seguro de deploy).

### 2. `backend/src/ami.ts`

Adicionar a chave interna ao array de variáveis passadas para o Originate.

Localizar em `originateReverseIvr()` a importação no topo do arquivo:
```typescript
const { ami: amiConfig, backendInternalUrl } = config;
```

Substituir por:
```typescript
const { ami: amiConfig, backendInternalUrl, internalApiKey } = config;
```

Localizar no array `vars` dentro de `originateReverseIvr()`:
```typescript
    `URA_CALLBACK_URL=${backendInternalUrl}/internal/ura/log`,
```

Substituir por:
```typescript
    `URA_CALLBACK_URL=${backendInternalUrl}/internal/ura/log`,
    `APP_INTERNAL_KEY=${internalApiKey}`,
```

### 3. `asterisk/config/extensions_custom.conf`

Há dois `System(curl ...)` que precisam incluir o header. Um na linha do `handle` (opção selecionada) e outro na linha `invalid` (sem opção/timeout).

**Primeiro curl (linha ~136)** — localizar:
```
 same => n,System(curl -s -X POST -H "Content-Type: application/json" -d "{\"uraRef\":\"${URA_REF}\",\"campaignId\":\"${APP_CAMPAIGN_ID}\",\"extensionId\":\"${APP_EXTENSION_ID}\",\"uraCampaignId\":\"${APP_URA_CAMPAIGN_ID}\",\"uraContactId\":\"${APP_URA_CONTACT_ID}\",\"phoneNumber\":\"${APP_PHONE}\",\"selectedOption\":\"${URACHOICE}\",\"audioPath\":\"/recordings/${RECFILE}\",\"result\":\"opcao_${URACHOICE}\"}" ${URA_CALLBACK_URL} >/dev/null 2>&1)
```

Substituir por (acrescentar `-H "X-Internal-Key: ${APP_INTERNAL_KEY}"` antes da URL):
```
 same => n,System(curl -s -X POST -H "Content-Type: application/json" -H "X-Internal-Key: ${APP_INTERNAL_KEY}" -d "{\"uraRef\":\"${URA_REF}\",\"campaignId\":\"${APP_CAMPAIGN_ID}\",\"extensionId\":\"${APP_EXTENSION_ID}\",\"uraCampaignId\":\"${APP_URA_CAMPAIGN_ID}\",\"uraContactId\":\"${APP_URA_CONTACT_ID}\",\"phoneNumber\":\"${APP_PHONE}\",\"selectedOption\":\"${URACHOICE}\",\"audioPath\":\"/recordings/${RECFILE}\",\"result\":\"opcao_${URACHOICE}\"}" ${URA_CALLBACK_URL} >/dev/null 2>&1)
```

**Segundo curl (linha ~148)** — localizar:
```
 same => n,System(curl -s -X POST -H "Content-Type: application/json" -d "{\"uraRef\":\"${URA_REF}\",\"campaignId\":\"${APP_CAMPAIGN_ID}\",\"extensionId\":\"${APP_EXTENSION_ID}\",\"uraCampaignId\":\"${APP_URA_CAMPAIGN_ID}\",\"uraContactId\":\"${APP_URA_CONTACT_ID}\",\"phoneNumber\":\"${APP_PHONE}\",\"selectedOption\":\"invalid\",\"audioPath\":\"/recordings/${RECFILE}\",\"result\":\"sem_opcao\"}" ${URA_CALLBACK_URL} >/dev/null 2>&1)
```

Substituir por:
```
 same => n,System(curl -s -X POST -H "Content-Type: application/json" -H "X-Internal-Key: ${APP_INTERNAL_KEY}" -d "{\"uraRef\":\"${URA_REF}\",\"campaignId\":\"${APP_CAMPAIGN_ID}\",\"extensionId\":\"${APP_EXTENSION_ID}\",\"uraCampaignId\":\"${APP_URA_CAMPAIGN_ID}\",\"uraContactId\":\"${APP_URA_CONTACT_ID}\",\"phoneNumber\":\"${APP_PHONE}\",\"selectedOption\":\"invalid\",\"audioPath\":\"/recordings/${RECFILE}\",\"result\":\"sem_opcao\"}" ${URA_CALLBACK_URL} >/dev/null 2>&1)
```

### 4. `backend/src/routes.ts`

Adicionar validação no início do handler de `/internal/ura/log`.

Localizar (linha ~427):
```typescript
  router.post("/internal/ura/log", async (req: Request, res: Response) => {
    const {
      uraRef = null,
```

Substituir por:
```typescript
  router.post("/internal/ura/log", async (req: Request, res: Response) => {
    const configuredKey = config.internalApiKey;
    if (configuredKey) {
      const receivedKey = req.headers["x-internal-key"];
      if (receivedKey !== configuredKey) {
        return res.status(401).json({ message: "Chave interna inválida" });
      }
    }

    const {
      uraRef = null,
```

> A verificação só é ativada se `INTERNAL_API_KEY` estiver configurada (`if (configuredKey)`). Isso garante compatibilidade com deploys que ainda não definiram a variável — o endpoint continua funcionando sem autenticação nesses casos. Uma vez que a variável for definida, a validação passa a ser obrigatória.

## Verificação

1. **Typecheck:**
   ```bash
   cd backend && npx tsc --noEmit
   ```
   Esperado: zero erros.

2. **Teste sem chave configurada** (compatibilidade):
   ```bash
   curl -s -X POST http://localhost:5000/internal/ura/log \
     -H "Content-Type: application/json" \
     -d '{"phoneNumber":"11999990000"}' | jq .
   ```
   Esperado: `201` ou `200` (mesmo comportamento de antes, sem chave configurada no env).

3. **Teste com chave configurada e header correto:**
   ```bash
   INTERNAL_API_KEY="minha-chave" # no .env do backend
   curl -s -X POST http://localhost:5000/internal/ura/log \
     -H "Content-Type: application/json" \
     -H "X-Internal-Key: minha-chave" \
     -d '{"phoneNumber":"11999990000"}' | jq .
   ```
   Esperado: `201`.

4. **Teste com chave configurada e header errado:**
   ```bash
   curl -s -X POST http://localhost:5000/internal/ura/log \
     -H "Content-Type: application/json" \
     -H "X-Internal-Key: chave-errada" \
     -d '{"phoneNumber":"11999990000"}' | jq .
   ```
   Esperado: `401 { "message": "Chave interna inválida" }`.

5. **Verificar dialplan:** após deploy, fazer uma chamada URA Reversa de teste e confirmar que o log aparece na tela de campanhas (o curl do Asterisk está passando a chave corretamente).

## Manutenção

- Ao rotacionar `INTERNAL_API_KEY`: atualizar a variável no ambiente do backend e fazer `dialplan reload` no Asterisk para que as novas chamadas usem a nova chave. Chamadas em andamento no momento da troca podem falhar o callback — tolerável pois são pontuais.
- A chave não precisa ser longa; 32 caracteres aleatórios são suficientes: `openssl rand -hex 16`

## Escape hatches

- Se o Asterisk não suportar a variável `APP_INTERNAL_KEY` (versão antiga sem suporte a variáveis no `System()`): **PARE e reporte**. Nesse caso, a alternativa é incluir a chave diretamente na URL como query param: `${URA_CALLBACK_URL}?key=${APP_INTERNAL_KEY}` — ajustar a validação no backend para ler de `req.query.key`.
- Se o `extensions_custom.conf` for regenerado pelo provisioning em algum momento futuro: garantir que o template inclua os headers. Verificar `asteriskProvisioning.ts` para confirmar que o bloco `[ura-reversa]` não é gerenciado dinamicamente (na versão atual não é).
