#!/usr/bin/env bash
# Levanta la app del rediseño en el :3300, desacoplada de la sesión.
#
# `setsid` la saca del grupo de procesos de quien la lanza, así que no muere cuando el agente
# termina su tarea ni cuando el harness limpia sus procesos en segundo plano. El registro queda en
# un archivo para poder mirarlo después.
set -euo pipefail

RAIZ="/home/ale/dev/tfv/.claude/worktrees/rediseno-ui"
LOG="$RAIZ/.impeccable/servidor-3300.log"
mkdir -p "$(dirname "$LOG")"

# Si ya hay algo escuchando, no se levanta un segundo.
if curl -sS -m 3 -o /dev/null "http://127.0.0.1:3300/sistema" 2>/dev/null; then
  echo "ya estaba arriba"
  exit 0
fi

cd "$RAIZ/apps/web"
NEXT_PUBLIC_SITES_DOMAIN=localhost:3300 setsid nohup \
  pnpm exec next start --port 3300 >"$LOG" 2>&1 </dev/null &

disown || true
echo "lanzado · registro en $LOG"
