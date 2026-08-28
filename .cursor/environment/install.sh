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
#
# El entorno de Cloud Agent puede clonar el backend en "/workspace" (un solo
# repositorio) o en "/agent/repos/<nombre>" (varios repositorios). El script
# se invoca por ruta absoluta para no depender del directorio de trabajo.
# =====================================================================

# Modo estricto: abortar ante errores, variables no definidas y fallos en
# tuberías, para detectar problemas de instalación cuanto antes.
set -euo pipefail

# ---------------------------------------------------------------------
# Resolución de rutas de los repositorios.
# El script vive en "<backend>/.cursor/environment/"; a partir de su ubicación
# calculamos la raíz del backend y buscamos el frontend en las rutas usadas
# por Cloud Agent (minúsculas, mayúsculas y directorio hermano).
# ---------------------------------------------------------------------
SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIRECTORY="$(cd "${SCRIPT_DIRECTORY}/../.." && pwd)"
WORKSPACE_ROOT="$(cd "${BACKEND_DIRECTORY}/.." && pwd)"

# =====================================================================
# Función: path_has_package_name
# Descripción: comprueba si un directorio contiene un package.json cuyo campo
#   "name" coincide con el valor esperado.
# Parámetros:
#   $1 - Ruta absoluta del directorio candidato.
#   $2 - Nombre de paquete npm esperado (por ejemplo "frontend").
# Retorno: 0 si el directorio corresponde al paquete; 1 en caso contrario.
# =====================================================================
path_has_package_name() {
  local candidate_directory="$1"
  local expected_package_name="$2"
  local package_manifest="${candidate_directory}/package.json"

  if [ ! -f "${package_manifest}" ]; then
    return 1
  fi

  # Leemos el nombre del paquete sin depender de jq ni de python.
  grep -Eq "\"name\"[[:space:]]*:[[:space:]]*\"${expected_package_name}\"" "${package_manifest}"
}

# =====================================================================
# Función: resolve_frontend_directory
# Descripción: localiza el repositorio del frontend en las rutas habituales
#   de Cloud Agent, independientemente de mayúsculas/minúsculas.
# Parámetros: ninguno.
# Retorno: imprime por stdout la ruta absoluta si se encuentra; código 1 si no.
# =====================================================================
resolve_frontend_directory() {
  local candidate_directory
  local frontend_candidates=(
    "${WORKSPACE_ROOT}/wpi-0001_frontend"
    "${WORKSPACE_ROOT}/WPI-0001_frontend"
    "/agent/repos/wpi-0001_frontend"
    "/agent/repos/WPI-0001_frontend"
  )

  for candidate_directory in "${frontend_candidates[@]}"; do
    if path_has_package_name "${candidate_directory}" "frontend"; then
      printf '%s' "${candidate_directory}"
      return 0
    fi
  done

  return 1
}

# =====================================================================
# Función: install_npm_dependencies
# Descripción: instala las dependencias de un proyecto Node.js. Usa "npm ci"
#   cuando existe package-lock.json para una instalación reproducible, y
#   "npm install" en caso contrario.
# Parámetros:
#   $1 - Ruta absoluta del proyecto.
#   $2 - Etiqueta descriptiva para los registros (por ejemplo "backend").
# Retorno: 0 si la instalación termina correctamente.
# =====================================================================
install_npm_dependencies() {
  local project_directory="$1"
  local project_label="$2"

  echo "[install] Instalando dependencias de ${project_label} en: ${project_directory}"
  cd "${project_directory}"

  # "--legacy-peer-deps" respeta la resolución de dependencias del proyecto
  # (igual que en el Dockerfile de producción del backend).
  if [ -f "${project_directory}/package-lock.json" ]; then
    npm ci --legacy-peer-deps
  else
    npm install --legacy-peer-deps
  fi
}

# ---------------------------------------------------------------------
# Punto de entrada: backend siempre, frontend solo si el repositorio existe.
# ---------------------------------------------------------------------
install_npm_dependencies "${BACKEND_DIRECTORY}" "backend"

FRONTEND_DIRECTORY=""
if FRONTEND_DIRECTORY="$(resolve_frontend_directory)"; then
  install_npm_dependencies "${FRONTEND_DIRECTORY}" "frontend"
else
  echo "[install] Repositorio del frontend no encontrado junto a ${WORKSPACE_ROOT}; se omite."
fi

echo "[install] Instalación de dependencias completada correctamente."
