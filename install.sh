#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  EDACall — Instalador para Ubuntu Server 22.04 / 24.04
#  Uso: sudo bash install.sh
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Cores ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "${GREEN}✔${RESET} $*"; }
info() { echo -e "${CYAN}→${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET}  $*"; }
die()  { echo -e "${RED}✖ ERRO:${RESET} $*" >&2; exit 1; }

header() {
  echo ""
  echo -e "${BOLD}${CYAN}══════════════════════════════════════════${RESET}"
  echo -e "${BOLD}${CYAN}  $*${RESET}"
  echo -e "${BOLD}${CYAN}══════════════════════════════════════════${RESET}"
  echo ""
}

gen_secret() { tr -dc 'A-Za-z0-9!@#%^&*' </dev/urandom | head -c "${1:-32}"; }

# ── Pré-requisitos ────────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && die "Execute como root: sudo bash install.sh"
[[ ! -f docker-compose.prod.yml ]] && die "Execute dentro da pasta do projeto EDACall (onde está o docker-compose.prod.yml)"

# Detecta versão Ubuntu
if ! grep -qi "ubuntu" /etc/os-release 2>/dev/null; then
  warn "Sistema não é Ubuntu. Continuando mesmo assim..."
fi

clear
echo -e "${BOLD}"
cat <<'LOGO'
  ███████╗██████╗  █████╗  ██████╗ █████╗ ██╗     ██╗
  ██╔════╝██╔══██╗██╔══██╗██╔════╝██╔══██╗██║     ██║
  █████╗  ██║  ██║███████║██║     ███████║██║     ██║
  ██╔══╝  ██║  ██║██╔══██║██║     ██╔══██║██║     ██║
  ███████╗██████╔╝██║  ██║╚██████╗██║  ██║███████╗███████╗
  ╚══════╝╚═════╝ ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚══════╝
LOGO
echo -e "${RESET}"
echo -e "  Instalador do sistema EDACall — PABX"
echo ""

# ── Coleta de informações ─────────────────────────────────────────────────────
header "Configuração da instalação"

# IP do servidor
DETECTED_IP=$(hostname -I | awk '{print $1}')
echo -e "IP detectado da rede: ${BOLD}${DETECTED_IP}${RESET}"
read -rp "IP do servidor (Enter para usar ${DETECTED_IP}): " INPUT_IP
SERVER_IP="${INPUT_IP:-$DETECTED_IP}"
ok "IP do servidor: ${SERVER_IP}"
echo ""

# URL de acesso ao frontend
read -rp "URL de acesso ao sistema (ex: http://${SERVER_IP} ou https://pbx.empresa.com): " INPUT_URL
VITE_API_URL="${INPUT_URL:-http://${SERVER_IP}:5000}"
# Garante que não termina com /
VITE_API_URL="${VITE_API_URL%/}"
ok "URL da API: ${VITE_API_URL}"
echo ""

# Tronco SIP (opcional)
echo -e "Registro SIP do tronco (operadora). Formato: ${BOLD}usuario:senha@host:porta${RESET}"
echo -e "  Deixe em branco para configurar depois."
read -rp "Registro SIP: " EFIX_REGISTER
echo ""

# ── Geração de segredos ───────────────────────────────────────────────────────
header "Gerando senhas seguras"

PG_PASSWORD=$(gen_secret 24)
JWT_SECRET=$(gen_secret 48)
AMI_PASSWORD=$(gen_secret 20)
INTERNAL_KEY=$(gen_secret 32)

ok "Senha PostgreSQL gerada"
ok "JWT Secret gerado"
ok "Senha AMI gerada"
ok "Chave interna gerada"

# ── Instalação do Docker ──────────────────────────────────────────────────────
header "Instalando dependências"

if command -v docker &>/dev/null && docker compose version &>/dev/null; then
  ok "Docker já instalado: $(docker --version)"
else
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
  ok "Docker instalado: $(docker --version)"
fi

# ── Grava o .env ─────────────────────────────────────────────────────────────
header "Criando arquivo de configuração (.env)"

cat > .env <<EOF
# Gerado pelo instalador EDACall em $(date '+%Y-%m-%d %H:%M')

# ── Banco de dados ────────────────────────────────────────────────────────────
POSTGRES_DB=edacall
POSTGRES_USER=edacall
POSTGRES_PASSWORD=${PG_PASSWORD}

# ── Backend ───────────────────────────────────────────────────────────────────
JWT_SECRET=${JWT_SECRET}
INTERNAL_API_KEY=${INTERNAL_KEY}
BACKEND_PORT=5000

# ── Asterisk AMI ──────────────────────────────────────────────────────────────
AMI_USERNAME=admin
AMI_PASSWORD=${AMI_PASSWORD}

# ── Asterisk — IP do servidor (para NAT/SDP correto) ─────────────────────────
ASTERISK_EXTERN_IP=${SERVER_IP}

# ── Registro SIP no tronco (operadora) ───────────────────────────────────────
ASTERISK_EFIX_REGISTER=${EFIX_REGISTER}

# ── Frontend ──────────────────────────────────────────────────────────────────
VITE_API_URL=${VITE_API_URL}
EOF

ok ".env criado"

# ── Atualiza manager.conf com a senha AMI gerada ─────────────────────────────
MANAGER_CONF="asterisk/config/manager.conf"
if [[ -f "$MANAGER_CONF" ]]; then
  # Substitui a senha se a linha existir, senão preserva o arquivo
  sed -i "s/^secret\s*=.*/secret = ${AMI_PASSWORD}/" "$MANAGER_CONF"
  ok "manager.conf atualizado com senha AMI"
fi

# ── Firewall ──────────────────────────────────────────────────────────────────
header "Configurando firewall (UFW)"

if command -v ufw &>/dev/null; then
  ufw --force enable
  ufw allow ssh          comment "SSH"
  ufw allow 80/tcp       comment "EDACall Frontend"
  ufw allow 5000/tcp     comment "EDACall API"
  ufw allow 5060/udp     comment "SIP"
  ufw allow 5038/tcp     comment "AMI (local)"
  ufw allow 10000:10099/udp comment "RTP Audio"
  ufw reload
  ok "Firewall configurado"
else
  warn "UFW não encontrado — configure o firewall manualmente"
  warn "Portas necessárias: 80/tcp, 5000/tcp, 5060/udp, 10000-10099/udp"
fi

# ── Build e subida dos containers ─────────────────────────────────────────────
header "Construindo e iniciando o sistema"

info "Build das imagens (pode demorar na primeira vez)..."
docker compose -f docker-compose.prod.yml build --progress=plain

info "Iniciando containers..."
docker compose -f docker-compose.prod.yml up -d

ok "Containers no ar"

# ── Serviço systemd para auto-start ──────────────────────────────────────────
header "Configurando inicialização automática"

INSTALL_DIR="$(pwd)"

cat > /etc/systemd/system/edacall.service <<EOF
[Unit]
Description=EDACall PABX
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml up -d
ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable edacall
ok "Serviço systemd criado — inicia automaticamente no boot"

# ── Aguarda o backend ficar saudável ─────────────────────────────────────────
header "Aguardando sistema inicializar"

BACKEND_URL="http://localhost:5000/health"
MAX_WAIT=120
WAITED=0

info "Aguardando API ficar disponível..."
until curl -sf "$BACKEND_URL" &>/dev/null; do
  if [[ $WAITED -ge $MAX_WAIT ]]; then
    warn "API não respondeu em ${MAX_WAIT}s — verifique: docker compose -f docker-compose.prod.yml logs backend"
    break
  fi
  sleep 3
  WAITED=$((WAITED + 3))
  echo -n "."
done
echo ""
curl -sf "$BACKEND_URL" &>/dev/null && ok "API respondendo"

# ── Resumo final ──────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  EDACall instalado com sucesso!${RESET}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════════════${RESET}"
echo ""
echo -e "  ${BOLD}Acesso ao sistema:${RESET}"
echo -e "    Frontend : ${CYAN}http://${SERVER_IP}${RESET}"
echo -e "    API      : ${CYAN}http://${SERVER_IP}:5000${RESET}"
echo ""
echo -e "  ${BOLD}Credenciais padrão de primeiro acesso:${RESET}"
echo -e "    Usuário  : ${BOLD}admin${RESET}"
echo -e "    Senha    : ${BOLD}admin123${RESET}  ← troque imediatamente!"
echo ""
echo -e "  ${BOLD}Configuração SIP dos softphones:${RESET}"
echo -e "    Servidor : ${CYAN}${SERVER_IP}${RESET}"
echo -e "    Porta    : ${CYAN}5060 (UDP)${RESET}"
echo -e "    Protocolo: ${CYAN}SIP${RESET}"
echo ""
echo -e "  ${BOLD}Comandos úteis:${RESET}"
echo -e "    Ver logs    : ${CYAN}docker compose -f docker-compose.prod.yml logs -f${RESET}"
echo -e "    Reiniciar   : ${CYAN}systemctl restart edacall${RESET}"
echo -e "    Status      : ${CYAN}docker compose -f docker-compose.prod.yml ps${RESET}"
echo ""
echo -e "  ${BOLD}Arquivo de configuração:${RESET} ${CYAN}${INSTALL_DIR}/.env${RESET}"
echo ""
echo -e "${YELLOW}  ⚠  Guarde as senhas geradas — elas estão salvas em .env${RESET}"
echo ""
