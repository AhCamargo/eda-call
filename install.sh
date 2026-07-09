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

# ── Validação de Licença ──────────────────────────────────────────────────────
header "Ativação da licença"

LICENSE_DIR="/etc/edacall"
LICENSE_FILE="${LICENSE_DIR}/license.lic"

# Verifica se já existe uma licença instalada
if [[ -f "${LICENSE_FILE}" ]]; then
  ok "Licença já instalada em ${LICENSE_FILE}"
  echo ""
  read -rp "  Deseja substituí-la por uma nova? (s/N): " REPLACE_LIC
  REPLACE_LIC="${REPLACE_LIC,,}"
  [[ "$REPLACE_LIC" != "s" ]] && info "Mantendo licença existente."
fi

if [[ ! -f "${LICENSE_FILE}" || "${REPLACE_LIC:-n}" == "s" ]]; then
  echo -e "  Informe o caminho completo para o arquivo de licença ${BOLD}(.lic)${RESET}"
  echo -e "  fornecido pela EdaCall. Ex: /home/ubuntu/cliente-001_20260523.lic"
  echo ""

  while true; do
    read -rp "  Caminho do arquivo .lic: " LIC_INPUT
    LIC_INPUT="${LIC_INPUT/#\~/$HOME}"  # expande ~

    if [[ -z "$LIC_INPUT" ]]; then
      warn "Caminho não informado. Instalação cancelada."
      die "Uma licença válida é obrigatória para instalar o EdaCall."
    fi

    if [[ ! -f "$LIC_INPUT" ]]; then
      warn "Arquivo não encontrado: ${LIC_INPUT}"
      continue
    fi

    # Valida estrutura mínima do JSON (payload + signature)
    if ! command -v python3 &>/dev/null; then
      warn "python3 não encontrado — instalando para validar licença..."
      apt-get install -y -qq python3 >/dev/null 2>&1
    fi

    VALID_STRUCTURE=$(python3 -c "
import json, sys
try:
    d = json.load(open('${LIC_INPUT}'))
    assert 'payload' in d and 'signature' in d
    assert 'clientId' in d['payload'] and 'expiresAt' in d['payload']
    exp = d['payload']['expiresAt']
    if exp:
        from datetime import datetime, timezone
        expires = datetime.fromisoformat(exp.replace('Z','+00:00'))
        now = datetime.now(timezone.utc)
        assert expires > now, 'EXPIRED'
    print('OK:' + d['payload']['clientId'] + ':' + d['payload']['clientName'])
except AssertionError as e:
    print('EXPIRED' if 'EXPIRED' in str(e) else 'INVALID')
except Exception as e:
    print('ERROR:' + str(e))
" 2>/dev/null)

    case "$VALID_STRUCTURE" in
      OK:*)
        CLIENT_ID=$(echo "$VALID_STRUCTURE" | cut -d: -f2)
        CLIENT_NAME=$(echo "$VALID_STRUCTURE" | cut -d: -f3)
        ok "Licença válida: ${BOLD}${CLIENT_NAME}${RESET} (${CLIENT_ID})"
        break
        ;;
      EXPIRED)
        die "Licença expirada. Contate o suporte para renovação."
        ;;
      INVALID)
        warn "Arquivo de licença inválido ou corrompido."
        warn "Verifique se o arquivo correto foi enviado."
        continue
        ;;
      *)
        warn "Erro ao processar licença: ${VALID_STRUCTURE}"
        continue
        ;;
    esac
  done

  # Instala a licença
  mkdir -p "${LICENSE_DIR}"
  cp "${LIC_INPUT}" "${LICENSE_FILE}"
  chmod 600 "${LICENSE_FILE}"
  ok "Licença instalada em ${LICENSE_FILE}"
fi

echo ""
echo -e "  ${BOLD}Licença de instalação verificada com sucesso.${RESET}"
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

# URL de acesso à API do backend (porta 5000)
echo -e "  O frontend precisa saber o endereço da API para funcionar no navegador."
echo -e "  Normalmente é ${BOLD}http://${SERVER_IP}:5000${RESET} (padrão)"
read -rp "URL da API (Enter para usar http://${SERVER_IP}:5000): " INPUT_URL
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
touch "${ASTERISK_CUSTOM_DIR}/sip_registrations.conf"
touch "${ASTERISK_CUSTOM_DIR}/extensions_inbound.conf"

# manager.conf — sempre sobrescreve para refletir a senha gerada
cp asterisk/config/manager.conf /etc/asterisk/manager.conf
sed -i "s/^secret\s*=.*/secret = ${AMI_PASSWORD}/" /etc/asterisk/manager.conf
ok "manager.conf atualizado com senha AMI gerada"

# cdr_manager.conf — habilita envio de eventos CDR pelo AMI (relatórios de chamadas)
cp asterisk/config/cdr_manager.conf /etc/asterisk/cdr_manager.conf
ok "cdr_manager.conf configurado"

# sip_nat_runtime.conf — configura IP externo e RTP
# IMPORTANTE: este arquivo é o primeiro [general] que o Asterisk lê (incluído na
# linha 1 do sip.conf). As diretivas "register =>" SÓ funcionam se estiverem aqui
# (chan_sip processa registrations apenas do primeiro [general] encontrado).
cat > /etc/asterisk/sip_nat_runtime.conf << SIPEOF
; Gerado pelo instalador EDACall — não editar manualmente
[general]
externip=${SERVER_IP}
; Redes locais: Asterisk usa o IP real da interface para clientes nestas faixas.
; Sem esta configuração, Asterisk usa externip para clientes LAN, e se o IP
; detectado no install mudar (DHCP), o RTP vai para o endereço errado e não sai voz.
localnet=127.0.0.0/8
localnet=172.16.0.0/12
localnet=192.168.0.0/16
localnet=10.0.0.0/8
rtpstart=10000
rtpend=10200
directmedia=no
bindaddr=0.0.0.0
nat=force_rport
allowguest=no
alwaysauthreject=yes
; Registros SIP gerenciados pelo EDACall (register => directives)
#include /etc/asterisk-custom/sip_registrations.conf
SIPEOF

ok "NAT/SIP configurado (IP: ${SERVER_IP})"

# rtp.conf — range de portas para áudio
cat > /etc/asterisk/rtp_runtime.conf << 'RTPEOF'
[general]
rtpstart=10000
rtpend=10200
; Desabilita strict RTP: sem isso, dois softphones locais entram em deadlock
; (cada um aguarda o primeiro pacote do outro para iniciar o envio).
strictrtp=no
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
  # Remove qualquer include de sip_registrations.conf que possa ter sido adicionado
  # ao sip.conf pelo instalador anterior (era inútil pois ficava no segundo [general])
  sed -i '/^#include.*sip_registrations\.conf/d' /etc/asterisk/sip.conf 2>/dev/null || true
fi
if [[ -f /etc/asterisk/extensions.conf ]]; then
  grep -q "extensions_custom.conf" /etc/asterisk/extensions.conf || \
    printf "\n#include /etc/asterisk-custom/extensions_custom.conf\n" >> /etc/asterisk/extensions.conf
  grep -q "extensions_inbound.conf" /etc/asterisk/extensions.conf || \
    printf "\n#include /etc/asterisk-custom/extensions_inbound.conf\n" >> /etc/asterisk/extensions.conf
fi
# Garante que o include => inbound-did-routes existe no [default] do extensions_custom.conf
if [[ -f "${ASTERISK_CUSTOM_DIR}/extensions_custom.conf" ]]; then
  grep -q "include => inbound-did-routes" "${ASTERISK_CUSTOM_DIR}/extensions_custom.conf" || \
    sed -i '/^include => ura-reversa/a include => inbound-did-routes' "${ASTERISK_CUSTOM_DIR}/extensions_custom.conf"
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

# Unifica os diretórios de sons: Asterisk escreve em /usr/share/asterisk/sounds/custom
# mas o backend lê de /var/lib/asterisk/sounds/custom. Um symlink resolve isso.
if [[ -d /usr/share/asterisk/sounds/custom && ! -L /usr/share/asterisk/sounds/custom ]]; then
  cp -rn /usr/share/asterisk/sounds/custom/. /var/lib/asterisk/sounds/custom/ 2>/dev/null || true
  rm -rf /usr/share/asterisk/sounds/custom
fi
ln -sfn /var/lib/asterisk/sounds/custom /usr/share/asterisk/sounds/custom
chown -h asterisk:asterisk /usr/share/asterisk/sounds/custom 2>/dev/null || true
ok "Symlink de áudios configurado"

# Inicia e habilita o Asterisk no boot
systemctl enable asterisk
systemctl restart asterisk
ok "Asterisk iniciado e habilitado no boot"

# ── Instalação do Zabbix Agent ────────────────────────────────────────────────
header "Instalando Zabbix Agent (monitoramento de licença)"

ZABBIX_CONF_DIR=""
if command -v zabbix_agent2 &>/dev/null; then
  ok "Zabbix Agent 2 já instalado: $(zabbix_agent2 -V 2>/dev/null | head -1)"
  ZABBIX_CONF_DIR="/etc/zabbix/zabbix_agent2.d"
elif command -v zabbix_agentd &>/dev/null; then
  ok "Zabbix Agent já instalado: $(zabbix_agentd -V 2>/dev/null | head -1)"
  ZABBIX_CONF_DIR="/etc/zabbix/zabbix_agentd.d"
else
  info "Instalando Zabbix Agent 2..."
  UBUNTU_CODENAME=$(lsb_release -cs 2>/dev/null || echo "jammy")
  ZBX_PKG="zabbix-release_7.0-2+ubuntu$(lsb_release -rs | tr -d '.')_all.deb"
  ZBX_URL="https://repo.zabbix.com/zabbix/7.0/ubuntu/pool/main/z/zabbix-release/${ZBX_PKG}"
  TMP_ZBX="/tmp/zabbix-release.deb"

  if curl -fsSL "$ZBX_URL" -o "$TMP_ZBX" 2>/dev/null; then
    dpkg -i "$TMP_ZBX" >/dev/null 2>&1 || true
    apt-get update -qq
    apt-get install -y -qq zabbix-agent2
    ok "Zabbix Agent 2 instalado"
    ZABBIX_CONF_DIR="/etc/zabbix/zabbix_agent2.d"
  else
    warn "Não foi possível baixar o Zabbix Agent automaticamente."
    warn "Instale manualmente após a instalação do EdaCall:"
    warn "  https://www.zabbix.com/download?zabbix=7.0&os_distribution=ubuntu"
    ZABBIX_CONF_DIR=""
  fi
fi

# Configura Zabbix Server (opcional — pode ser configurado depois)
if [[ -n "$ZABBIX_CONF_DIR" ]]; then
  echo ""
  read -rp "  IP do seu servidor Zabbix (Enter para configurar depois): " ZABBIX_SERVER_IP

  # Instala o script de status de licença
  cp scripts/edacall-license-status /usr/local/bin/edacall-license-status
  chmod +x /usr/local/bin/edacall-license-status
  ok "Script de status instalado em /usr/local/bin/edacall-license-status"

  # Instala UserParameter
  mkdir -p "$ZABBIX_CONF_DIR"
  cp zabbix/userparameter_edacall.conf "${ZABBIX_CONF_DIR}/userparameter_edacall.conf"
  ok "UserParameter instalado em ${ZABBIX_CONF_DIR}/userparameter_edacall.conf"

  # Configura servidor Zabbix se informado
  if [[ -n "${ZABBIX_SERVER_IP:-}" ]]; then
    ZABBIX_MAIN_CONF="/etc/zabbix/zabbix_agent2.conf"
    [[ ! -f "$ZABBIX_MAIN_CONF" ]] && ZABBIX_MAIN_CONF="/etc/zabbix/zabbix_agentd.conf"

    if [[ -f "$ZABBIX_MAIN_CONF" ]]; then
      sed -i "s/^Server=.*/Server=${ZABBIX_SERVER_IP}/" "$ZABBIX_MAIN_CONF" || true
      sed -i "s/^ServerActive=.*/ServerActive=${ZABBIX_SERVER_IP}/" "$ZABBIX_MAIN_CONF" || true
      sed -i "s/^Hostname=.*/Hostname=$(hostname -f)/" "$ZABBIX_MAIN_CONF" || true
      ok "Zabbix Agent configurado para servidor: ${ZABBIX_SERVER_IP}"
    fi

    # Reinicia o agente
    if systemctl is-enabled zabbix-agent2 &>/dev/null; then
      systemctl enable --now zabbix-agent2
      systemctl restart zabbix-agent2
      ok "Zabbix Agent 2 iniciado e habilitado no boot"
    elif systemctl is-enabled zabbix-agent &>/dev/null; then
      systemctl enable --now zabbix-agent
      systemctl restart zabbix-agent
      ok "Zabbix Agent iniciado e habilitado no boot"
    fi
  else
    warn "Servidor Zabbix não configurado. Configure depois em: ${ZABBIX_MAIN_CONF:-/etc/zabbix/zabbix_agent2.conf}"
    warn "Após configurar, reinicie: sudo systemctl restart zabbix-agent2"
  fi

  # Adiciona porta Zabbix ao .env para referência
  echo "" >> .env
  echo "# ── Zabbix ───────────────────────────────────────────────────────────────────" >> .env
  echo "ZABBIX_SERVER=${ZABBIX_SERVER_IP:-}" >> .env
fi

# ── Firewall ──────────────────────────────────────────────────────────────────
header "Configurando firewall (UFW)"

if command -v ufw &>/dev/null; then
  ufw --force enable
  ufw allow ssh          comment "SSH"
  ufw allow 80/tcp       comment "EDACall Frontend"
  ufw allow 5000/tcp     comment "EDACall API"
  ufw allow 5060/udp     comment "SIP"
  ufw allow 10000:10200/udp comment "RTP Audio"
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
echo -e "  ${BOLD}Licença instalada:${RESET}       ${CYAN}${LICENSE_FILE}${RESET}"
echo ""
echo -e "  ${BOLD}Zabbix Agent — próximos passos:${RESET}"
echo -e "    Template  : importe ${CYAN}zabbix/edacall-template.xml${RESET} no seu Zabbix Server"
echo -e "    Host      : crie um host para ${BOLD}${SERVER_IP}${RESET} e vincule o template"
echo -e "    Validar   : ${CYAN}/usr/local/bin/edacall-license-status${RESET}"
echo ""
echo -e "${YELLOW}  ⚠  Guarde as senhas geradas — elas estão salvas em .env${RESET}"
echo ""
