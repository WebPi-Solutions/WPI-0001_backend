#!/usr/bin/env bash
# =====================================================================
# Script de arranque del entorno de desarrollo (Cursor Cloud Agent).
#
# Responsabilidad: preparar, en cada arranque del entorno, los servicios y la
# configuración en tiempo de ejecución que necesitan las aplicaciones:
#   1. Arrancar el servidor PostgreSQL local (de forma idempotente).
#   2. Garantizar que existen el rol y la base de datos de desarrollo.
#   3. Generar el fichero ".env" del backend a partir de los secretos
#      inyectados o, en su defecto, de valores locales seguros que permiten
#      arrancar la aplicación sin credenciales reales de terceros.
#
# El script es idempotente: puede ejecutarse en múltiples arranques sin
# duplicar estado ni fallar si los recursos ya existen.
# =====================================================================

set -euo pipefail

# ---------------------------------------------------------------------
# Resolución de rutas.
# ---------------------------------------------------------------------
SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIRECTORY="$(cd "${SCRIPT_DIRECTORY}/../.." && pwd)"
ENVIRONMENT_FILE="${BACKEND_DIRECTORY}/.env"

# ---------------------------------------------------------------------
# Parámetros de la base de datos local de desarrollo.
# ---------------------------------------------------------------------
readonly LOCAL_DATABASE_HOST="127.0.0.1"
readonly LOCAL_DATABASE_PORT="5432"
readonly LOCAL_DATABASE_USERNAME="wpi_user"
readonly LOCAL_DATABASE_PASSWORD="wpi_password"
readonly LOCAL_DATABASE_NAME="wpi_dev"

# =====================================================================
# Función: start_postgresql_server
# Descripción: arranca el clúster de PostgreSQL detectado si no está activo.
# Parámetros: ninguno.
# Retorno: 0 si el servidor queda operativo.
# =====================================================================
start_postgresql_server() {
  # Detectamos dinámicamente la versión y el nombre del primer clúster
  # instalado para no depender de una versión concreta de PostgreSQL.
  local cluster_version
  local cluster_name
  cluster_version="$(pg_lsclusters -h | awk 'NR==1 {print $1}')"
  cluster_name="$(pg_lsclusters -h | awk 'NR==1 {print $2}')"

  if [ -z "${cluster_version}" ] || [ -z "${cluster_name}" ]; then
    echo "[start] ERROR: no se ha encontrado ningún clúster de PostgreSQL instalado." >&2
    return 1
  fi

  echo "[start] Asegurando que el clúster de PostgreSQL ${cluster_version}/${cluster_name} está activo."
  # "pg_ctlcluster ... start" devuelve un código distinto de cero si el clúster
  # ya está en ejecución; toleramos ese caso para mantener la idempotencia.
  sudo pg_ctlcluster "${cluster_version}" "${cluster_name}" start 2>/dev/null || true

  # Esperamos a que el servidor acepte conexiones antes de continuar.
  local attempt
  for attempt in $(seq 1 30); do
    if sudo -u postgres pg_isready -q; then
      echo "[start] PostgreSQL está listo para aceptar conexiones."
      return 0
    fi
    sleep 1
  done

  echo "[start] ERROR: PostgreSQL no está disponible tras el tiempo de espera." >&2
  return 1
}

# =====================================================================
# Función: ensure_database_role_and_schema
# Descripción: crea el rol y la base de datos de desarrollo si no existen.
# Parámetros: ninguno.
# Retorno: 0 si el rol y la base de datos están disponibles.
# =====================================================================
ensure_database_role_and_schema() {
  echo "[start] Verificando el rol '${LOCAL_DATABASE_USERNAME}' y la base de datos '${LOCAL_DATABASE_NAME}'."

  # Creación idempotente del rol de aplicación.
  sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${LOCAL_DATABASE_USERNAME}') THEN
    CREATE ROLE ${LOCAL_DATABASE_USERNAME} LOGIN PASSWORD '${LOCAL_DATABASE_PASSWORD}';
  END IF;
END
\$\$;
SQL

  # Creación idempotente de la base de datos, propiedad del rol de aplicación.
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = '${LOCAL_DATABASE_NAME}'" | grep -q 1; then
    sudo -u postgres createdb -O "${LOCAL_DATABASE_USERNAME}" "${LOCAL_DATABASE_NAME}"
  fi

  # Aseguramos los privilegios del rol sobre la base de datos.
  sudo -u postgres psql -v ON_ERROR_STOP=1 \
    -c "GRANT ALL PRIVILEGES ON DATABASE ${LOCAL_DATABASE_NAME} TO ${LOCAL_DATABASE_USERNAME};"

  echo "[start] Rol y base de datos verificados correctamente."
}

# =====================================================================
# Función: resolve_firebase_private_key
# Descripción: devuelve la clave privada de Firebase a utilizar. Si se ha
#   inyectado una real mediante la variable FIREBASE_PRIVATE_KEY, se usa tal
#   cual; en caso contrario, se genera una clave RSA desechable (con saltos de
#   línea escapados como "\n") que permite que firebase-admin inicialice sin
#   credenciales reales. La autenticación de Firebase NO funcionará con la clave
#   desechable, pero la aplicación podrá arrancar para el desarrollo local.
# Parámetros: ninguno.
# Retorno: imprime por stdout la clave privada en una sola línea.
# =====================================================================
resolve_firebase_private_key() {
  if [ -n "${FIREBASE_PRIVATE_KEY:-}" ]; then
    printf '%s' "${FIREBASE_PRIVATE_KEY}"
    return 0
  fi

  # Generamos una clave RSA temporal y escapamos los saltos de línea.
  local temporary_key
  temporary_key="$(openssl genrsa 2048 2>/dev/null)"
  printf '%s' "${temporary_key}" | awk 'BEGIN {ORS="\\n"} {print}'
}

# =====================================================================
# Función: write_environment_file
# Descripción: genera el fichero ".env" del backend. Prioriza los secretos
#   inyectados como variables de entorno y recurre a valores locales seguros
#   cuando no están definidos.
# Parámetros: ninguno.
# Retorno: 0 si el fichero se escribe correctamente.
# =====================================================================
write_environment_file() {
  echo "[start] Generando el fichero de entorno del backend: ${ENVIRONMENT_FILE}"

  local firebase_private_key
  firebase_private_key="$(resolve_firebase_private_key)"

  # Escribimos el ".env" usando las variables inyectadas o valores por defecto.
  # La sintaxis "${VAR:-valor}" aplica el valor por defecto solo si la variable
  # no está definida o está vacía.
  cat > "${ENVIRONMENT_FILE}" <<ENV
# Fichero generado automáticamente por .cursor/environment/start.sh
# No editar manualmente: se regenera en cada arranque del entorno.

# --- Base de datos PostgreSQL (instancia local de desarrollo) ---
DATABASE_HOST=${DATABASE_HOST:-${LOCAL_DATABASE_HOST}}
DATABASE_PORT=${DATABASE_PORT:-${LOCAL_DATABASE_PORT}}
DATABASE_USERNAME=${DATABASE_USERNAME:-${LOCAL_DATABASE_USERNAME}}
DATABASE_PASSWORD=${DATABASE_PASSWORD:-${LOCAL_DATABASE_PASSWORD}}
DATABASE_NAME=${DATABASE_NAME:-${LOCAL_DATABASE_NAME}}

# --- Documentación Swagger ---
SWAGGER_USER=${SWAGGER_USER:-admin}
SWAGGER_PASSWORD=${SWAGGER_PASSWORD:-admin}

# --- Límites de subida y OCR ---
MAX_FILE_SIZE=${MAX_FILE_SIZE:-10}
MAX_OCR_SPENT_PAGES=${MAX_OCR_SPENT_PAGES:-3}

# --- Cuenta de servicio de Firebase Admin ---
FIREBASE_TYPE=${FIREBASE_TYPE:-service_account}
FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID:-sol-0001}
FIREBASE_PRIVATE_KEY_ID=${FIREBASE_PRIVATE_KEY_ID:-local-dev-key-id}
FIREBASE_PRIVATE_KEY="${firebase_private_key}"
FIREBASE_CLIENT_EMAIL=${FIREBASE_CLIENT_EMAIL:-local-dev@sol-0001.iam.gserviceaccount.com}
FIREBASE_CLIENT_ID=${FIREBASE_CLIENT_ID:-000000000000000000000}
FIREBASE_AUTH_URI=${FIREBASE_AUTH_URI:-https://accounts.google.com/o/oauth2/auth}
FIREBASE_TOKEN_URI=${FIREBASE_TOKEN_URI:-https://oauth2.googleapis.com/token}
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=${FIREBASE_AUTH_PROVIDER_X509_CERT_URL:-https://www.googleapis.com/oauth2/v1/certs}
FIREBASE_CLIENT_X509_CERT_URL=${FIREBASE_CLIENT_X509_CERT_URL:-https://www.googleapis.com/robot/v1/metadata/x509/local-dev%40sol-0001.iam.gserviceaccount.com}
FIREBASE_UNIVERSE_DOMAIN=${FIREBASE_UNIVERSE_DOMAIN:-googleapis.com}

# --- Integraciones de terceros (placeholders si no hay secretos reales) ---
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY:-sk_test_placeholder}
OPENAI_API_KEY=${OPENAI_API_KEY:-sk-placeholder}
OPENAI_ORG_ID=${OPENAI_ORG_ID:-org-placeholder}
OPENAI_SPENTS_PROCESSING_MODEL=${OPENAI_SPENTS_PROCESSING_MODEL:-gpt-4o-mini}
DROPBOX_REFRESH_TOKEN=${DROPBOX_REFRESH_TOKEN:-placeholder}
DROPBOX_CLIENT_ID=${DROPBOX_CLIENT_ID:-placeholder}
DROPBOX_CLIENT_SECRET=${DROPBOX_CLIENT_SECRET:-placeholder}
DROPBOX_SPENT_FILE_PATH=${DROPBOX_SPENT_FILE_PATH:-/enterprises/:enterpriseId/spents/:spentId}
DROPBOX_ENTERPRISE_FOLDER_PATH=${DROPBOX_ENTERPRISE_FOLDER_PATH:-/enterprises/:enterpriseId}
DROPBOX_ENTERPRISE_LOGO_FILE_PATH=${DROPBOX_ENTERPRISE_LOGO_FILE_PATH:-/enterprises/:enterpriseId/logo}
ENV

  echo "[start] Fichero de entorno generado correctamente."
}

# ---------------------------------------------------------------------
# Punto de entrada principal.
# ---------------------------------------------------------------------
main() {
  start_postgresql_server
  ensure_database_role_and_schema
  write_environment_file
  echo "[start] Arranque del entorno completado. La base de datos y la configuración están listas."
}

main "$@"
