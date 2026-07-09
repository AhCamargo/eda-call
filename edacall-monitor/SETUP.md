# EDACall Monitor — Guia de Instalação

Stack de monitoramento dos servidores EDACall usando **Zabbix 7.0 LTS + Grafana**, tudo em Docker.

---

## 1. Pré-requisitos no mini-PC

Sistema recomendado: **Ubuntu Server 22.04/24.04** ou **Debian 12** (mas funciona em qualquer Linux com Docker).

Instale o Docker e o plugin Compose:

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# Reinicie a sessão ou rode 'newgrp docker' pra aplicar o grupo
```

Verifique:

```bash
docker --version
docker compose version
```

---

## 2. Subindo a stack

Copie a pasta `edacall-monitor/` (com `docker-compose.yml` e `.env`) pro mini-PC. Sugestão: `/opt/edacall-monitor`.

```bash
sudo mkdir -p /opt/edacall-monitor
sudo cp -r ./edacall-monitor/* /opt/edacall-monitor/
cd /opt/edacall-monitor
```

**Antes de subir, edite o `.env` e troque TODAS as senhas:**

```bash
nano .env
# (ou use vim, code, etc.)
```

Dica pra gerar senhas fortes:

```bash
openssl rand -base64 24
```

Suba a stack:

```bash
docker compose up -d
```

Aguarde uns 2-3 minutos na primeira execução (o Zabbix está criando o schema do banco). Acompanhe os logs:

```bash
docker compose logs -f zabbix-server
```

Quando aparecer `server #0 started`, está pronto.

---

## 3. Acessando as interfaces

Descubra o IP local do mini-PC:

```bash
ip -4 addr show | grep inet
```

Acesse no navegador de qualquer computador da rede:

- **Zabbix:**  `http://<ip-do-mini-pc>:8080`
  Login inicial: `Admin` / `zabbix` (sim, A maiúsculo). **Troque a senha imediatamente** em `User settings > Profile`.

- **Grafana:** `http://<ip-do-mini-pc>:3000`
  Login inicial: `admin` / valor de `GRAFANA_PASSWORD` no `.env`.

---

## 4. Conectando o Grafana ao Zabbix

1. No Grafana, vá em **Connections > Add new connection**.
2. Procure por **Zabbix** e habilite o plugin.
3. Em **Data sources > Add data source > Zabbix**, configure:
   - **URL:** `http://zabbix-web:8080/api_jsonrpc.php`
   - **Username:** `Admin`
   - **Password:** sua nova senha do Zabbix
   - **Trends:** habilitado
4. Clique em **Save & test**. Deve aparecer `Connection to Zabbix API OK`.

Pronto — agora você pode criar dashboards no Grafana puxando dados do Zabbix.

Dashboards prontos pra importar (ID do grafana.com):
- `1860` — Node Exporter Full (se usar Prometheus depois)
- `5363` — Zabbix Server Health
- `12483` — Zabbix Host Overview

---

## 5. Adicionando servidores EDACall pra monitorar

### 5a. Em cada servidor EDACall (no cliente)

Instale o Zabbix Agent 2:

```bash
# Ubuntu/Debian
wget https://repo.zabbix.com/zabbix/7.0/ubuntu/pool/main/z/zabbix-release/zabbix-release_7.0-2+ubuntu22.04_all.deb
sudo dpkg -i zabbix-release_7.0-2+ubuntu22.04_all.deb
sudo apt update
sudo apt install -y zabbix-agent2
```

Edite `/etc/zabbix/zabbix_agent2.conf`:

```ini
Server=<IP_PUBLICO_DO_SEU_MINI_PC>
ServerActive=<IP_PUBLICO_DO_SEU_MINI_PC>
Hostname=cliente-001-edacall
```

Reinicie:

```bash
sudo systemctl enable --now zabbix-agent2
sudo systemctl status zabbix-agent2
```

### 5b. No Zabbix (no seu mini-PC)

1. Vá em **Data collection > Hosts > Create host**.
2. **Host name:** `cliente-001-edacall` (igual ao Hostname do agente)
3. **Groups:** crie um grupo "EDACall Clientes"
4. **Interfaces > Add > Agent:** IP do servidor do cliente (ou DNS), porta 10050
5. **Templates:** adicione `Linux by Zabbix agent` (pega CPU/RAM/disco/rede)
6. Salve. Em 1-2 min os dados começam a chegar.

### 5c. Monitorando coisas específicas do EDACall/Asterisk

Crie itens customizados no template, por exemplo:

| Item | Tipo | Key |
|---|---|---|
| Asterisk rodando? | Zabbix agent | `proc.num[asterisk]` |
| Porta SIP escutando? | Simple check | `net.tcp.service[tcp,,5060]` |
| FreePBX HTTP responde? | Simple check | `net.tcp.service[http,,80]` |
| Ramais registrados | Zabbix agent (UserParameter) | `asterisk.sip.peers` |

Pra ramais/chamadas ativas, você define `UserParameter` no `zabbix_agent2.conf` do cliente:

```ini
UserParameter=asterisk.sip.peers,/usr/sbin/asterisk -rx "sip show peers" | grep -c "OK ("
UserParameter=asterisk.active.calls,/usr/sbin/asterisk -rx "core show channels" | grep "active call" | awk '{print $1}'
```

---

## 6. Alertas (Telegram é o mais prático/grátis)

1. Crie um bot no Telegram via **@BotFather**, anote o token.
2. Mande qualquer mensagem pro seu bot e pegue seu `chat_id` em `https://api.telegram.org/bot<TOKEN>/getUpdates`.
3. No Zabbix: **Alerts > Media types > Telegram** (já vem pronto). Configure com o token.
4. Em **Users > Admin > Media**, adicione um media Telegram com seu chat_id.
5. Em **Alerts > Actions > Trigger actions**, habilite "Report problems to Zabbix administrators".

Pronto — quando um servidor cair, você recebe no Telegram em segundos.

---

## 7. ATENÇÃO: questão do tunelamento

Sem VPN, o mini-PC precisa "alcançar" os servidores dos clientes. Há três cenários:

**Cenário A — Cliente tem IP público fixo + porta 10050 aberta:** funciona direto. Zabbix server faz checks passivos.

**Cenário B — Cliente atrás de NAT (residencial/comum):** o agente precisa rodar em **modo ativo** (`ServerActive` no .conf). Mas ainda assim o **seu mini-PC** precisa estar acessível pela internet na porta 10051. Isso significa:
- IP público (ou DDNS tipo No-IP, DuckDNS) no seu mini-PC
- Port-forward 10051 no seu roteador
- Risco de segurança: expor Zabbix server na internet

**Cenário C (recomendado quando quiser evoluir) — VPN:** Tailscale resolve tudo em 5 min, sem mexer em roteador, sem expor nada. Quando estiver pronto, me chama que eu te mostro.

Pra **agora**, se você quiser monitorar **só "está online ou não"** sem VPN nem agente, dá pra usar **HTTP/ICMP checks externos** apontando pro IP/domínio público do cliente. Por exemplo:

- `icmpping[]` — bate ping
- `net.tcp.service[http,seudominio.com.br,80]` — checa se FreePBX responde
- `net.tcp.service[tcp,seudominio.com.br,5060]` — checa SIP

Isso já te dá um "verde/vermelho" sem precisar instalar nada no cliente.

---

## 8. Backup

O que precisa de backup:
- O volume `edacall-zabbix-postgres-data` (banco do Zabbix — configuração + histórico)
- O volume `edacall-grafana-data` (dashboards do Grafana)
- O `.env` e o `docker-compose.yml`

Script simples de backup (rodar via cron):

```bash
#!/bin/bash
set -e
DATE=$(date +%Y%m%d-%H%M)
BACKUP_DIR=/var/backups/edacall-monitor
mkdir -p $BACKUP_DIR

# Carrega variáveis do .env
source /opt/edacall-monitor/.env

# Dump do PostgreSQL
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" zabbix-postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom \
  > $BACKUP_DIR/zabbix-$DATE.dump

# Volume do Grafana
docker run --rm -v edacall-grafana-data:/data -v $BACKUP_DIR:/backup alpine \
  tar czf /backup/grafana-$DATE.tar.gz -C /data .

# Mantém últimos 14 dias
find $BACKUP_DIR -mtime +14 -delete
```

Pra restaurar o PostgreSQL: `docker exec -i zabbix-postgres pg_restore -U zabbix -d zabbix --clean < zabbix-YYYYMMDD-HHMM.dump`

---

## 9. Comandos úteis

```bash
docker compose ps                    # status dos containers
docker compose logs -f zabbix-server # logs ao vivo
docker compose restart zabbix-server # reinicia só um serviço
docker compose down                  # para tudo (mantém volumes)
docker compose down -v               # para tudo e APAGA dados (cuidado!)
docker compose pull && docker compose up -d  # atualiza imagens
```
