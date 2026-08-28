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
# Función: normalize_firebase_private_key
# Descripción: convierte una PEM (con saltos reales o ya escapados) en una
#   sola línea con "\n", válida para dotenv y para el replace del backend.
# Parámetros:
#   $1 - Clave privada en crudo.
# Retorno: imprime la clave normalizada por stdout.
# =====================================================================
normalize_firebase_private_key() {
  local raw_private_key="$1"
  FIREBASE_PRIVATE_KEY_RAW="${raw_private_key}" python3 - <<'PY'
import os

raw_private_key = os.environ.get("FIREBASE_PRIVATE_KEY_RAW", "")
raw_private_key = raw_private_key.strip().strip('"').strip("'")
raw_private_key = raw_private_key.replace("\r\n", "\n").replace("\r", "\n")
if "\n" in raw_private_key:
    raw_private_key = raw_private_key.replace("\n", "\\n")
print(raw_private_key, end="")
PY
}

# =====================================================================
# Función: resolve_firebase_private_key
# Descripción: devuelve la clave privada de Firebase a persistir en ".env".
#   Si existe FIREBASE_PRIVATE_KEY (secreto de runtime), se normaliza. Si no,
#   se genera una RSA local para que firebase-admin pueda inicializar.
# Parámetros: ninguno.
# Retorno: imprime por stdout la clave en una sola línea con "\n".
# =====================================================================
resolve_firebase_private_key() {
  if [ -n "${FIREBASE_PRIVATE_KEY:-}" ]; then
    echo "[start] FIREBASE_PRIVATE_KEY detectada en el entorno; se persistirá en .env." >&2
    normalize_firebase_private_key "${FIREBASE_PRIVATE_KEY}"
    return 0
  fi

  echo "[start] FIREBASE_PRIVATE_KEY no está en el entorno; se genera una clave local de desarrollo." >&2
  local temporary_key
  temporary_key="$(openssl genrsa 2048 2>/dev/null)"
  normalize_firebase_private_key "${temporary_key}"
}

# =====================================================================
# Función: write_environment_file
# Descripción: genera el fichero ".env" del backend con valores dotenv-safe.
#   Prioriza secretos inyectados y usa valores locales si faltan. La clave de
#   Firebase se escribe siempre en una sola línea para que dotenv la cargue.
# Parámetros: ninguno.
# Retorno: 0 si el fichero se escribe correctamente.
# =====================================================================
write_environment_file() {
  echo "[start] Generando el fichero de entorno del backend: ${ENVIRONMENT_FILE}"

  local firebase_private_key
  firebase_private_key="$(resolve_firebase_private_key)"

  BACKEND_ENV_FILE="${ENVIRONMENT_FILE}" \
  FIREBASE_PRIVATE_KEY_NORMALIZED="${firebase_private_key}" \
  DATABASE_HOST="${DATABASE_HOST:-${LOCAL_DATABASE_HOST}}" \
  DATABASE_PORT="${DATABASE_PORT:-${LOCAL_DATABASE_PORT}}" \
  DATABASE_USERNAME="${DATABASE_USERNAME:-${LOCAL_DATABASE_USERNAME}}" \
  DATABASE_PASSWORD="${DATABASE_PASSWORD:-${LOCAL_DATABASE_PASSWORD}}" \
  DATABASE_NAME="${DATABASE_NAME:-${LOCAL_DATABASE_NAME}}" \
  SWAGGER_USER="${SWAGGER_USER:-admin}" \
  SWAGGER_PASSWORD="${SWAGGER_PASSWORD:-admin}" \
  MAX_FILE_SIZE="${MAX_FILE_SIZE:-10}" \
  MAX_OCR_SPENT_PAGES="${MAX_OCR_SPENT_PAGES:-3}" \
  FIREBASE_TYPE="${FIREBASE_TYPE:-service_account}" \
  FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-sol-0001}" \
  FIREBASE_PRIVATE_KEY_ID="${FIREBASE_PRIVATE_KEY_ID:-local-dev-key-id}" \
  FIREBASE_CLIENT_EMAIL="${FIREBASE_CLIENT_EMAIL:-local-dev@sol-0001.iam.gserviceaccount.com}" \
  FIREBASE_CLIENT_ID="${FIREBASE_CLIENT_ID:-000000000000000000000}" \
  FIREBASE_AUTH_URI="${FIREBASE_AUTH_URI:-https://accounts.google.com/o/oauth2/auth}" \
  FIREBASE_TOKEN_URI="${FIREBASE_TOKEN_URI:-https://oauth2.googleapis.com/token}" \
  FIREBASE_AUTH_PROVIDER_X509_CERT_URL="${FIREBASE_AUTH_PROVIDER_X509_CERT_URL:-https://www.googleapis.com/oauth2/v1/certs}" \
  FIREBASE_CLIENT_X509_CERT_URL="${FIREBASE_CLIENT_X509_CERT_URL:-https://www.googleapis.com/robot/v1/metadata/x509/local-dev%40sol-0001.iam.gserviceaccount.com}" \
  FIREBASE_UNIVERSE_DOMAIN="${FIREBASE_UNIVERSE_DOMAIN:-googleapis.com}" \
  STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-sk_test_placeholder}" \
  OPENAI_API_KEY="${OPENAI_API_KEY:-sk-placeholder}" \
  OPENAI_ORG_ID="${OPENAI_ORG_ID:-org-placeholder}" \
  OPENAI_SPENTS_PROCESSING_MODEL="${OPENAI_SPENTS_PROCESSING_MODEL:-gpt-4o-mini}" \
  DROPBOX_REFRESH_TOKEN="${DROPBOX_REFRESH_TOKEN:-placeholder}" \
  DROPBOX_CLIENT_ID="${DROPBOX_CLIENT_ID:-placeholder}" \
  DROPBOX_CLIENT_SECRET="${DROPBOX_CLIENT_SECRET:-placeholder}" \
  DROPBOX_SPENT_FILE_PATH="${DROPBOX_SPENT_FILE_PATH:-/enterprises/:enterpriseId/spents/:spentId}" \
  DROPBOX_ENTERPRISE_FOLDER_PATH="${DROPBOX_ENTERPRISE_FOLDER_PATH:-/enterprises/:enterpriseId}" \
  DROPBOX_ENTERPRISE_LOGO_FILE_PATH="${DROPBOX_ENTERPRISE_LOGO_FILE_PATH:-/enterprises/:enterpriseId/logo}" \
  python3 - <<'PY'
import os
from pathlib import Path

environment_file_path = Path(os.environ["BACKEND_ENV_FILE"])


def dotenv_value(variable_name: str) -> str:
    """Escapa un valor para una línea dotenv entre comillas dobles."""
    raw_value = os.environ.get(variable_name, "")
    escaped_value = (
        raw_value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n").replace("\r", "")
    )
    return f'"{escaped_value}"'


lines = [
    "# Fichero generado automáticamente por .cursor/environment/start.sh",
    "# No editar manualmente: se regenera en cada arranque del entorno.",
    "",
    "# --- Base de datos PostgreSQL (instancia local de desarrollo) ---",
    f"DATABASE_HOST={dotenv_value('DATABASE_HOST')}",
    f"DATABASE_PORT={dotenv_value('DATABASE_PORT')}",
    f"DATABASE_USERNAME={dotenv_value('DATABASE_USERNAME')}",
    f"DATABASE_PASSWORD={dotenv_value('DATABASE_PASSWORD')}",
    f"DATABASE_NAME={dotenv_value('DATABASE_NAME')}",
    "",
    "# --- Documentación Swagger ---",
    f"SWAGGER_USER={dotenv_value('SWAGGER_USER')}",
    f"SWAGGER_PASSWORD={dotenv_value('SWAGGER_PASSWORD')}",
    "",
    "# --- Límites de subida y OCR ---",
    f"MAX_FILE_SIZE={dotenv_value('MAX_FILE_SIZE')}",
    f"MAX_OCR_SPENT_PAGES={dotenv_value('MAX_OCR_SPENT_PAGES')}",
    "",
    "# --- Cuenta de servicio de Firebase Admin ---",
    f"FIREBASE_TYPE={dotenv_value('FIREBASE_TYPE')}",
    f"FIREBASE_PROJECT_ID={dotenv_value('FIREBASE_PROJECT_ID')}",
    f"FIREBASE_PRIVATE_KEY_ID={dotenv_value('FIREBASE_PRIVATE_KEY_ID')}",
    f"FIREBASE_PRIVATE_KEY={dotenv_value('FIREBASE_PRIVATE_KEY_NORMALIZED')}",
    f"FIREBASE_CLIENT_EMAIL={dotenv_value('FIREBASE_CLIENT_EMAIL')}",
    f"FIREBASE_CLIENT_ID={dotenv_value('FIREBASE_CLIENT_ID')}",
    f"FIREBASE_AUTH_URI={dotenv_value('FIREBASE_AUTH_URI')}",
    f"FIREBASE_TOKEN_URI={dotenv_value('FIREBASE_TOKEN_URI')}",
    f"FIREBASE_AUTH_PROVIDER_X509_CERT_URL={dotenv_value('FIREBASE_AUTH_PROVIDER_X509_CERT_URL')}",
    f"FIREBASE_CLIENT_X509_CERT_URL={dotenv_value('FIREBASE_CLIENT_X509_CERT_URL')}",
    f"FIREBASE_UNIVERSE_DOMAIN={dotenv_value('FIREBASE_UNIVERSE_DOMAIN')}",
    "",
    "# --- Integraciones de terceros (placeholders si no hay secretos reales) ---",
    f"STRIPE_SECRET_KEY={dotenv_value('STRIPE_SECRET_KEY')}",
    f"OPENAI_API_KEY={dotenv_value('OPENAI_API_KEY')}",
    f"OPENAI_ORG_ID={dotenv_value('OPENAI_ORG_ID')}",
    f"OPENAI_SPENTS_PROCESSING_MODEL={dotenv_value('OPENAI_SPENTS_PROCESSING_MODEL')}",
    f"DROPBOX_REFRESH_TOKEN={dotenv_value('DROPBOX_REFRESH_TOKEN')}",
    f"DROPBOX_CLIENT_ID={dotenv_value('DROPBOX_CLIENT_ID')}",
    f"DROPBOX_CLIENT_SECRET={dotenv_value('DROPBOX_CLIENT_SECRET')}",
    f"DROPBOX_SPENT_FILE_PATH={dotenv_value('DROPBOX_SPENT_FILE_PATH')}",
    f"DROPBOX_ENTERPRISE_FOLDER_PATH={dotenv_value('DROPBOX_ENTERPRISE_FOLDER_PATH')}",
    f"DROPBOX_ENTERPRISE_LOGO_FILE_PATH={dotenv_value('DROPBOX_ENTERPRISE_LOGO_FILE_PATH')}",
    "",
]
environment_file_path.write_text("\n".join(lines), encoding="utf-8")
print(f"[start] FIREBASE_PRIVATE_KEY persistida con {len(os.environ.get('FIREBASE_PRIVATE_KEY_NORMALIZED', ''))} caracteres.")
PY

  echo "[start] Fichero de entorno generado correctamente."
}

# =====================================================================
# Función: ensure_development_cli_shims
# Descripción: publica "ng" y "nest" en /usr/local/bin para que estén en PATH
#   aunque el directorio de trabajo no sea el del proyecto.
# Parámetros: ninguno.
# Retorno: 0 siempre; la ausencia de binarios locales no es un error.
# =====================================================================
ensure_development_cli_shims() {
  local frontend_ng="/agent/repos/wpi-0001_frontend/node_modules/.bin/ng"
  local backend_nest="/agent/repos/wpi-0001_backend/node_modules/.bin/nest"

  if [ -x "${frontend_ng}" ]; then
    sudo ln -sfn "${frontend_ng}" /usr/local/bin/ng
    echo "[start] Comando ng disponible en /usr/local/bin/ng"
  else
    echo "[start] Aviso: no se encontró ${frontend_ng}; 'ng serve' no estará en PATH."
  fi

  if [ -x "${backend_nest}" ]; then
    sudo ln -sfn "${backend_nest}" /usr/local/bin/nest
    echo "[start] Comando nest disponible en /usr/local/bin/nest"
  fi
}

# ---------------------------------------------------------------------
# Punto de entrada principal.
# ---------------------------------------------------------------------
main() {
  start_postgresql_server
  ensure_database_role_and_schema
  write_environment_file
  ensure_development_cli_shims
  echo "[start] Arranque del entorno completado. La base de datos y la configuración están listas."
}

main "$@"
