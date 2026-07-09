#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  EdaCall Monitor — Instalador do Servidor de Monitoramento
#  Instala: Zabbix Server 7.0 + Zabbix Web + Grafana 11 (via Docker)
#
#  Uso: sudo bash install-monitor.sh
#  Requisitos: Ubuntu 22.04/24.04, Docker instalado, porta 3000/8080/10051 livres
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()     { echo -e "${GREEN}✔${RESET} $*"; }
info()   { echo -e "${CYAN}→${RESET} $*"; }
warn()   { echo -e "${YELLOW}⚠${RESET}  $*"; }
die()    { echo -e "${RED}✖ ERRO:${RESET} $*" >&2; exit 1; }
header() {
  echo ""
  echo -e "${BOLD}${CYAN}══════════════════════════════════════════${RESET}"
  echo -e "${BOLD}${CYAN}  $*${RESET}"
  echo -e "${BOLD}${CYAN}══════════════════════════════════════════${RESET}"
  echo ""
}
gen_secret() { tr -dc 'A-Za-z0-9' </dev/urandom | head -c "${1:-32}" || true; }

[[ $EUID -ne 0 ]] && die "Execute como root: sudo bash install-monitor.sh"
[[ ! -f docker-compose.yml ]] && die "Execute dentro da pasta monitor/ do EdaCall"

clear
echo -e "${BOLD}${CYAN}"
cat <<'LOGO'
  ███████╗██████╗  █████╗  ██████╗ █████╗ ██╗     ██╗
  ██╔════╝██╔══██╗██╔══██╗██╔════╝██╔══██╗██║     ██║
  █████╗  ██║  ██║███████║██║     ███████║██║     ██║
  ██╔══╝  ██║  ██║██╔══██║██║     ██╔══██║██║     ██║
  ███████╗██████╔╝██║  ██║╚██████╗██║  ██║███████╗███████╗
  ╚══════╝╚═════╝ ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚══════╝
LOGO
echo -e "${RESET}"
echo -e "  Servidor de Monitoramento — Zabbix + Grafana"
echo ""

# ── Pré-requisitos ────────────────────────────────────────────────────────────
header "Verificando pré-requisitos"

if ! command -v docker &>/dev/null || ! docker compose version &>/dev/null; then
  info "Instalando Docker..."
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg lsb-release
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  ok "Docker instalado"
else
  ok "Docker já instalado: $(docker --version)"
fi

# ── Configuração ──────────────────────────────────────────────────────────────
header "Configuração do servidor de monitoramento"

DETECTED_IP=$(hostname -I | awk '{print $1}')
read -rp "  IP público ou domínio deste servidor [${DETECTED_IP}]: " INPUT_IP
SERVER_IP="${INPUT_IP:-$DETECTED_IP}"

# Gera .env se não existir
if [[ -f .env ]]; then
  warn ".env já existe — mantendo configuração atual."
  # shellcheck disable=SC1091
  source .env
else
  info "Gerando .env com senhas seguras..."
  ZBX_DB_PASS=$(gen_secret 24)
  GRAF_PASS=$(gen_secret 20)

  cat > .env <<EOF
# EdaCall Monitor — gerado em $(date '+%Y-%m-%d %H:%M')

ZABBIX_DB_NAME=zabbix
ZABBIX_DB_USER=zabbix
ZABBIX_DB_PASSWORD=${ZBX_DB_PASS}

GRAFANA_USER=admin
GRAFANA_PASSWORD=${GRAF_PASS}
GRAFANA_ROOT_URL=http://${SERVER_IP}:3000

TIMEZONE=America/Sao_Paulo
EOF
  ok ".env criado"
  # shellcheck disable=SC1091
  source .env
fi

# ── Firewall ──────────────────────────────────────────────────────────────────
header "Configurando firewall"

if command -v ufw &>/dev/null; then
  ufw --force enable
  ufw allow ssh     comment "SSH"
  ufw allow 10051/tcp comment "Zabbix Trapper (agentes dos clientes)"
  ufw allow 8080/tcp  comment "Zabbix Web UI"
  ufw allow 3000/tcp  comment "Grafana"
  ufw reload
  ok "Firewall configurado"
  echo ""
  warn "Porta 10051/tcp aberta — os agentes dos clientes conectam aqui"
else
  warn "UFW não encontrado. Abra manualmente: 10051/tcp, 8080/tcp, 3000/tcp"
fi

# ── Sobe os containers ────────────────────────────────────────────────────────
header "Iniciando Zabbix + Grafana"

info "Baixando imagens (pode demorar na primeira vez)..."
docker compose pull --quiet

info "Iniciando containers..."
docker compose up -d

ok "Containers no ar"

# ── Aguarda Zabbix Web ────────────────────────────────────────────────────────
header "Aguardando serviços inicializarem"

info "Aguardando Zabbix Web UI (pode levar 1-2 minutos)..."
MAX_WAIT=180; WAITED=0
until curl -sf "http://localhost:8080/api_jsonrpc.php" &>/dev/null; do
  [[ $WAITED -ge $MAX_WAIT ]] && { warn "Zabbix não respondeu em ${MAX_WAIT}s"; break; }
  sleep 5; WAITED=$((WAITED+5)); echo -n "."
done
echo ""
curl -sf "http://localhost:8080/api_jsonrpc.php" &>/dev/null && ok "Zabbix Web UI respondendo"

info "Aguardando Grafana..."
MAX_WAIT=60; WAITED=0
until curl -sf "http://localhost:3000/api/health" &>/dev/null; do
  [[ $WAITED -ge $MAX_WAIT ]] && { warn "Grafana não respondeu em ${MAX_WAIT}s"; break; }
  sleep 3; WAITED=$((WAITED+3)); echo -n "."
done
echo ""
curl -sf "http://localhost:3000/api/health" &>/dev/null && ok "Grafana respondendo"

# ── Cria grupo EdaCall no Zabbix via API ─────────────────────────────────────
header "Configurando Zabbix"

info "Aguardando API do Zabbix estabilizar..."
sleep 5

ZBX_TOKEN=$(curl -sf -X POST "http://localhost:8080/api_jsonrpc.php" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"user.login","params":{"username":"Admin","password":"zabbix"},"id":1}' \
  2>/dev/null | grep -o '"result":"[^"]*"' | cut -d'"' -f4 || echo "")

if [[ -n "$ZBX_TOKEN" ]]; then
  # Cria grupo de hosts EdaCall
  GROUP_RESULT=$(curl -sf -X POST "http://localhost:8080/api_jsonrpc.php" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"hostgroup.create\",\"params\":{\"name\":\"EdaCall\"},\"auth\":\"${ZBX_TOKEN}\",\"id\":1}" \
    2>/dev/null | grep -o '"groupids":\[[^]]*\]' || echo "já existe")
  ok "Grupo 'EdaCall' criado no Zabbix (${GROUP_RESULT})"
else
  warn "Não foi possível autenticar na API do Zabbix. Crie o grupo 'EdaCall' manualmente."
fi

# ── Systemd para auto-start ───────────────────────────────────────────────────
header "Configurando inicialização automática"

INSTALL_DIR="$(pwd)"
cat > /etc/systemd/system/edacall-monitor.service <<EOF
[Unit]
Description=EdaCall Monitor (Zabbix + Grafana)
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable edacall-monitor
ok "Serviço systemd criado — inicia automaticamente no boot"

# ── Resumo ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  EdaCall Monitor instalado com sucesso!${RESET}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════════${RESET}"
echo ""
echo -e "  ${BOLD}Zabbix Web UI${RESET}  : ${CYAN}http://${SERVER_IP}:8080${RESET}"
echo -e "    Usuário      : ${BOLD}Admin${RESET}"
echo -e "    Senha        : ${BOLD}zabbix${RESET}  ← troque imediatamente!"
echo ""
echo -e "  ${BOLD}Grafana${RESET}        : ${CYAN}http://${SERVER_IP}:3000${RESET}"
echo -e "    Usuário      : ${BOLD}${GRAFANA_USER}${RESET}"
echo -e "    Senha        : ${BOLD}${GRAFANA_PASSWORD}${RESET}"
echo ""
echo -e "  ${BOLD}Zabbix Trapper${RESET} : ${CYAN}${SERVER_IP}:10051${RESET}"
echo -e "    ↑ Este é o endereço que os agentes dos clientes usam"
echo -e "    ↑ IP dinâmico do cliente não é problema (active checks)"
echo ""
echo -e "  ${BOLD}Próximos passos:${RESET}"
echo -e "    1. Acesse o Zabbix e troque a senha do Admin"
echo -e "    2. Importe o template: ${CYAN}../zabbix/edacall-template.xml${RESET}"
echo -e "       Zabbix → Configuration → Templates → Import"
echo -e "    3. Para cada cliente, crie um Host:"
echo -e "       - Nome: identificador do cliente"
echo -e "       - Grupos: EdaCall"
echo -e "       - Interfaces: Agent (qualquer IP — será ignorado em active mode)"
echo -e "       - Vincule o template 'Template EdaCall PABX'"
echo -e "    4. No Grafana, o datasource Zabbix já está configurado"
echo -e "       O dashboard foi importado automaticamente em: Dashboards → EdaCall"
echo ""
echo -e "  ${BOLD}Comandos úteis:${RESET}"
echo -e "    Logs Zabbix  : ${CYAN}docker compose logs -f zabbix-server${RESET}"
echo -e "    Logs Grafana : ${CYAN}docker compose logs -f grafana${RESET}"
echo -e "    Reiniciar    : ${CYAN}systemctl restart edacall-monitor${RESET}"
echo -e "    Status       : ${CYAN}docker compose ps${RESET}"
echo ""
echo -e "${YELLOW}  ⚠  Senhas salvas em: ${INSTALL_DIR}/.env${RESET}"
echo ""
