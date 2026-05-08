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

gen_secret() { tr -dc 'A-Za-z0-9' </dev/urandom | head -c "${1:-32}" || true; }

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

# IP do servidor na rede local
DETECTED_IP=$(hostname -I | awk '{print $1}')
echo -e "IP detectado na rede local: ${BOLD}${DETECTED_IP}${RESET}"
echo -e "  Softphones e ramais usarão este IP para se conectar ao PABX."
read -rp "IP do servidor (Enter para usar ${DETECTED_IP}): " INPUT_IP
SERVER_IP="${INPUT_IP:-$DETECTED_IP}"
ok "IP do servidor: ${SERVER_IP}"
echo ""

# URL de acesso ao frontend (API do backend)
read -rp "URL de acesso ao sistema (ex: http://${SERVER_IP} ou http://pbx.empresa.local): " INPUT_URL
VITE_API_URL="${INPUT_URL:-http://${SERVER_IP}:5000}"
# Garante que não termina com /
VITE_API_URL="${VITE_API_URL%/}"
ok "URL da API: ${VITE_API_URL}"
echo ""

# ── Geração de segredos ───────────────────────────────────────────────────────
header "Gerando senhas seguras"

PG_PASSWORD=$(gen_secret 24)
JWT_SECRET=$(gen_secret 48)
AMI_PASSWORD=$(gen_secret 20)
ok "Senha PostgreSQL gerada"
ok "JWT Secret gerado"
ok "Senha AMI gerada"

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

# ── Instalação do Asterisk ────────────────────────────────────────────────────
if command -v asterisk &>/dev/null; then
  ok "Asterisk já instalado: $(asterisk -V 2>/dev/null | head -1)"
else
  info "Instalando Asterisk, espeak-ng e sox..."
  apt-get update -qq
  apt-get install -y -qq asterisk espeak-ng sox
  ok "Asterisk instalado: $(asterisk -V 2>/dev/null | head -1)"
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
BACKEND_PORT=5000

# ── Asterisk AMI (Asterisk roda direto no SO — não em Docker) ─────────────────
AMI_USERNAME=admin
AMI_PASSWORD=${AMI_PASSWORD}

# ── Frontend ──────────────────────────────────────────────────────────────────
VITE_API_URL=${VITE_API_URL}
EOF

ok ".env criado"

# ── Configura Asterisk (roda nativo no SO) ────────────────────────────────────
header "Configurando Asterisk"

ASTERISK_CUSTOM_DIR="/etc/asterisk-custom"
mkdir -p "${ASTERISK_CUSTOM_DIR}"

# Copia configs iniciais — cp -n não sobrescreve (backend gerencia estes arquivos)
for f in extensions_custom.conf queues_custom.conf http.conf pjsip_custom.conf; do
  [[ -f "asterisk/config/${f}" && ! -f "${ASTERISK_CUSTOM_DIR}/${f}" ]] && \
    cp "asterisk/config/${f}" "${ASTERISK_CUSTOM_DIR}/${f}"
done
touch "${ASTERISK_CUSTOM_DIR}/sip_custom.conf"

# manager.conf — sempre sobrescreve para refletir a senha gerada
cp asterisk/config/manager.conf /etc/asterisk/manager.conf
sed -i "s/^secret\s*=.*/secret = ${AMI_PASSWORD}/" /etc/asterisk/manager.conf
ok "manager.conf atualizado com senha AMI gerada"

# sip_nat_runtime.conf — configura IP externo e RTP
cat > /etc/asterisk/sip_nat_runtime.conf << SIPEOF
; Gerado pelo instalador EDACall — não editar manualmente
[general]
externip=${SERVER_IP}
; Apenas loopback e rede interna Docker ficam em localnet.
; Clientes LAN (192.168.x, 10.x) são tratados como externos para que
; o Asterisk use externip no SDP — áudio funciona corretamente.
localnet=127.0.0.0/8
localnet=172.16.0.0/12
rtpstart=10000
rtpend=10099
directmedia=no
bindaddr=0.0.0.0
nat=force_rport
allowguest=no
alwaysauthreject=yes
SIPEOF

ok "NAT/SIP configurado (IP: ${SERVER_IP})"

# rtp.conf — range de portas para áudio
cat > /etc/asterisk/rtp_runtime.conf << 'RTPEOF'
[general]
rtpstart=10000
rtpend=10099
RTPEOF
if [[ -f /etc/asterisk/rtp.conf ]]; then
  grep -q "rtp_runtime.conf" /etc/asterisk/rtp.conf || \
    printf "\n#include /etc/asterisk/rtp_runtime.conf\n" >> /etc/asterisk/rtp.conf
fi
ok "RTP configurado (portas 10000-10099)"

# Inclui configs customizadas nos arquivos principais do Asterisk
if [[ -f /etc/asterisk/sip.conf ]]; then
  grep -q "sip_nat_runtime.conf" /etc/asterisk/sip.conf || \
    sed -i '1s/^/#include \/etc\/asterisk\/sip_nat_runtime.conf\n/' /etc/asterisk/sip.conf
  grep -q "sip_custom.conf" /etc/asterisk/sip.conf || \
    printf "\n#include /etc/asterisk-custom/sip_custom.conf\n" >> /etc/asterisk/sip.conf
fi
if [[ -f /etc/asterisk/extensions.conf ]]; then
  grep -q "extensions_custom.conf" /etc/asterisk/extensions.conf || \
    printf "\n#include /etc/asterisk-custom/extensions_custom.conf\n" >> /etc/asterisk/extensions.conf
fi
if [[ -f /etc/asterisk/queues.conf ]]; then
  grep -q "queues_custom.conf" /etc/asterisk/queues.conf || \
    printf "\n#include /etc/asterisk-custom/queues_custom.conf\n" >> /etc/asterisk/queues.conf
fi
ok "Arquivos de configuração do Asterisk atualizados"

# Gera áudios de URA padrão em PT-BR
SOUNDS_DIR="/var/lib/asterisk/sounds/custom"
mkdir -p "${SOUNDS_DIR}"

_gen_sound() {
  local out="$1" text="$2" tmp="${1}.tmp.wav" ulaw="${1%.wav}.ulaw"
  [[ -f "$out" && -f "$ulaw" ]] && return 0
  command -v espeak-ng >/dev/null 2>&1 || return 0
  command -v sox >/dev/null 2>&1 || return 0
  espeak-ng -v pt-br -s 145 -w "$tmp" "$text" 2>/dev/null || return 0
  sox "$tmp" -r 8000 -c 1 -b 16 -e signed-integer "$out" 2>/dev/null || true
  sox "$tmp" -r 8000 -c 1 -e u-law -b 8 -t ul "$ulaw" 2>/dev/null || true
  rm -f "$tmp"
}

_gen_sound "${SOUNDS_DIR}/edacall-menu-ptbr.wav" \
  "Ola. Bem-vindo ao atendimento EDACall. Digite um para vendas, dois para suporte tecnico, ou tres para financeiro."
_gen_sound "${SOUNDS_DIR}/edacall-opcao-invalida-ptbr.wav" \
  "Opcao invalida ou nenhuma opcao digitada. Encerrando atendimento."
ok "Áudios de URA gerados"

# Ajusta permissões para o Asterisk acessar os diretórios de gravações e sons
chown -R asterisk:asterisk /var/spool/asterisk /var/lib/asterisk/sounds/custom 2>/dev/null || true

# Inicia e habilita o Asterisk no boot
systemctl enable asterisk
systemctl restart asterisk
ok "Asterisk iniciado e habilitado no boot"

# ── Firewall ──────────────────────────────────────────────────────────────────
header "Configurando firewall (UFW)"

if command -v ufw &>/dev/null; then
  ufw --force enable
  ufw allow ssh          comment "SSH"
  ufw allow 80/tcp       comment "EDACall Frontend"
  ufw allow 5000/tcp     comment "EDACall API"
  ufw allow 5060/udp     comment "SIP"
  ufw allow 10000:10099/udp comment "RTP Audio"
  ufw allow from 172.16.0.0/12 to any port 5038 comment "AMI Docker"
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
Description=EDACall PABX (backend + frontend + banco de dados)
Requires=docker.service asterisk.service
After=docker.service asterisk.service network-online.target
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
echo -e "    Senha    : ${BOLD}123456${RESET}  ← troque imediatamente!"
echo ""
echo -e "  ${BOLD}Configuração SIP dos softphones:${RESET}"
echo -e "    Servidor : ${CYAN}${SERVER_IP}${RESET}"
echo -e "    Porta    : ${CYAN}5060 (UDP)${RESET}"
echo -e "    Protocolo: ${CYAN}SIP${RESET}"
echo ""
echo -e "  ${BOLD}Comandos úteis:${RESET}"
echo -e "    Logs backend  : ${CYAN}docker compose -f docker-compose.prod.yml logs -f backend${RESET}"
echo -e "    Logs Asterisk : ${CYAN}journalctl -u asterisk -f${RESET}"
echo -e "    Console AMI   : ${CYAN}asterisk -rvvv${RESET}"
echo -e "    Reiniciar tudo: ${CYAN}systemctl restart asterisk && systemctl restart edacall${RESET}"
echo -e "    Status        : ${CYAN}docker compose -f docker-compose.prod.yml ps${RESET}"
echo ""
echo -e "  ${BOLD}Arquivo de configuração:${RESET} ${CYAN}${INSTALL_DIR}/.env${RESET}"
echo ""
echo -e "${YELLOW}  ⚠  Guarde as senhas geradas — elas estão salvas em .env${RESET}"
echo ""
