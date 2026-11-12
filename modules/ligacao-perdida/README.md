# Módulo: Ligação perdida → WhatsApp

Quando alguém liga e nenhuma pessoa atende (desligou na URA, na fila, no aviso
de fora do horário ou o ramal tocou sem resposta), o EdaCall manda uma mensagem
no WhatsApp de quem ligou.

```bash
sudo ./edacall-modulo.sh ativar ligacao-perdida
```

Depois, no painel: **Módulos → Ligação perdida** → *Conectar número* → ler o QR
Code com o WhatsApp da empresa → configurar a mensagem → ligar o envio.

## Regras de envio

A mensagem **não** sai quando:

- o envio automático está desligado;
- o número é oculto, inválido ou fixo (com "só celulares" marcado);
- alguém conversou com esse número **depois** da ligação perdida (o atendente
  retornou, ou a pessoa ligou de novo e foi atendida);
- esse número já recebeu mensagem dentro do intervalo configurado (padrão 24 h);
- a ligação tem mais que a idade máxima (padrão 18 h);
- o número não tem WhatsApp.

Antes de mandar, espera o tempo configurado (padrão 2 min) e respeita o horário
de envio. Fora do horário, a mensagem espera o próximo período. Entre um envio e
outro há uma pausa aleatória de 3 a 8 s.

Variáveis da mensagem: `{empresa}`, `{horario}` (hora da ligação), `{telefone}`.

## WhatsApp

Usa o **WAHA Core** (`devlikeapro/waha`, Apache-2.0): gratuito, um número por
instalação, só texto. Roda no próprio servidor do cliente e só fala com a rede
interna do Docker.

É um cliente **não oficial** do WhatsApp: o número pode ser bloqueado se mandar
muito para quem não o tem salvo. Combine isso com o cliente por escrito.

O conector fica atrás da interface `WhatsAppConnector` (`src/connector.ts`):
a API oficial da Meta pode entrar como outra implementação sem mexer nas regras
nem na tela.

## Dados

Schema `ligacao_perdida` no Postgres do EdaCall (entra no `edacall-backup`).
A sessão do WhatsApp fica no volume `waha_sessions`; se ele se perder, basta
ler o QR Code de novo.

## Desenvolvimento

```bash
npm install
npm test           # regras, telefone, conector WAHA
npm run typecheck
npm run build      # dist/server.js + dist/ui/index.js (micro-frontend)
```

## Créditos

O cliente WAHA (`src/waha.ts`) foi adaptado do DeskVoice — MIT License,
© 2026 Rafael Melgaço e contribuidores
(https://github.com/DeskLabs-OpenSource/DeskVoice). A ideia do gatilho de
ligação perdida veio do DeskcommCRM (MIT, © 2026 Rafael Melgaço).
