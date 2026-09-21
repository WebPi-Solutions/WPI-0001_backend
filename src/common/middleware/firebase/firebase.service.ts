import * as admin from 'firebase-admin';

import * as dotenv from 'dotenv';
if (process.env.E2E_TEST !== 'true') {
  dotenv.config();
}

/**
 * Normaliza la clave privada de la cuenta de servicio.
 * En `.env` los saltos de línea van escapados (`\\n`); si la variable no existe
 * (CI unitario sin secretos) se usa cadena vacía para no romper el import.
 * Los tests pisan esta variable con un valor ficticio y mockean `firebase-admin`.
 * @param rawPrivateKey - Valor de `FIREBASE_PRIVATE_KEY`, o indefinido
 * @returns Clave con saltos de línea reales, o cadena vacía
 */
function normalizeFirebasePrivateKey(rawPrivateKey: string | undefined): string {
  return (rawPrivateKey ?? '').replace(/\\n/g, '\n');
}

const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: normalizeFirebasePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
  universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN,
};

const firebaseServiceAccount = serviceAccount as admin.ServiceAccount;

admin.initializeApp({
  credential: admin.credential.cert(firebaseServiceAccount),
});

export const firebaseAdmin = admin;