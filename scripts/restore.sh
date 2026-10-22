#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  EDACall — Restauração do banco de dados a partir de um backup
#  Uso: sudo bash restore.sh <dump.sql.gz> [--yes]
#
#  ATENÇÃO: sobrescreve completamente o banco de dados atual. Sem --yes,
#  o script apenas mostra o que faria e pede confirmação.
#
#  Restauração das gravações: como o backup é um espelho (rsync) em
#  ${BACKUP_DIR}/recordings, basta copiar de volta manualmente, ex.:
#    rsync -a /var/backups/edacall/recordings/ /var/spool/asterisk/monitor/
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}✔${RESET} $*"; }
info() { echo -e "${CYAN}→${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET}  $*"; }
die()  { echo -e "${RED}✖ ERRO:${RESET} $*" >&2; exit 1; }

DUMP_FILE="${1:-}"
CONFIRM="${2:-}"
[[ -z "$DUMP_FILE" ]] && die "Uso: sudo bash restore.sh <dump.sql.gz> [--yes]"
[[ ! -f "$DUMP_FILE" ]] && die "Arquivo não encontrado: ${DUMP_FILE}"

INSTALL_DIR="${EDACALL_INSTALL_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$INSTALL_DIR"
[[ -f .env ]] && set -a && source .env && set +a

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-edacall_postgres}"
POSTGRES_USER="${POSTGRES_USER:-edacall}"
POSTGRES_DB="${POSTGRES_DB:-edacall}"

docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER" \
  || die "Container ${POSTGRES_CONTAINER} não está rodando"

warn "Isso vai APAGAR e substituir todos os dados atuais de '${POSTGRES_DB}' por ${DUMP_FILE}."
if [[ "$CONFIRM" != "--yes" ]]; then
  read -rp "  Digite 'restaurar' para confirmar: " ANSWER
  [[ "$ANSWER" == "restaurar" ]] || die "Cancelado."
fi

info "Restaurando ${DUMP_FILE} em ${POSTGRES_DB}..."
gunzip -c "$DUMP_FILE" \
  | docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1

ok "Restauração concluída. Reinicie o backend para reconectar: docker compose -f docker-compose.prod.yml restart backend"
