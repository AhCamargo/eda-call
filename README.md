# EdaCall

MVP de PABX IP com:

- Dashboard de status dos ramais (online, offline, pausa, em ligação, em campanha)
- Área admin para criar ramais, campanhas, subir lista de telefones e adicionar ramais na campanha
- Relatórios de chamadas (quem atendeu e número não existe)
- URA reversa com menu de opções (1/2/3)
- Gravação de chamadas com MixMonitor e sincronização para o banco
- Backend Node.js + PostgreSQL
- Frontend Next.js + TypeScript + shadcn/ui
- Docker Compose com backend, frontend, postgres e asterisk

## Executar com Docker

1. Copie `.env.example` para `.env` e ajuste valores se necessário.
2. Rode:

```bash
docker compose up --build
```

3. Acesse:

- Frontend (Next.js): http://localhost:5173
- API: http://localhost:5000/health

## Desenvolvimento local com pnpm

1. Habilite o Corepack (uma vez na maquina):

```bash
corepack enable
```

2. Instale dependencias:

```bash
cd backend && pnpm install
cd ../frontend && pnpm install
```

3. Rode em dev:

```bash
cd backend && pnpm dev
cd ../frontend && pnpm dev
```

## Deploy no Coolify (self-hosted)

Recomendado: deploy via Git conectado ao Coolify.

Arquivos prontos para este fluxo:

- `docker-compose.coolify.yml`
- `.env.coolify.example`
- `backend/Dockerfile.prod`
- `frontend/Dockerfile.prod`
- `asterisk/Dockerfile.prod`

Checklist rapido:

1. Suba o projeto para Git (GitHub/GitLab/Gitea).
2. No Coolify, crie um recurso `Docker Compose` apontando para este repo e branch.
3. Selecione o arquivo `docker-compose.coolify.yml`.
4. Cadastre as variaveis de ambiente com base no `.env.coolify.example`.
5. Configure dominios publicos no Coolify (frontend na porta interna `5173` e backend na porta interna `5000`).

6. Defina `NEXT_PUBLIC_API_URL` com a URL publica da API (ex.: `https://api.seudominio.com`).
7. Faça o primeiro deploy.

Notas importantes:

- O frontend Next.js precisa da variavel `NEXT_PUBLIC_API_URL` durante o build; por isso ela tambem esta em `build.args` do compose.
- Para AMI funcionar, use credenciais seguras em `AMI_USERNAME`/`AMI_PASSWORD` e mantenha consistencia com `manager.conf` provisionado no volume compartilhado do Asterisk.

## Credenciais padrão

- usuário: `admin`
- senha: `123456`

## Endpoints principais

- `POST /auth/login`
- `GET /dashboard`
- `GET/POST /extensions`
- `PATCH /extensions/:id/status`
- `GET/POST /campaigns`
- `POST /campaigns/:id/assign-extensions`
- `POST /campaigns/:id/upload-phones`
- `POST /campaigns/:id/start`
- `POST /ura/reverse-call`
- `GET /reports/summary`
- `GET /reports/calls`
- `GET /reports/calls-by-extension`
- `GET /reports/calls-by-campaign`
- `GET /reports/ura-logs`
- `GET /reports/recordings`

## URA Reversa (módulo de campanha)

Páginas no frontend:

- `Campanhas > Discador` (rota `/campanhas/discador`)
- `Campanhas > URA Reversa` (rota `/campanhas/ura-reversa`)
- `Campanhas > Relatórios URA` (rota `/campanhas/ura-reversa/relatorios`)

Endpoints do módulo:

- `GET /ura-reverse/campaigns`
- `POST /ura-reverse/campaigns`
- `POST /ura-reverse/campaigns/:id/audio` (upload `.wav`)
- `GET /ura-reverse/campaigns/:id/options`
- `POST /ura-reverse/campaigns/:id/options`
- `GET /ura-reverse/campaigns/:id/contacts`
- `POST /ura-reverse/campaigns/:id/contacts/upload` (CSV coluna `telefone`)
- `POST /ura-reverse/campaigns/:id/start`
- `POST /ura-reverse/campaigns/:id/pause`
- `POST /ura-reverse/campaigns/:id/finish`
- `GET /reports/ura-reverse`

Eventos Socket.IO emitidos:

- `ura-reverse:call-event` (`calling`, `answered`, `no_answer`, `busy`, `hangup`, `invalid`)
- `ura-reverse:stats`
- `ura-reverse:campaign-status`

Parâmetros operacionais padrão do worker:

- Chamadas simultâneas: `5`
- Codec: `ulaw`
- Timeout por chamada: `25s`
- Detectar caixa postal: `false`
- Callback automático: `false`

### Exemplo URA reversa com roteamento por opção

`POST /ura/reverse-call`

```json
{
  "phoneNumber": "5511999999999",
  "campaignId": 1,
  "extensionId": 1,
  "targetExtension": "2001",
  "optionTargets": {
    "1": "2001",
    "2": "2002",
    "3": "2003"
  },
  "promptAudio": "custom/edacall-menu-ptbr"
}
```

Observações:

- `targetExtension` continua funcionando como fallback global.
- `optionTargets` é opcional e permite destino específico para cada tecla.
- `promptAudio` é opcional e define o arquivo tocado no menu URA (sem extensão).
- Por padrão, o container gera automaticamente os áudios `custom/edacall-menu-ptbr` e `custom/edacall-opcao-invalida-ptbr` em pt-BR.
