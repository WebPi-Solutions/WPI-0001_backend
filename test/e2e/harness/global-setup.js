/**
 * Arranca un PostgreSQL efímero con Testcontainers antes de la suite e2e.
 * Requiere Docker. La conexión se escribe en `.postgres.json` para los workers de Jest.
 *
 * Se usa Testcontainers 11 (no 12): la v12 tira de undici 8 (`markAsUncloneable`)
 * y exige Node ≥ 22.22; CI y la imagen de producción siguen en Node 20.
 */
const { PostgreSqlContainer } = require('@testcontainers/postgresql');
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  try {
    const container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('wpi_e2e')
      .withUsername('wpi_e2e')
      .withPassword('wpi_e2e')
      .start();

    const connection = {
      host: container.getHost(),
      port: container.getPort(),
      username: container.getUsername(),
      password: container.getPassword(),
      database: container.getDatabase(),
    };

    fs.writeFileSync(
      path.join(__dirname, '.postgres.json'),
      JSON.stringify(connection),
    );
    globalThis.__E2E_POSTGRES_CONTAINER__ = container;
  } catch (error) {
    console.error(
      'No se pudo arrancar PostgreSQL con Testcontainers. Comprueba que Docker está en marcha.',
    );
    throw error;
  }
};
