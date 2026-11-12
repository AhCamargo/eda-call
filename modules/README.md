# Módulos do EdaCall ("Lego")

Funções opcionais que não fazem parte do núcleo do PABX. Cada módulo é uma peça
independente:

- **um container próprio**, ligado por um *profile* do Docker Compose — o
  servidor do cliente só roda o que ele contratou;
- **uma tela própria** (micro-frontend), carregada pelo painel em tempo de
  execução, sem rebuild do frontend;
- **dados próprios**, num schema separado no Postgres (entram no backup diário
  junto com o banco).

O módulo nunca lê as tabelas do núcleo nem fala com o Asterisk. Ele recebe
fatos pela fila de eventos e responde pela própria API.

```
 Asterisk ──AMI──► backend (núcleo) ──► DomainEvents (fila, 30 dias)
                       │   ▲                    │
     navegador ──JWT──►│   │ registro/heartbeat │ GET /internal/modules/events
                       │   │                    ▼
                       └──►│◄──────────── módulo (container)
             /modules/<id>/ui/*  (JS/CSS)
             /modules/<id>/api/* (login + papel mínimo, repassado com a chave)
```

## Ligar e desligar

```bash
sudo ./edacall-modulo.sh listar
sudo ./edacall-modulo.sh ativar ligacao-perdida
sudo ./edacall-modulo.sh desativar ligacao-perdida
```

`ativar` gera as chaves que faltam no `.env` (`MODULES_SECRET` e as do módulo),
põe o profile em `COMPOSE_PROFILES` e sobe os containers. O `update.sh` já
atualiza os módulos ativos.

## Contrato

### Eventos publicados pelo núcleo

| Tipo | Quando |
|---|---|
| `call.ended` | Toda ligação, depois de 20 s sem registro novo do mesmo UniqueID |
| `call.missed` | Ligação **recebida** em que nenhuma pessoa (ramal) atendeu — inclui quem desligou na URA, na fila ou no aviso de "fora do horário" |

Payload (`backend/src/services/domainEvents.ts`):

```json
{
  "uniqueId": "1731427200.42",
  "direction": "inbound",
  "phoneNumber": "044999998888",
  "answeredByPerson": false,
  "extension": null,
  "voipLine": "efix",
  "talkSeconds": 0,
  "endedAt": "2026-11-12T17:00:00.000Z"
}
```

Mudar o formato de um tipo existente quebra módulos já instalados: crie um tipo
novo em vez disso.

### Rotas que o módulo usa (header `X-EdaCall-Module-Key: $MODULES_SECRET`)

| Rota | Para quê |
|---|---|
| `PUT /internal/modules/:id` | Registro + heartbeat (a cada minuto). Sem sinal por 3 min, o módulo some do menu |
| `GET /internal/modules/events?after=<id>&types=a,b&limit=100` | Lê a fila a partir do último id processado |
| `GET /internal/modules/events/latest` | Id mais recente — ponto de partida na primeira execução |

Manifesto do registro:

```json
{
  "name": "Ligação perdida → WhatsApp",
  "version": "1.0.0",
  "internalUrl": "http://mod-ligacao-perdida:4100",
  "consumes": ["call.missed", "call.ended"],
  "ui": {
    "entry": "index.js",
    "style": "index.css",
    "minRole": "supervisor",
    "menu": { "label": "Ligação perdida", "hint": "…", "icon": "phone-missed" }
  }
}
```

Ícones aceitos: `phone-missed`, `message-circle`, `webhook`, `bot`, `puzzle`.

### O que o módulo precisa servir

- `GET /ui/<entry>` — um ES module que exporta `mount(el, ctx)` e devolve a
  função de limpeza. `ctx` traz `apiBase`, `token`, `user`, `basePath` e
  `navigate` (ver `frontend/src/modules/contract.ts`). O framework é livre; o
  módulo leva as próprias dependências no pacote.
- `/api/*` — só aceita pedidos com `X-EdaCall-Module-Key` correto. O usuário
  logado chega em `X-EdaCall-User` (JSON em base64: `id`, `username`, `role`).
  O núcleo já barrou quem está abaixo do `minRole`; regras mais finas (ex.: só
  admin altera configuração) ficam no módulo.

### Checklist para um módulo novo

1. Pasta `modules/<id>/` com `Dockerfile` (veja `ligacao-perdida/`).
2. Serviço no `docker-compose.prod.yml` com `profiles: ["<id>"]`.
3. Entrada no `SERVICES` e `DESCRIPTION` do `edacall-modulo.sh`.
4. Dados num schema próprio do Postgres (`CREATE SCHEMA IF NOT EXISTS`).
5. Telas seguindo a linguagem do painel: uma frase no topo dizendo o que a tela
   faz, sem jargão de Asterisk.
