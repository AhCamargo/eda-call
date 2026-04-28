#!/bin/bash
# Instala e configura fail2ban para proteger o Asterisk rodando em Docker.
# Execute como root no VPS: bash deploy/fail2ban/setup.sh
set -e

EDACALL_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

apt-get update -qq
apt-get install -y fail2ban

cp "$EDACALL_DIR/deploy/fail2ban/filter.d/asterisk-edacall.conf" \
   /etc/fail2ban/filter.d/asterisk-edacall.conf

# Ajusta o caminho do log para o bind mount real do VPS
sed "s|/opt/edacall|${EDACALL_DIR}|g" \
    "$EDACALL_DIR/deploy/fail2ban/jail.d/asterisk-edacall.conf" \
    > /etc/fail2ban/jail.d/asterisk-edacall.conf

systemctl enable fail2ban
systemctl restart fail2ban

echo "fail2ban configurado. Status:"
fail2ban-client status asterisk-edacall
