# CLAUDE.md — EdaCall

Contexto permanente para o assistente de desenvolvimento. Leia este arquivo antes de qualquer tarefa no projeto.

## O que é o EdaCall

PABX IP full-stack voltado para call centers. Sistema em produção, deploy via Docker Compose / Coolify. Inclui softphone WebRTC embutido, discador automático, URA reversa, URA receptiva, filas, gravação de chamadas e relatórios de produtividade.

**Dono / Desenvolvedor principal:** AhCamargo (fullstack JS/React/Python + Asterisk/VoIP, 10+ anos)

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js + Express + TypeScript + Sequelize + PostgreSQL |
| Realtime | Socket.IO |
| Frontend | React 18 + Vite + TypeScript + shadcn/ui + MUI + TailwindCSS |
| Softphone | SIP.js (WebRTC sobre Asterisk) |
| PBX | Asterisk (SIP legado — **não PJSIP**) |
| PBX integração | AMI (`asterisk-manager`) via `backend/src/ami.ts` |
| Infra | Docker Compose, Coolify (self-hosted) |
| Monitoramento | Zabbix + Grafana |
| Segurança | Fail2ban (contexto `asterisk-edacall`) |
| Package manager | pnpm (workspaces na raiz) |

---

## Estrutura de pastas

```
eda-call/
├── asterisk/
│   ├── config/
│   │   ├── sip_custom.conf          ← ramais SIP e troncos (gerenciado pelo backend)
│   │   ├── extensions_custom.conf   ← dialplan (gerenciado pelo backend)
│   │   ├── queues_custom.conf       ← filas (gerenciado pelo backend)
│   │   ├── manager.conf             ← credenciais AMI
│   │   └── pjsip_custom.conf        ← não usado ativamente (legado)
│   ├── sounds/                      ← áudios URA (.wav PCM mono 8kHz, .ulaw, .mp3)
│   │   └── campaigns/               ← áudios de campanha URA reversa
│   └── recordings/                  ← gravações de chamadas (.wav)
├── backend/
│   └── src/
│       ├── server.ts                ← bootstrap: licença → DB → serviços → rotas
│       ├── routes.ts                ← TODOS os endpoints REST (~2800 linhas, monolítico)
│       ├── db.ts                    ← modelos Sequelize + syncDatabase() com migrations inline
│       ├── ami.ts                   ← originateCall, originateReverseIvr, runCommand
│       ├── auth.ts                  ← JWT login + verifyToken middleware
│       ├── config.ts                ← env vars centralizadas
│       └── services/
│           ├── asteriskProvisioning.ts  ← escrita em .conf via upsertNamedBlock
│           ├── amiStatusMonitor.ts      ← eventos AMI → status dos ramais via Socket.IO
│           ├── campaignRunner.ts        ← discador outbound (campanhas simples)
│           ├── uraReverseWorker.ts      ← worker do discador URA reversa
│           ├── recordingsSyncService.ts ← sincroniza arquivos .wav com banco
│           ├── agentStatusLogger.ts     ← log de produtividade por agente
│           └── license.ts               ← validação de licença RSA
├── frontend/
│   └── src/
│       ├── App.tsx                  ← rotas React Router + tela de login
│       ├── Layout.tsx               ← sidebar + navegação
│       ├── api.ts                   ← instância axios centralizada
│       ├── context/PbxContext.tsx   ← Socket.IO + estado global SIP
│       ├── hooks/useSipClient.ts    ← hook SIP.js (WebRTC)
│       ├── views/                   ← páginas (uma por módulo)
│       └── components/ui/           ← componentes shadcn/ui
├── license/                         ← gerador de licença RSA (keys privada/pública)
├── monitor/                         ← Zabbix + Grafana (docker-compose separado)
├── deploy/fail2ban/                 ← config fail2ban para SIP
├── .claude/agents/                  ← agentes Claude especializados
└── agents/                          ← cópia dos agentes (path alternativo)
```

---

## Módulos do sistema

| Módulo | Rota Frontend | Descrição |
|---|---|---|
| Call Center | `/callcenter` | Dashboard admin em tempo real |
| Agente | `/agent` | Softphone WebRTC para o agente |
| Supervisor | `/supervisor` | Spy/barge/whisper, forçar pausa |
| Ramais | `/ramais` | CRUD extensões SIP |
| Linhas VoIP | `/linhas-voip` | CRUD troncos SIP |
| Campanhas | `/campanhas/discador` | Discador outbound simples |
| URA Reversa | `/campanhas/ura-reversa` | Discador com menu DTMF |
| Central Telefônica | `/central-telefonica` | URA receptiva (Inbound IVR) |
| Filas | `/filas` | Asterisk Queues |
| Roteamento Entrada | `/roteamento-entrada` | DID routing |
| Gravações | `/gravacoes` | Player + download de chamadas |
| Relatórios | `/relatorios` | CDR, produtividade agentes |
| Áudios URA | `/audios-ura` | Gerenciador de áudio (admin) |
| Segurança | `/seguranca` | IPs banidos fail2ban (admin) |
| Configurações | `/configuracoes` | Configurações gerais (admin) |
| Usuários | `/usuarios` | CRUD de usuários (admin) |

**Roles:** `admin` > `supervisor` > `agent`

---

## Padrões obrigatórios

### Backend

**Adicionar rota nova:**
```typescript
// em routes.ts, antes do último return router
router.get("/meu-endpoint", verifyToken, async (req, res) => { ... });
// Usar asyncHandler para rotas com múltiplas awaits que podem jogar erro
router.post("/meu-endpoint", verifyToken, asyncHandler(async (req, res) => { ... }));
```

**Adicionar modelo / campo novo ao banco:**
```typescript
// em db.ts → dentro de syncDatabase(), nunca fora dela
await sequelize.query(
  `ALTER TABLE "MinhaTabela" ADD COLUMN IF NOT EXISTS "meuCampo" VARCHAR(255) DEFAULT NULL`
).catch(() => {});
// Sempre com IF NOT EXISTS. Nunca alterar schema existente direto.
```

**Provisionar Asterisk (SIP / dialplan / fila):**
```typescript
// SEMPRE via upsertNamedBlock / removeNamedBlock em asteriskProvisioning.ts
// Nunca escrever em .conf diretamente em routes.ts
await upsertSipExtension({ number, secret, context, voipLineName });
await upsertInboundIvrDialplan({ contextName, ... });
await upsertQueue({ name, strategy, members });
```

**Após alterar .conf via provisioning:**
- `sip_custom.conf` → `runCommand("sip reload")` (automático no provisioning)
- `extensions_custom.conf` → `runCommand("dialplan reload")` (automático)
- `queues_custom.conf` → `runCommand("queue reload all")` (automático)

**AMI — variáveis no Originate:**
```typescript
// CERTO: array de strings separadas — AMI envia um header Variable: por item
Variable: [`APP_PHONE=${phone}`, `APP_TARGET=${ext}`]

// ERRADO: string única com join — Asterisk interpreta como valor único
Variable: `APP_PHONE=${phone}|APP_TARGET=${ext}`
```

### Frontend

**Padrão de view:**
```tsx
// Card + Table + Dialog — seguir o padrão de views/Ramais.tsx e views/Filas.tsx
// Chamadas HTTP sempre via api.ts (axios com token automático)
import api from "../api";
const { data } = await api.get("/meu-endpoint");
```

**Estado global e Socket.IO:** via `PbxContext` — não criar listeners Socket.IO avulsos nas views.

**Temas:** MUI dark theme (`#0a0a0f` background, `#6c5ce7` primary). Não mudar paleta sem alinhar.

---

## Pontos críticos — não mexer sem cuidado

### `backend/src/ami.ts`
- Cliente AMI singleton com `keepConnected()` — qualquer mudança pode perder reconexão
- `originateReverseIvr` passa variáveis como array (ver acima) — não refatorar o formato sem testar
- `getAmiClient()` é chamado em vários serviços; só há uma conexão AMI ativa

### `backend/src/db.ts` → `syncDatabase()`
- Migrations irreversíveis em produção — sempre `IF NOT EXISTS`, nunca `DROP` ou `ALTER TYPE` sem catch
- Sequelize `.sync()` é chamado no final — novos modelos aparecem automaticamente

### `asterisk/config/sip_custom.conf`
- Gerenciado dinamicamente pelo backend — **nunca editar manualmente em produção**
- Blocos marcados com `; BEGIN EDACALL scope:name` / `; END EDACALL scope:name`
- Perda do marcador = o backend não consegue remover/atualizar o bloco

### `backend/src/services/uraReverseWorker.ts`
- Worker assíncrono com controle de concorrência e lock de contatos (`lockedAt`)
- Contatos travados em `calling` por > 5 min são liberados no boot via `syncDatabase()`
- Não alterar a lógica de lock sem entender o ciclo de vida dos contatos

### `backend/src/services/license.ts`
- Validação RSA na inicialização — falha = `process.exit(1)`
- Chaves em `license/keys/` — não commitar a chave privada (já no `.gitignore` da pasta)

---

## Formato de áudio para URA

- **Ramais e gravações:** qualquer formato (o Asterisk converte internamente)
- **Áudio de campanha URA reversa:** `.wav` PCM, mono, **8000 Hz**, 16-bit
- **Áudio de URA receptiva:** `.wav` ou `.mp3` (convertido via ffmpeg no entrypoint)
- Sons do sistema: `asterisk/sounds/edacall-menu-ptbr.wav` e `edacall-opcao-invalida-ptbr.wav`

---

## Dívidas técnicas conhecidas

1. **`routes.ts` monolítico (~2800 linhas)** — refatorar por domínio: `extensions.router.ts`, `campaigns.router.ts`, etc.
2. **Zero testes** — nenhum teste unitário ou de integração. Prioridade para: `campaignRunner`, `uraReverseWorker`, `asteriskProvisioning`
3. **`asyncHandler` inconsistente** — algumas rotas não usam e podem engolir erros silenciosamente
4. **Sem rate limiting** — `/auth/login` e endpoints públicos expostos a brute force
5. **Migrations inline em `syncDatabase()`** — migrar para Sequelize migrations formais para ter rollback

---

## Variáveis de ambiente principais

```bash
DATABASE_URL          # postgresql://user:pass@host:5432/dbname
AMI_HOST / AMI_PORT   # host e porta do AMI Asterisk (padrão 5038)
AMI_USERNAME / AMI_PASSWORD
JWT_SECRET
BACKEND_INTERNAL_URL  # URL interna do backend (ex: http://backend:5000) — usada pelo dialplan via callback
ASTERISK_SOUNDS_DIR   # caminho para o volume de sons do Asterisk
ASTERISK_RECORDINGS_DIR
ASTERISK_SIP_CUSTOM_FILE
ASTERISK_EXTENSIONS_CUSTOM_FILE
ASTERISK_QUEUES_CUSTOM_FILE
```

---

## Agentes Claude disponíveis

Definidos em `.claude/agents/`:

- **tech-lead** — revisar PRs, priorizar backlog, estimar esforço, identificar riscos
- **dev** — implementar features, corrigir bugs, gerar patches
- **architect** — decisões de arquitetura, refatorações estruturais
- **devops** — Docker, Coolify, Zabbix, infraestrutura

---

## Deploy e operação

**Desenvolvimento local:**
```bash
cd backend && pnpm install && pnpm dev   # porta 5000
cd frontend && pnpm install && pnpm dev  # porta 5173
```

**Docker completo:**
```bash
docker compose up --build
```

**Produção (Coolify):** `docker-compose.prod.yml` + variáveis de ambiente no painel Coolify.

**Credenciais padrão:** `admin` / `123456` (trocar no primeiro acesso em produção).

**Atualização em produção:** `./update.sh`

---

## Convenções de commit

```
feat(módulo): descrição curta
fix(módulo): descrição do bug corrigido
refactor(módulo): o que mudou e por quê
chore: tarefas de manutenção (deps, configs)
```

Módulos: `backend`, `frontend`, `asterisk`, `db`, `ami`, `ura`, `campaigns`, `infra`
