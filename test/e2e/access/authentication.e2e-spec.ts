import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { expectAuthRejected, http } from '@e2e/http';
import { startE2eWorld } from '@e2e/world';

describe('Health y autenticación (e2e)', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('GET / es público y no exige Bearer', async () => {
    const response = await http().get('/');
    expect(response.status).toBe(200);
    expect(response.text).toBe('Hello World!');
  });

  it('rechaza una ruta de API sin Authorization', async () => {
    const response = await http().get('/clients').query({ enterpriseId: 'x' });
    expect(response.status).toBe(401);
  });

  it('rechaza un Bearer mal formado', async () => {
    const response = await http()
      .get('/users/myself')
      .set({ Authorization: 'Token abc' });
    expect(response.status).toBe(401);
  });

  it('rechaza un token Firebase inválido', async () => {
    const response = await http()
      .get('/users/myself')
      .set(authHeader('invalid-token'));
    expectAuthRejected(response.status);
  });

  it('rechaza un token válido cuyo email no está en users', async () => {
    const response = await http()
      .get('/users/myself')
      .set(authHeader(E2E_EMAIL.unknown));
    expectAuthRejected(response.status);
  });

  it('GET /users/myself devuelve el usuario autenticado sin enterpriseId', async () => {
    const response = await http().get('/users/myself').set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    expect(response.body.email).toBe(E2E_EMAIL.userA);
  });
});
