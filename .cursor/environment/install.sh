#!/usr/bin/env bash
# =====================================================================
# Script de instalación del entorno de desarrollo (Cursor Cloud Agent).
#
# Responsabilidad: refrescar de forma idempotente las dependencias de las
# aplicaciones del proyecto (backend NestJS y, si está disponible, frontend
# Angular). Se ejecuta después de que el código fuente ha sido clonado.
#
# Este script NO debe iniciar servicios ni procesos de larga duración; de eso
# se encargan ".cursor/environment/start.sh" (servicios por arranque) y los
# terminales definidos en la configuración del entorno.
# =====================================================================

# Modo estricto: abortar ante errores, variables no definidas y fallos en
# tuberías, para detectar problemas de instalación cuanto antes.
set -euo pipefail

# ---------------------------------------------------------------------
# Resolución de rutas de los repositorios.
# El script vive en "<backend>/.cursor/environment/"; a partir de su ubicación
# calculamos la raíz del backend. El frontend es un repositorio hermano cuyo
# nombre en GitHub es "wpi-0001_frontend"; en algunos espacios de trabajo
# también puede aparecer como "WPI-0001_frontend".
# ---------------------------------------------------------------------
SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIRECTORY="$(cd "${SCRIPT_DIRECTORY}/../.." && pwd)"
WORKSPACE_ROOT="$(cd "${BACKEND_DIRECTORY}/.." && pwd)"

# =====================================================================
# Función: resolve_frontend_directory
# Descripción: localiza el repositorio del frontend priorizando el nombre
#   canónico en minúsculas utilizado por los checkouts de Cloud Agent.
# Parámetros: ninguno.
# Retorno: imprime por stdout la ruta absoluta si existe; código 1 si no.
# =====================================================================
resolve_frontend_directory() {
  local candidate_directory
  # El orden importa: el clon fresco de Cloud Agent usa el nombre en minúsculas
  # del repositorio de GitHub. Las copias con mayúsculas pueden ser restos de
  # instantáneas anteriores y no deben recibir "npm ci".
  for candidate_directory in \
    "${WORKSPACE_ROOT}/wpi-0001_frontend" \
    "${WORKSPACE_ROOT}/WPI-0001_frontend"
  do
    if [ -f "${candidate_directory}/package.json" ]; then
      printf '%s' "${candidate_directory}"
      return 0
    fi
  done
  return 1
}

# ---------------------------------------------------------------------
# Instalación de dependencias del backend (NestJS).
# Se usa "--legacy-peer-deps" para respetar la resolución de dependencias del
# proyecto (igual que en el Dockerfile de producción).
# ---------------------------------------------------------------------
echo "[install] Instalando dependencias del backend en: ${BACKEND_DIRECTORY}"
cd "${BACKEND_DIRECTORY}"
npm install --legacy-peer-deps

# ---------------------------------------------------------------------
# Instalación de dependencias del frontend (Angular), solo si el repositorio
# hermano está presente en el espacio de trabajo.
# ---------------------------------------------------------------------
FRONTEND_DIRECTORY=""
if FRONTEND_DIRECTORY="$(resolve_frontend_directory)"; then
  echo "[install] Instalando dependencias del frontend en: ${FRONTEND_DIRECTORY}"
  cd "${FRONTEND_DIRECTORY}"
  # "npm ci" garantiza una instalación reproducible a partir del package-lock.
  npm ci --legacy-peer-deps
  # Desactiva Angular CLI Analytics a nivel de usuario para evitar el prompt
  # interactivo en "ng serve"/"ng build" sin modificar el repositorio.
  NG_CLI_ANALYTICS=false npx --yes ng analytics disable --global >/dev/null 2>&1 || true
else
  echo "[install] Repositorio del frontend no encontrado junto a ${WORKSPACE_ROOT}; se omite."
fi

echo "[install] Instalación de dependencias completada correctamente."
