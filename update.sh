#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  EDACall — Atualizador
#  Uso: sudo bash update.sh
#  Execute dentro da pasta do projeto EDACall (onde está o docker-compose.prod.yml)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "${GREEN}✔${RESET} $*"; }
info() { echo -e "${CYAN}→${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET}  $*"; }
die()  { echo -e "${RED}✖ ERRO:${RESET} $*" >&2; exit 1; }

[[ $EUID -ne 0 ]] && die "Execute como root: sudo bash update.sh"
[[ ! -f docker-compose.prod.yml ]] && die "Execute dentro da pasta do projeto EDACall (onde está o docker-compose.prod.yml)"

INSTALL_DIR="$(pwd)"

echo ""
echo -e "${BOLD}${CYAN}══════════════════════════════════════════${RESET}"
echo -e "${BOLD}${CYAN}  EDACall — Atualização${RESET}"
echo -e "${BOLD}${CYAN}══════════════════════════════════════════${RESET}"
echo ""

# ── 1. Obtém o código mais recente ────────────────────────────────────────────
if [[ -d .git ]]; then
  REMOTE_URL=$(git remote get-url origin 2>/dev/null || true)

  if [[ -z "$REMOTE_URL" ]]; then
    warn "Repositório git sem remote configurado."
    warn "Configure com: git remote add origin <URL>"
    die "Não foi possível baixar atualizações."
  fi

  info "Baixando atualizações de ${REMOTE_URL}..."
  git fetch origin main 2>&1 | sed 's/^/  /'
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse origin/main)

  if [[ "$LOCAL" = "$REMOTE" ]]; then
    ok "Código já está na versão mais recente."
    UPDATED_FILES=""
  else
    UPDATED_FILES=$(git diff --name-only "$LOCAL" "$REMOTE")
    git merge --ff-only origin/main 2>&1 | sed 's/^/  /'
    ok "Código atualizado."
    echo ""
    echo "  Arquivos alterados:"
    echo "$UPDATED_FILES" | sed 's/^/    /'
  fi

else
  # Sem .git — baixa como tarball do GitHub via HTTPS
  warn "Pasta sem repositório git. Tentando download direto do GitHub..."
  echo ""

  # Lê URL do .edacall-source se existir (gravado pelo install.sh ou update anterior)
  SOURCE_FILE="${INSTALL_DIR}/.edacall-source"
  if [[ -f "$SOURCE_FILE" ]]; then
    REPO_URL=$(cat "$SOURCE_FILE")
  else
    echo -e "  Informe a URL do repositório GitHub (ex: https://github.com/USUARIO/eda-call)"
    read -rp "  URL: " REPO_URL
    echo "$REPO_URL" > "$SOURCE_FILE"
  fi

  # Extrai owner/repo da URL
  REPO_PATH=$(echo "$REPO_URL" | sed 's|https://github.com/||;s|\.git$||')
  TARBALL_URL="https://github.com/${REPO_PATH}/archive/refs/heads/main.tar.gz"

  info "Baixando ${TARBALL_URL}..."
  TMP_DIR=$(mktemp -d)
  trap 'rm -rf "$TMP_DIR"' EXIT

  # Suporte opcional a token para repos privados (lê de .edacall-token)
  TOKEN_FILE="${INSTALL_DIR}/.edacall-token"
  CURL_AUTH=""
  if [[ -f "$TOKEN_FILE" ]]; then
    TOKEN=$(cat "$TOKEN_FILE")
    CURL_AUTH="-H \"Authorization: token ${TOKEN}\""
    info "Usando token de autenticação de ${TOKEN_FILE}"
  fi

  if ! curl -fsSL ${CURL_AUTH} "$TARBALL_URL" -o "${TMP_DIR}/edacall.tar.gz"; then
    echo ""
    warn "Não foi possível baixar o código."
    echo ""
    echo -e "  Para repositórios ${BOLD}privados${RESET}, crie um arquivo com seu GitHub Token:"
    echo -e "    echo 'ghp_SEU_TOKEN_AQUI' > ${INSTALL_DIR}/.edacall-token"
    echo -e "    chmod 600 ${INSTALL_DIR}/.edacall-token"
    echo ""
    echo -e "  Para gerar um token: GitHub → Settings → Developer settings → Personal access tokens"
    echo -e "  Permissão necessária: ${BOLD}repo → read${RESET}"
    die "Autenticação necessária. Crie o arquivo .edacall-token e tente novamente."
  fi

  # Extrai e copia apenas os arquivos de código (preserva .env e dados)
  REPO_NAME=$(echo "$REPO_PATH" | sed 's|.*/||')
  tar -xzf "${TMP_DIR}/edacall.tar.gz" -C "${TMP_DIR}"
  EXTRACTED_DIR="${TMP_DIR}/${REPO_NAME}-main"

  # Copia tudo exceto arquivos de ambiente e dados locais
  rsync -a --exclude='.env' \
            --exclude='*.log' \
            "${EXTRACTED_DIR}/" "${INSTALL_DIR}/"

  ok "Código atualizado via tarball."
  UPDATED_FILES="(todos os arquivos)"
fi

# ── 2. Atualiza configs do Asterisk se install.sh foi alterado ────────────────
if echo "${UPDATED_FILES:-}" | grep -q "install.sh\|asterisk/"; then
  warn "Arquivos do Asterisk alterados — pode ser necessário re-configurar o Asterisk."
  warn "Se necessário, execute manualmente: sudo bash install.sh"
fi

# ── 3. Decide quais containers precisam ser reconstruídos ─────────────────────
REBUILD_BACKEND=false
REBUILD_FRONTEND=false

if echo "${UPDATED_FILES:-}" | grep -qE "^backend/|^(docker-compose)"; then
  REBUILD_BACKEND=true
fi
if echo "${UPDATED_FILES:-}" | grep -qE "^frontend/|^(docker-compose)"; then
  REBUILD_FRONTEND=true
fi
# Se não há diff (tarball ou já atualizado sem tracking), reconstrói tudo
if [[ -z "${UPDATED_FILES:-}" ]]; then
  REBUILD_BACKEND=true
  REBUILD_FRONTEND=true
fi

echo ""
info "Serviços a reconstruir: backend=${REBUILD_BACKEND} frontend=${REBUILD_FRONTEND}"
echo ""

# ── 4. Build e restart dos containers necessários ────────────────────────────
SERVICES=""
$REBUILD_BACKEND  && SERVICES="$SERVICES backend"
$REBUILD_FRONTEND && SERVICES="$SERVICES frontend"

if [[ -z "$SERVICES" ]]; then
  ok "Nenhum container precisa ser reconstruído."
else
  info "Reconstruindo:${SERVICES}..."
  docker compose -f docker-compose.prod.yml build --progress=plain $SERVICES

  info "Reiniciando serviços..."
  docker compose -f docker-compose.prod.yml up -d $SERVICES
fi

# ── 5. Verifica saúde do backend ──────────────────────────────────────────────
BACKEND_URL="http://localhost:5000/health"
MAX_WAIT=60
WAITED=0

info "Aguardando API ficar disponível..."
until curl -sf "$BACKEND_URL" &>/dev/null; do
  if [[ $WAITED -ge $MAX_WAIT ]]; then
    warn "API não respondeu em ${MAX_WAIT}s"
    warn "Verifique: docker compose -f docker-compose.prod.yml logs backend"
    break
  fi
  sleep 3
  WAITED=$((WAITED + 3))
  echo -n "."
done
echo ""
curl -sf "$BACKEND_URL" &>/dev/null && ok "API respondendo normalmente."

echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  Atualização concluída!${RESET}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════${RESET}"
echo ""
echo -e "  ${BOLD}Versão em execução:${RESET}"
docker compose -f docker-compose.prod.yml ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null || true
echo ""
