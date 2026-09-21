/**
 * Variables de terceros para Jest (unitarios y e2e).
 * Pisan cualquier secreto real de `.env` o de CI: los tests no deben llamar
 * a Firebase, Stripe, Dropbox, OpenAI ni APIs equivalentes.
 *
 * dotenv no sobrescribe claves ya definidas, así que esto debe ejecutarse
 * en `setupFiles` (antes de importar módulos de producción).
 */

/**
 * Aplica credenciales ficticias y deja vacías las claves de SDKs perezosos.
 * Las rutas de Dropbox (plantillas, no secretos) no se tocan.
 * @returns {void}
 */
function applyTestThirdPartyEnvironment() {
  process.env.FIREBASE_TYPE = 'service_account';
  process.env.FIREBASE_PROJECT_ID = 'jest-test-project';
  process.env.FIREBASE_PRIVATE_KEY_ID = 'jest-test-key-id';
  process.env.FIREBASE_PRIVATE_KEY =
    '-----BEGIN PRIVATE KEY-----\\nTESTKEY\\n-----END PRIVATE KEY-----\\n';
  process.env.FIREBASE_CLIENT_EMAIL = 'firebase@jest.test';
  process.env.FIREBASE_CLIENT_ID = '0';
  process.env.FIREBASE_AUTH_URI = 'https://accounts.google.com/o/oauth2/auth';
  process.env.FIREBASE_TOKEN_URI = 'https://oauth2.googleapis.com/token';
  process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL =
    'https://www.googleapis.com/oauth2/v1/certs';
  process.env.FIREBASE_CLIENT_X509_CERT_URL =
    'https://www.googleapis.com/robot/v1/metadata/x509/firebase%40jest.test';
  process.env.FIREBASE_UNIVERSE_DOMAIN = 'googleapis.com';

  process.env.STRIPE_SECRET_KEY = '';
  process.env.OPENAI_API_KEY = '';
  process.env.OPENAI_ORG_ID = '';
  process.env.DROPBOX_REFRESH_TOKEN = '';
  process.env.DROPBOX_CLIENT_ID = '';
  process.env.DROPBOX_CLIENT_SECRET = '';
}

applyTestThirdPartyEnvironment();

module.exports = { applyTestThirdPartyEnvironment };
