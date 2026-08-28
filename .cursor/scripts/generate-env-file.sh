#!/usr/bin/env bash
#
# generate-env-file.sh
# -----------------------------------------------------------------------------
# Genera un archivo ".env" con valores por defecto seguros para el entorno de
# desarrollo local del backend WPI, únicamente si dicho archivo todavía no
# existe.
#
# El archivo ".env" está incluido en .gitignore, por lo que no se versiona.
# Este script permite reconstruirlo de forma reproducible en cualquier VM del
# Cloud Agent.
#
# Aspectos importantes:
#   - La aplicación carga la configuración con dotenv, que NO sobrescribe las
#     variables de entorno ya definidas. Por tanto, cualquier Secret real
#     inyectado por la plataforma (por ejemplo OPENAI_API_KEY o las credenciales
#     de Firebase) tiene prioridad sobre los valores ficticios de este archivo.
#   - Se genera una clave privada RSA de un solo uso para Firebase, de modo que
#     el SDK de firebase-admin pueda inicializarse sin credenciales reales y la
#     aplicación arranque correctamente en desarrollo. Esta clave ficticia no
#     concede ningún acceso a servicios reales de Firebase.
# -----------------------------------------------------------------------------

set -euo pipefail

# Ruta del archivo .env, ubicado en la raíz del repositorio (dos niveles por
# encima de este script).
readonly REPOSITORY_ROOT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly ENV_FILE_PATH="${REPOSITORY_ROOT_DIRECTORY}/.env"

# Imprime un mensaje informativo con un prefijo identificable.
log_info() {
  echo "[generate-env-file] $*"
}

# Si el archivo .env ya existe, no se sobrescribe para respetar posibles ajustes
# manuales del desarrollador.
if [[ -f "${ENV_FILE_PATH}" ]]; then
  log_info "El archivo .env ya existe; no se realiza ninguna modificación."
  exit 0
fi

log_info "Generando un archivo .env con valores por defecto para desarrollo local..."

# Genera una clave privada RSA de un solo uso en formato PKCS#8 (encabezado
# "BEGIN PRIVATE KEY"), que es el formato esperado por firebase-admin. A
# continuación, se convierte a una sola línea con saltos de línea escapados
# ("\n"), tal y como se almacena habitualmente en un archivo .env.
readonly GENERATED_PRIVATE_KEY_PEM="$(openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 2>/dev/null)"
readonly GENERATED_PRIVATE_KEY_ESCAPED="$(printf '%s\n' "${GENERATED_PRIVATE_KEY_PEM}" | awk 'NF {printf "%s\\n", $0}')"

# Escribe el archivo .env con toda la configuración necesaria para arrancar la
# aplicación en local. Los bloques comentados corresponden a integraciones
# externas opcionales que deben completarse mediante Secrets reales cuando se
# quieran ejercitar.
cat > "${ENV_FILE_PATH}" <<ENV_FILE_CONTENT
# =============================================================================
# Configuración de desarrollo local (generada automáticamente)
# =============================================================================
# Este archivo lo genera .cursor/scripts/generate-env-file.sh y no se versiona.
# Los Secrets reales inyectados por la plataforma tienen prioridad sobre estos
# valores, ya que dotenv no sobrescribe variables de entorno preexistentes.

# -----------------------------------------------------------------------------
# Base de datos PostgreSQL local
# -----------------------------------------------------------------------------
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=wpi_backend
DATABASE_PASSWORD=wpi_backend_local
DATABASE_NAME=wpi_backend

# -----------------------------------------------------------------------------
# Firebase Admin (credenciales ficticias para desarrollo local)
# -----------------------------------------------------------------------------
# Estas credenciales permiten inicializar el SDK de firebase-admin para que la
# aplicación arranque. No conceden acceso a ningún servicio real de Firebase.
# Para verificar tokens reales, definir los Secrets FIREBASE_* correspondientes.
FIREBASE_TYPE=service_account
FIREBASE_PROJECT_ID=wpi-backend-local
FIREBASE_PRIVATE_KEY_ID=local-development-private-key
FIREBASE_PRIVATE_KEY="${GENERATED_PRIVATE_KEY_ESCAPED}"
FIREBASE_CLIENT_EMAIL=local-development@wpi-backend-local.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=000000000000000000000
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/local-development%40wpi-backend-local.iam.gserviceaccount.com
FIREBASE_UNIVERSE_DOMAIN=googleapis.com

# -----------------------------------------------------------------------------
# Documentación Swagger (protegida con Basic Auth)
# -----------------------------------------------------------------------------
SWAGGER_USER=admin
SWAGGER_PASSWORD=admin

# -----------------------------------------------------------------------------
# Límites de subida de archivos y procesamiento OCR
# -----------------------------------------------------------------------------
# Tamaño máximo de archivo en megabytes.
MAX_FILE_SIZE=10
# Número máximo de páginas a procesar por OCR en un gasto.
MAX_OCR_SPENT_PAGES=5

# -----------------------------------------------------------------------------
# Integraciones externas opcionales
# -----------------------------------------------------------------------------
# Definir mediante Secrets reales para ejercitar cada integración. Sin estos
# valores, los servicios asociados permanecen deshabilitados de forma controlada.
# OPENAI_API_KEY=
# OPENAI_ORG_ID=
# OPENAI_SPENTS_PROCESSING_MODEL=
# STRIPE_SECRET_KEY=
# DROPBOX_REFRESH_TOKEN=
# DROPBOX_CLIENT_ID=
# DROPBOX_CLIENT_SECRET=
# DROPBOX_ENTERPRISE_FOLDER_PATH=
# DROPBOX_ENTERPRISE_LOGO_FILE_PATH=
# DROPBOX_SPENT_FILE_PATH=
ENV_FILE_CONTENT

log_info "Archivo .env generado en ${ENV_FILE_PATH}."
