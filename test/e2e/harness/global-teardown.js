/**
 * Detiene el contenedor de PostgreSQL al terminar la suite e2e.
 */
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  const container = globalThis.__E2E_POSTGRES_CONTAINER__;
  if (container) {
    await container.stop();
  }
  const connectionFilePath = path.join(__dirname, '.postgres.json');
  if (fs.existsSync(connectionFilePath)) {
    fs.unlinkSync(connectionFilePath);
  }
};
