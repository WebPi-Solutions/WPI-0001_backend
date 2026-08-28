#!/usr/bin/env bash
#
# install.sh
# -----------------------------------------------------------------------------
# Fase "install" del entorno de Cloud Agent para el backend WPI.
#
# Prepara todo el estado duradero derivado del código fuente ya descargado:
#   1. Inicializa (si es necesario) el clúster local de PostgreSQL.
#   2. Arranca PostgreSQL y garantiza que existen el rol y la base de datos.
#   3. Genera el archivo .env con valores por defecto de desarrollo (si falta).
#   4. Instala las dependencias de Node con "npm ci".
#
# El script es idempotente: puede ejecutarse múltiples veces sin efectos
# adversos, tal y como exige la fase "install".
# -----------------------------------------------------------------------------

set -euo pipefail

# Directorio de este script y raíz del repositorio.
readonly SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPOSITORY_ROOT_DIRECTORY="$(cd "${SCRIPT_DIRECTORY}/../.." && pwd)"

# Incluye la biblioteca compartida de PostgreSQL.
# shellcheck source=/dev/null
source "${SCRIPT_DIRECTORY}/postgres-lib.sh"

# Imprime un mensaje informativo con un prefijo identificable.
log_install() {
  echo "[install] $*"
}

log_install "Iniciando la preparación del entorno de desarrollo del backend WPI."

# Paso 1: garantizar la existencia del clúster de PostgreSQL.
ensure_cluster_initialized

# Paso 2: arrancar PostgreSQL y asegurar el rol y la base de datos de aplicación.
start_postgres
ensure_application_database

# Paso 3: generar el archivo .env de desarrollo si aún no existe.
"${SCRIPT_DIRECTORY}/generate-env-file.sh"

# Paso 4: instalar las dependencias de Node de forma determinista.
#
# El proyecto combina paquetes de NestJS 10 y 11 (por ejemplo, @nestjs/swagger y
# @nestjs/typeorm 11 conviven con @nestjs/common 10), por lo que la resolución
# estricta de dependencias entre pares falla. Se usa --legacy-peer-deps, igual
# que en el Dockerfile de producción, para reproducir exactamente el conjunto de
# dependencias soportado por el proyecto.
log_install "Instalando dependencias de Node con 'npm ci --legacy-peer-deps'..."
cd "${REPOSITORY_ROOT_DIRECTORY}"
npm ci --legacy-peer-deps

log_install "Preparación del entorno completada correctamente."
