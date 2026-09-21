/**
 * Carga la conexión del Postgres de Testcontainers en `process.env`
 * antes de importar AppModule (dotenv no pisa variables ya definidas).
 */
const fs = require('fs');
const path = require('path');

const connectionFilePath = path.join(__dirname, '.postgres.json');
if (!fs.existsSync(connectionFilePath)) {
  throw new Error(
    'Falta test/e2e/harness/.postgres.json. Ejecuta la suite con npm run test:e2e (globalSetup arranca Docker).',
  );
}

const connection = JSON.parse(fs.readFileSync(connectionFilePath, 'utf8'));

/** Marca el proceso como e2e para que AppModule no cargue `.env` de develop. */
process.env.E2E_TEST = 'true';
process.env.DATABASE_HOST = String(connection.host);
process.env.DATABASE_PORT = String(connection.port);
process.env.DATABASE_USERNAME = String(connection.username);
process.env.DATABASE_PASSWORD = String(connection.password);
process.env.DATABASE_NAME = String(connection.database);
process.env.TYPEORM_SYNCHRONIZE = 'true';
process.env.TYPEORM_LOGGING = 'false';
process.env.MAX_FILE_SIZE = process.env.MAX_FILE_SIZE || '10';

const { applyTestThirdPartyEnvironment } = require('../../jest-third-party-env');
applyTestThirdPartyEnvironment();
