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
# calculamos la raíz del backend y la del frontend (repositorio hermano).
# ---------------------------------------------------------------------
SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIRECTORY="$(cd "${SCRIPT_DIRECTORY}/../.." && pwd)"
WORKSPACE_ROOT="$(cd "${BACKEND_DIRECTORY}/.." && pwd)"
FRONTEND_DIRECTORY="${WORKSPACE_ROOT}/WPI-0001_frontend"

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
if [ -d "${FRONTEND_DIRECTORY}" ]; then
  echo "[install] Instalando dependencias del frontend en: ${FRONTEND_DIRECTORY}"
  cd "${FRONTEND_DIRECTORY}"
  # "npm ci" garantiza una instalación reproducible a partir del package-lock.
  npm ci --legacy-peer-deps
else
  echo "[install] Repositorio del frontend no encontrado en ${FRONTEND_DIRECTORY}; se omite."
fi

echo "[install] Instalación de dependencias completada correctamente."
