#!/usr/bin/env bash
# Levanta la app en el :3300 para probarla desde otros dispositivos de la red local.
#
# ## Por qué no hace falta ningún paquete
#
# El navegador **nunca habla con la API directamente**: todo va contra `/api/*` del propio origen y
# el servidor de Next lo reenvía. Así que exponer un solo puerto basta — no hay que abrir el 5000,
# ni configurar CORS, ni tocar la base de datos.
#
# Lo único que hay que hacer es escuchar en todas las interfaces (`-H 0.0.0.0`) en lugar de sólo en
# la de bucle local, que es lo que hace `next start` por defecto.
#
# ## Por qué se reconstruye
#
# `NEXT_PUBLIC_SITES_DOMAIN` se incrusta en el empaquetado, no se lee en tiempo de ejecución: es lo
# que el resolutor de subdominios compara contra el anfitrión de la petición. Si se queda apuntando
# a `localhost`, una tienda pública abierta desde la tablet no resuelve.
#
# ## Desacoplado de la sesión
#
# `setsid` lo saca del grupo de procesos de quien lo lanza, así que sobrevive a que el agente
# termine su tarea o a que el harness limpie sus procesos en segundo plano.
set -euo pipefail

RAIZ="/home/ale/dev/tfv/.claude/worktrees/rediseno-ui"
PUERTO="${PUERTO:-3300}"
LOG="$RAIZ/.impeccable/servidor-$PUERTO.log"
mkdir -p "$(dirname "$LOG")"

# La dirección con la que esta máquina sale a la red, que es la que la tablet tiene que marcar.
IP="$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K[\d.]+' | head -1 || true)"
if [ -z "$IP" ]; then
  echo "no se pudo determinar la dirección de red; se sirve sólo en local" >&2
  IP="127.0.0.1"
fi

if curl -sS -m 3 -o /dev/null "http://127.0.0.1:$PUERTO/login" 2>/dev/null; then
  echo "ya había algo escuchando en el $PUERTO; se detiene para reconstruir con la nueva dirección"
  pkill -f "next start --port $PUERTO" 2>/dev/null || true
  sleep 1
fi

echo "reconstruyendo con el anfitrión $IP:$PUERTO…"
cd "$RAIZ"
# `NEXT_PUBLIC_SISTEMA` enciende la referencia `/sistema`, que en producción va apagada.
NEXT_PUBLIC_SITES_DOMAIN="$IP:$PUERTO" NEXT_PUBLIC_SISTEMA=1 pnpm --filter @tfv/web build >"$LOG" 2>&1

cd "$RAIZ/apps/web"
NEXT_PUBLIC_SITES_DOMAIN="$IP:$PUERTO" NEXT_PUBLIC_SISTEMA=1 setsid nohup \
  pnpm exec next start --port "$PUERTO" --hostname 0.0.0.0 >>"$LOG" 2>&1 </dev/null &

disown || true

for _ in $(seq 1 20); do
  if curl -sS -m 2 -o /dev/null "http://$IP:$PUERTO/login" 2>/dev/null; then
    echo
    echo "  En esta máquina:  http://localhost:$PUERTO"
    echo "  En la tablet:     http://$IP:$PUERTO"
    echo "  Referencia:       http://$IP:$PUERTO/sistema"
    echo
    echo "  registro: $LOG"
    exit 0
  fi
  sleep 1
done

echo "no respondió a tiempo; mira el registro en $LOG" >&2
exit 1
