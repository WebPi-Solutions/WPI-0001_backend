import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

/**
 * Carga el fichero ".env" del backend si existe.
 *
 * Busca primero en el directorio de trabajo (npm run start:dev) y, si no está,
 * junto a la raíz del paquete compilado. No sobrescribe variables ya definidas
 * en el proceso, para respetar secretos inyectados en tiempo de ejecución.
 *
 * @returns La ruta del fichero cargado, o undefined si no se encontró ninguno.
 */
export function loadBackendDotenv(): string | undefined {
  const candidatePaths: string[] = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../.env'),
  ];

  for (const environmentFilePath of candidatePaths) {
    if (fs.existsSync(environmentFilePath)) {
      dotenv.config({ path: environmentFilePath });
      return environmentFilePath;
    }
  }

  dotenv.config();
  return undefined;
}

/**
 * Normaliza la clave privada de Firebase Admin.
 *
 * El valor en ".env" suele venir en una sola línea con saltos escapados como
 * "\n". firebase-admin necesita la PEM con saltos de línea reales.
 *
 * @param rawPrivateKey - Valor de FIREBASE_PRIVATE_KEY, o undefined si falta.
 * @returns La clave PEM con saltos de línea reales.
 * @throws Error si la variable no está definida o está vacía.
 */
export function resolveFirebasePrivateKey(rawPrivateKey: string | undefined): string {
  if (rawPrivateKey === undefined || rawPrivateKey.trim() === '') {
    throw new Error(
      'FIREBASE_PRIVATE_KEY no está definida. Configura el secreto de entorno o el fichero .env del backend.',
    );
  }

  return rawPrivateKey.replace(/\\n/g, '\n');
}
