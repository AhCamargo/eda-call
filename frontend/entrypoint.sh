#!/bin/sh
set -e

CONFIG_FILE=/usr/share/nginx/html/config.js
OVERRIDE=/edacall-config/api_url

if [ -f "$OVERRIDE" ] && [ -s "$OVERRIDE" ]; then
  API_URL=$(cat "$OVERRIDE")
fi

echo "window.EDACALL_API_URL = \"${API_URL:-}\";" > "$CONFIG_FILE"

exec nginx -g "daemon off;"
