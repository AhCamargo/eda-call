#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
#  EdaCall — liga/desliga módulos opcionais ("Lego")
#
#  Uso (dentro da pasta do EdaCall, onde está o docker-compose.prod.yml):
#    sudo ./edacall-modulo.sh listar
#    sudo ./edacall-modulo.sh ativar ligacao-perdida
#    sudo ./edacall-modulo.sh desativar ligacao-perdida
#
#  Cada módulo é um profile do Docker Compose. Ativar = gerar as chaves que
#  faltam no .env, colocar o profile em COMPOSE_PROFILES e subir os containers.
#  Desativar = tirar do COMPOSE_PROFILES e parar os containers do módulo.
#  Os dados do módulo (schema próprio no Postgres, sessão do WhatsApp) ficam
#  guardados: ativar de novo continua de onde parou.
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}✔${RESET} $*"; }
info() { echo -e "${CYAN}→${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET}  $*"; }
die()  { echo -e "${RED}✖ ERRO:${RESET} $*" >&2; exit 1; }

COMPOSE_FILE="${COMPOSE_FILE_OVERRIDE:-docker-compose.prod.yml}"
[[ -f "$COMPOSE_FILE" ]] || die "Execute dentro da pasta do EdaCall (onde está o $COMPOSE_FILE)"
[[ -f .env ]] || die "Arquivo .env não encontrado — rode o install.sh primeiro"

# Módulos conhecidos: nome → serviços do compose
declare -A SERVICES=(
  [ligacao-perdida]="waha mod-ligacao-perdida"
)
declare -A DESCRIPTION=(
  [ligacao-perdida]="Manda WhatsApp para quem ligou e não foi atendido (WAHA, sem custo de licença)"
)

gen_secret() { tr -dc 'A-Za-z0-9' </dev/urandom | head -c "${1:-40}" || true; }

env_get() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- || true; }

env_set() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

ensure_secret() {
  local key="$1"
  if [[ -z "$(env_get "$key")" ]]; then
    env_set "$key" "$(gen_secret 40)"
    ok "$key gerada no .env"
  fi
}

active_profiles() { env_get COMPOSE_PROFILES | tr ',' '\n' | sed '/^$/d'; }

set_profiles() {
  local joined
  joined=$(printf '%s\n' "$@" | sed '/^$/d' | sort -u | paste -sd, -)
  env_set COMPOSE_PROFILES "$joined"
}

cmd="${1:-listar}"
module="${2:-}"

case "$cmd" in
  listar|list)
    echo ""
    for m in "${!SERVICES[@]}"; do
      if active_profiles | grep -qx "$m"; then state="${GREEN}ativo${RESET}"; else state="desativado"; fi
      echo -e "  ${CYAN}${m}${RESET} — ${DESCRIPTION[$m]} [${state}]"
    done
    echo ""
    ;;

  ativar|enable)
    [[ -n "$module" && -n "${SERVICES[$module]:-}" ]] || die "Módulo desconhecido: '${module}'. Veja: $0 listar"
    ensure_secret MODULES_SECRET
    [[ "$module" == "ligacao-perdida" ]] && ensure_secret WAHA_API_KEY
    mapfile -t current < <(active_profiles)
    set_profiles "${current[@]}" "$module"
    ok "Profile '${module}' adicionado ao COMPOSE_PROFILES"

    info "Subindo o núcleo com a chave de módulos e os containers do módulo..."
    # O backend é recriado para ler a MODULES_SECRET (não reconstrói a imagem)
    docker compose -f "$COMPOSE_FILE" up -d backend
    docker compose -f "$COMPOSE_FILE" up -d --build ${SERVICES[$module]}
    ok "Módulo '${module}' ativo. Ele aparece no menu do EdaCall em até 1 minuto (seção Módulos)."
    ;;

  desativar|disable)
    [[ -n "$module" && -n "${SERVICES[$module]:-}" ]] || die "Módulo desconhecido: '${module}'. Veja: $0 listar"
    mapfile -t current < <(active_profiles | grep -vx "$module" || true)
    set_profiles "${current[@]:-}"
    # stop/rm explícito: o profile já saiu do .env, então o compose não os veria
    docker compose -f "$COMPOSE_FILE" --profile "$module" stop ${SERVICES[$module]} || true
    docker compose -f "$COMPOSE_FILE" --profile "$module" rm -f ${SERVICES[$module]} || true
    ok "Módulo '${module}' desativado. Os dados dele continuam guardados."
    ;;

  *)
    die "Comando desconhecido: $cmd (use listar, ativar ou desativar)"
    ;;
esac
