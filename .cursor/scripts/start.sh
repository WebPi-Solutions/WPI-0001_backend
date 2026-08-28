#!/usr/bin/env bash
#
# start.sh
# -----------------------------------------------------------------------------
# Fase "start" del entorno de Cloud Agent para el backend WPI.
#
# Reconciliación por arranque: garantiza que el servidor local de PostgreSQL
# está en ejecución y que el rol y la base de datos de aplicación existen. No
# instala dependencias ni compila código (eso corresponde a la fase "install").
#
# El script es idempotente y tolera reinicios: si PostgreSQL ya está en
# ejecución, no realiza ninguna acción adicional.
# -----------------------------------------------------------------------------

set -euo pipefail

# Directorio de este script.
readonly SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Incluye la biblioteca compartida de PostgreSQL.
# shellcheck source=/dev/null
source "${SCRIPT_DIRECTORY}/postgres-lib.sh"

# Imprime un mensaje informativo con un prefijo identificable.
log_start() {
  echo "[start] $*"
}

log_start "Reconciliando los servicios de arranque del backend WPI."

# Garantiza el clúster (por robustez ante snapshots incompletos), arranca el
# servidor y asegura la base de datos de aplicación.
ensure_cluster_initialized
start_postgres
ensure_application_database

log_start "PostgreSQL está disponible en localhost:${POSTGRES_PORT}."
log_start "Servicios de arranque listos."
