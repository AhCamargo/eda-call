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

if [ -f /etc/asterisk-custom/manager.conf ]; then
  cp /etc/asterisk-custom/manager.conf /etc/asterisk/manager.conf
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

mkdir -p /var/lib/asterisk/sounds/custom

generate_prompt() {
  output_file="$1"
  text="$2"

  if [ -f "$output_file" ]; then
    return 0
  fi

  if command -v espeak-ng >/dev/null 2>&1 && command -v sox >/dev/null 2>&1; then
    tmp_file="${output_file}.tmp.wav"
    espeak-ng -v pt-br -s 145 -w "$tmp_file" "$text"
    sox "$tmp_file" -r 8000 -c 1 -b 16 "$output_file"
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
