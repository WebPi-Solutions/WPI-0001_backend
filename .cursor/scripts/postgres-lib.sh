#!/usr/bin/env bash
#
# postgres-lib.sh
# -----------------------------------------------------------------------------
# Biblioteca compartida de funciones para gestionar una instancia local de
# PostgreSQL propiedad del usuario (sin systemd ni privilegios de root) dentro
# del entorno de Cloud Agent.
#
# El objetivo es disponer de una base de datos PostgreSQL reproducible y
# autocontenida que:
#   - Viva por completo en el directorio de datos del usuario (persistida en el
#     snapshot del entorno).
#   - Se pueda inicializar de forma idempotente durante la fase "install".
#   - Se pueda arrancar de forma idempotente en cada arranque durante la fase
#     "start".
#
# Este archivo solo define variables y funciones; no ejecuta ninguna acción al
# ser incluido con "source".
# -----------------------------------------------------------------------------

# Detiene la ejecución ante cualquier error, variable no definida o fallo en una
# tubería, para que los problemas se detecten cuanto antes.
set -euo pipefail

# -----------------------------------------------------------------------------
# Configuración
# -----------------------------------------------------------------------------

# Directorio raíz donde se almacena todo el estado local de PostgreSQL para este
# proyecto. Se ubica dentro del HOME del usuario para que quede capturado en el
# snapshot del entorno y no requiera privilegios de root.
readonly POSTGRES_STATE_DIRECTORY="${HOME}/.local/state/wpi-backend"

# Directorio de datos (PGDATA) del clúster de PostgreSQL.
readonly POSTGRES_DATA_DIRECTORY="${POSTGRES_STATE_DIRECTORY}/pgdata"

# Directorio donde PostgreSQL creará el socket de dominio Unix. Se usa una ruta
# escribible por el usuario para evitar depender de /var/run/postgresql.
readonly POSTGRES_SOCKET_DIRECTORY="${POSTGRES_STATE_DIRECTORY}/sockets"

# Archivo de log donde se redirige la salida del proceso de PostgreSQL.
readonly POSTGRES_LOG_FILE="${POSTGRES_STATE_DIRECTORY}/postgres.log"

# Puerto TCP en el que escuchará PostgreSQL (coincide con el valor por defecto
# esperado por la aplicación NestJS).
readonly POSTGRES_PORT="5432"

# Directorio de binarios de PostgreSQL en Debian/Ubuntu (versión 16).
readonly POSTGRES_BIN_DIRECTORY="/usr/lib/postgresql/16/bin"

# Nombre de la base de datos y del rol de aplicación utilizados en desarrollo.
readonly APPLICATION_DATABASE_NAME="wpi_backend"
readonly APPLICATION_DATABASE_USER="wpi_backend"
readonly APPLICATION_DATABASE_PASSWORD="wpi_backend_local"

# -----------------------------------------------------------------------------
# Funciones auxiliares
# -----------------------------------------------------------------------------

# Imprime un mensaje informativo con un prefijo identificable.
#
# Parámetros:
#   $* - Texto del mensaje a mostrar.
log_info() {
  echo "[postgres-lib] $*"
}

# Devuelve la ruta absoluta a un binario de PostgreSQL.
#
# Parámetros:
#   $1 - Nombre del binario (por ejemplo, "pg_ctl" o "initdb").
# Salida:
#   Ruta absoluta al binario solicitado.
postgres_binary_path() {
  local binary_name="$1"
  echo "${POSTGRES_BIN_DIRECTORY}/${binary_name}"
}

# Indica si el clúster de PostgreSQL ya ha sido inicializado.
#
# Retorno:
#   0 si el directorio de datos contiene un clúster válido, 1 en caso contrario.
is_cluster_initialized() {
  [[ -s "${POSTGRES_DATA_DIRECTORY}/PG_VERSION" ]]
}

# Indica si el servidor de PostgreSQL está aceptando conexiones.
#
# Retorno:
#   0 si el servidor responde, 1 en caso contrario.
is_postgres_running() {
  "$(postgres_binary_path pg_isready)" \
    --host "${POSTGRES_SOCKET_DIRECTORY}" \
    --port "${POSTGRES_PORT}" \
    >/dev/null 2>&1
}

# Inicializa el clúster de PostgreSQL si aún no existe.
#
# Esta operación es idempotente: si el clúster ya está inicializado, no realiza
# ninguna acción. Configura además el socket, el puerto y la escucha únicamente
# en localhost, adecuado para un entorno de desarrollo.
ensure_cluster_initialized() {
  mkdir -p "${POSTGRES_STATE_DIRECTORY}" "${POSTGRES_SOCKET_DIRECTORY}"

  if is_cluster_initialized; then
    log_info "El clúster de PostgreSQL ya está inicializado en ${POSTGRES_DATA_DIRECTORY}."
    return 0
  fi

  log_info "Inicializando un nuevo clúster de PostgreSQL en ${POSTGRES_DATA_DIRECTORY}..."
  "$(postgres_binary_path initdb)" \
    --pgdata "${POSTGRES_DATA_DIRECTORY}" \
    --auth-local=trust \
    --auth-host=trust \
    --encoding=UTF8 \
    >/dev/null

  # Ajusta la configuración del servidor para un uso local reproducible:
  #   - listen_addresses: solo localhost, evitando exposición externa.
  #   - port: puerto esperado por la aplicación.
  #   - unix_socket_directories: ruta escribible por el usuario.
  {
    echo ""
    echo "# Configuración añadida por el entorno de Cloud Agent (WPI backend)"
    echo "listen_addresses = 'localhost'"
    echo "port = ${POSTGRES_PORT}"
    echo "unix_socket_directories = '${POSTGRES_SOCKET_DIRECTORY}'"
  } >> "${POSTGRES_DATA_DIRECTORY}/postgresql.conf"

  log_info "Clúster de PostgreSQL inicializado correctamente."
}

# Arranca el servidor de PostgreSQL si no está ya en ejecución.
#
# Esta operación es idempotente y espera a que el servidor acepte conexiones
# antes de retornar. Falla de forma explícita si el servidor no llega a estar
# disponible en el tiempo esperado.
start_postgres() {
  if is_postgres_running; then
    log_info "PostgreSQL ya está en ejecución en el puerto ${POSTGRES_PORT}."
    return 0
  fi

  log_info "Arrancando PostgreSQL..."
  "$(postgres_binary_path pg_ctl)" \
    --pgdata "${POSTGRES_DATA_DIRECTORY}" \
    --log "${POSTGRES_LOG_FILE}" \
    --options "-k ${POSTGRES_SOCKET_DIRECTORY}" \
    --wait \
    start

  wait_until_postgres_ready
  log_info "PostgreSQL está aceptando conexiones."
}

# Espera de forma acotada a que PostgreSQL acepte conexiones.
#
# Realiza como máximo 30 intentos separados por un segundo. Si transcurrido ese
# tiempo el servidor no responde, muestra el log y finaliza con error.
wait_until_postgres_ready() {
  local maximum_attempts=30
  local attempt=1

  while (( attempt <= maximum_attempts )); do
    if is_postgres_running; then
      return 0
    fi
    sleep 1
    (( attempt++ ))
  done

  log_info "PostgreSQL no llegó a estar disponible tras ${maximum_attempts} intentos."
  log_info "Últimas líneas del log de PostgreSQL:"
  tail -n 20 "${POSTGRES_LOG_FILE}" || true
  return 1
}

# Garantiza que existen el rol y la base de datos de aplicación.
#
# Requiere que el servidor esté en ejecución. La operación es idempotente: crea
# el rol y la base de datos solo si aún no existen.
ensure_application_database() {
  local psql_binary
  psql_binary="$(postgres_binary_path psql)"

  # Crea el rol de aplicación si no existe. Se conecta a la base de datos
  # "postgres" mediante el socket local con el superusuario por defecto (el
  # propio usuario del sistema que ejecutó initdb).
  if ! "${psql_binary}" \
        --host "${POSTGRES_SOCKET_DIRECTORY}" \
        --port "${POSTGRES_PORT}" \
        --dbname postgres \
        --tuples-only \
        --no-align \
        --command "SELECT 1 FROM pg_roles WHERE rolname = '${APPLICATION_DATABASE_USER}';" \
        | grep -q 1; then
    log_info "Creando el rol de aplicación '${APPLICATION_DATABASE_USER}'..."
    "${psql_binary}" \
      --host "${POSTGRES_SOCKET_DIRECTORY}" \
      --port "${POSTGRES_PORT}" \
      --dbname postgres \
      --command "CREATE ROLE ${APPLICATION_DATABASE_USER} LOGIN PASSWORD '${APPLICATION_DATABASE_PASSWORD}' SUPERUSER;" \
      >/dev/null
  else
    log_info "El rol de aplicación '${APPLICATION_DATABASE_USER}' ya existe."
  fi

  # Crea la base de datos de aplicación si no existe.
  if ! "${psql_binary}" \
        --host "${POSTGRES_SOCKET_DIRECTORY}" \
        --port "${POSTGRES_PORT}" \
        --dbname postgres \
        --tuples-only \
        --no-align \
        --command "SELECT 1 FROM pg_database WHERE datname = '${APPLICATION_DATABASE_NAME}';" \
        | grep -q 1; then
    log_info "Creando la base de datos de aplicación '${APPLICATION_DATABASE_NAME}'..."
    "${psql_binary}" \
      --host "${POSTGRES_SOCKET_DIRECTORY}" \
      --port "${POSTGRES_PORT}" \
      --dbname postgres \
      --command "CREATE DATABASE ${APPLICATION_DATABASE_NAME} OWNER ${APPLICATION_DATABASE_USER};" \
      >/dev/null
  else
    log_info "La base de datos de aplicación '${APPLICATION_DATABASE_NAME}' ya existe."
  fi
}
