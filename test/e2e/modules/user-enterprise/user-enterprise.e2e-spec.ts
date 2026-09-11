import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Vínculos usuario-empresa (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el usuario A no consulta la tarjeta kiosco de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/user-enterprises/card/1')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('sin Bearer es 401; sin enterpriseId o cardId inválido es 400', async () => {
    const seed = getE2eSeed();
    expect(
      (await http().get('/user-enterprises/card/1').query({ enterpriseId: seed.enterpriseA.id }))
        .status,
    ).toBe(401);
    expect(
      (await http().get('/user-enterprises/card/1').set(authHeader(E2E_EMAIL.userA))).status,
    ).toBe(400);
    const invalidCard = await http()
      .get('/user-enterprises/card/abc')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(invalidCard.status).toBe(400);
  });

  it('el empleado no consulta la tarjeta kiosco de A (signings.read)', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/user-enterprises/card/1')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.employeeA));
    expect(response.status).toBe(403);
    expect(response.body.message).toBe(
      'No tiene permiso para realizar la acción signings.read',
    );
  });

  it('el Administrador de A resuelve la tarjeta 1', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/user-enterprises/card/1')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(seed.linkA.id);
  });

  it('tarjeta inexistente en A es 404', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/user-enterprises/card/99999')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(404);
  });
});
