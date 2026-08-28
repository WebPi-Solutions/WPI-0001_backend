import * as admin from 'firebase-admin';
import { loadBackendDotenv, resolveFirebasePrivateKey } from './firebase-env';

/**
 * Inicializa el SDK de Firebase Admin a partir de las variables de entorno.
 *
 * Carga ".env" si existe y exige FIREBASE_PRIVATE_KEY. El secreto puede llegar
 * como variable de proceso (secreto de runtime de Cloud Agent) o persistido
 * en ".env" por el script de arranque del entorno.
 */
loadBackendDotenv();

const firebasePrivateKey = resolveFirebasePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: firebasePrivateKey,
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
