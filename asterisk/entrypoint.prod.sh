#!/bin/sh
set -eu

mkdir -p /etc/asterisk-custom

# Seed shared config volume on first start.
if [ -d /opt/edacall-config ]; then
  cp -n /opt/edacall-config/* /etc/asterisk-custom/ 2>/dev/null || true
fi

if [ ! -f /etc/asterisk-custom/sip_custom.conf ]; then
  touch /etc/asterisk-custom/sip_custom.conf
fi

if [ ! -f /etc/asterisk-custom/extensions_custom.conf ]; then
  touch /etc/asterisk-custom/extensions_custom.conf
fi

if [ ! -f /etc/asterisk-custom/queues_custom.conf ]; then
  touch /etc/asterisk-custom/queues_custom.conf
fi

if [ -f /etc/asterisk-custom/manager.conf ]; then
  cp /etc/asterisk-custom/manager.conf /etc/asterisk/manager.conf
fi

# Copia http.conf para habilitar servidor HTTP/WebSocket (WebRTC)
if [ -f /etc/asterisk-custom/http.conf ]; then
  cp /etc/asterisk-custom/http.conf /etc/asterisk/http.conf
fi

# Garante que rtp.conf tem o range correto para os ports expostos no Docker
cat > /etc/asterisk/rtp_runtime.conf << 'RTPEOF'
[general]
rtpstart=10000
rtpend=10099
RTPEOF
if [ -f /etc/asterisk/rtp.conf ]; then
  if ! grep -q "rtp_runtime.conf" /etc/asterisk/rtp.conf; then
    printf "\n#include /etc/asterisk/rtp_runtime.conf\n" >> /etc/asterisk/rtp.conf
  fi
fi

EXTERN_IP="${ASTERISK_EXTERN_IP:-}"
EDACALL_REGISTER="${ASTERISK_EFIX_REGISTER:-}"

cat > /etc/asterisk/sip_nat_runtime.conf << EOF
; Gerado automaticamente pelo entrypoint — não editar manualmente
[general]
externip=${EXTERN_IP}
localnet=127.0.0.0/8
localnet=10.0.0.0/8
localnet=172.16.0.0/12
localnet=192.168.0.0/16
rtpstart=10000
rtpend=10099
directmedia=no
bindaddr=0.0.0.0
nat=force_rport
allowguest=no
alwaysauthreject=yes
EOF

if [ -n "${EDACALL_REGISTER}" ]; then
  printf "\nregister => ${EDACALL_REGISTER}:5060\n" >> /etc/asterisk/sip_nat_runtime.conf
fi

if [ -f /etc/asterisk/sip.conf ]; then
  if ! grep -q "sip_nat_runtime.conf" /etc/asterisk/sip.conf; then
    sed -i '1s/^/#include \/etc\/asterisk\/sip_nat_runtime.conf\n/' /etc/asterisk/sip.conf
  fi
fi

if [ -f /etc/asterisk/sip.conf ]; then
  if ! grep -q "#include /etc/asterisk-custom/sip_custom.conf" /etc/asterisk/sip.conf; then
    printf "\n#include /etc/asterisk-custom/sip_custom.conf\n" >> /etc/asterisk/sip.conf
  fi
fi

if [ -f /etc/asterisk/extensions.conf ]; then
  if ! grep -q "#include /etc/asterisk-custom/extensions_custom.conf" /etc/asterisk/extensions.conf; then
    printf "\n#include /etc/asterisk-custom/extensions_custom.conf\n" >> /etc/asterisk/extensions.conf
  fi
fi

if [ -f /etc/asterisk/queues.conf ]; then
  if ! grep -q "#include /etc/asterisk-custom/queues_custom.conf" /etc/asterisk/queues.conf; then
    printf "\n#include /etc/asterisk-custom/queues_custom.conf\n" >> /etc/asterisk/queues.conf
  fi
fi

mkdir -p /var/lib/asterisk/sounds/custom

generate_prompt() {
  output_file="$1"
  text="$2"
  ulaw_file="${output_file%.wav}.ulaw"

  if [ -f "$output_file" ] && [ -f "$ulaw_file" ]; then
    return 0
  fi

  if command -v espeak-ng >/dev/null 2>&1 && command -v sox >/dev/null 2>&1; then
    tmp_file="${output_file}.tmp.wav"
    espeak-ng -v pt-br -s 145 -w "$tmp_file" "$text"
    sox "$tmp_file" -r 8000 -c 1 -b 16 -e signed-integer "$output_file"
    sox "$tmp_file" -r 8000 -c 1 -e u-law -b 8 -t ul "$ulaw_file"
    rm -f "$tmp_file"
  fi
}

generate_prompt \
  /var/lib/asterisk/sounds/custom/edacall-menu-ptbr.wav \
  "Ola. Bem-vindo ao atendimento EdaCall. Digite um para vendas, dois para suporte tecnico, ou tres para financeiro."

generate_prompt \
  /var/lib/asterisk/sounds/custom/edacall-opcao-invalida-ptbr.wav \
  "Opcao invalida ou nenhuma opcao digitada. Encerrando atendimento."

exec /usr/sbin/asterisk -f -U root -G root
