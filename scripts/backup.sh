#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  EDACall — Backup do banco de dados e das gravações de chamada
#  Uso: sudo bash backup.sh
#  Pensado para rodar via cron (ver /etc/cron.d/edacall-backup, criado pelo
#  install.sh) a partir da pasta do projeto (onde está o .env e o
#  docker-compose.prod.yml).
#
#  Sem isso, uma falha de disco, um `docker compose down -v` acidental ou um
#  incidente no host apaga permanentemente todo o histórico de chamadas,
#  usuários, campanhas e as próprias gravações (achado R4 da auditoria de
#  segurança).
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}✔${RESET} $*"; }
info() { echo -e "${CYAN}→${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET}  $*"; }
die()  { echo -e "${RED}✖ ERRO:${RESET} $*" >&2; exit 1; }

INSTALL_DIR="${EDACALL_INSTALL_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$INSTALL_DIR"
[[ -f .env ]] && set -a && source .env && set +a

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-edacall_postgres}"
POSTGRES_USER="${POSTGRES_USER:-edacall}"
POSTGRES_DB="${POSTGRES_DB:-edacall}"
RECORDINGS_DIR="${ASTERISK_RECORDINGS_HOST_DIR:-/var/spool/asterisk/monitor}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/edacall}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"

mkdir -p "${BACKUP_DIR}/db" "${BACKUP_DIR}/recordings"

# ── 1. Dump do Postgres ───────────────────────────────────────────────────────
if docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
  DUMP_FILE="${BACKUP_DIR}/db/edacall-db-${TIMESTAMP}.sql.gz"
  info "Gerando dump do Postgres (${POSTGRES_DB})..."
  docker exec "$POSTGRES_CONTAINER" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
    | gzip > "$DUMP_FILE"
  ok "Dump salvo em ${DUMP_FILE} ($(du -h "$DUMP_FILE" | cut -f1))"
else
  warn "Container ${POSTGRES_CONTAINER} não está rodando — dump do banco pulado"
fi

# ── 2. Sincronização das gravações ────────────────────────────────────────────
if [[ -d "$RECORDINGS_DIR" ]]; then
  info "Sincronizando gravações (${RECORDINGS_DIR})..."
  rsync -a "${RECORDINGS_DIR}/" "${BACKUP_DIR}/recordings/"
  ok "Gravações sincronizadas em ${BACKUP_DIR}/recordings/"
else
  warn "Diretório de gravações não encontrado em ${RECORDINGS_DIR} — sincronização pulada"
fi

# ── 3. Retenção — remove dumps antigos ────────────────────────────────────────
find "${BACKUP_DIR}/db" -name '*.sql.gz' -mtime "+${BACKUP_RETENTION_DAYS}" -delete
ok "Dumps com mais de ${BACKUP_RETENTION_DAYS} dias removidos"

# ── 4. Envio opcional para armazenamento externo (rclone) ────────────────────
# Defina RCLONE_REMOTE no .env (ex.: "s3-backup:edacall") para espelhar o
# backup local num destino externo/S3-compatível. Requer rclone instalado e
# configurado (`rclone config`) — sem isso, o backup fica só no disco local,
# o que não protege contra falha do próprio servidor.
if [[ -n "${RCLONE_REMOTE:-}" ]] && command -v rclone &>/dev/null; then
  info "Enviando backup para ${RCLONE_REMOTE}..."
  rclone sync "${BACKUP_DIR}" "${RCLONE_REMOTE}" --quiet
  ok "Backup espelhado em ${RCLONE_REMOTE}"
elif [[ -n "${RCLONE_REMOTE:-}" ]]; then
  warn "RCLONE_REMOTE definido, mas rclone não está instalado — envio externo pulado"
fi

ok "Backup concluído (${TIMESTAMP})"
