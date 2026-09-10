import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { expectIdorHidden, http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Usuarios (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el usuario A no lista usuarios de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/users')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('el usuario A no lee el perfil de B por id ni por email', async () => {
    const seed = getE2eSeed();
    expectIdorHidden(
      (await http().get(`/users/${seed.userB.id}`).set(authHeader(E2E_EMAIL.userA))).status,
    );
    expectIdorHidden(
      (await http().get(`/users/email/${E2E_EMAIL.userB}`).set(authHeader(E2E_EMAIL.userA))).status,
    );
  });

  it('el token de A corresponde al usuario y la empresa sembrados', async () => {
    const seed = getE2eSeed();
    const myself = await http().get('/users/myself').set(authHeader(E2E_EMAIL.userA));
    expect(myself.status).toBe(200);
    expect(myself.body.id).toBe(seed.userA.id);
    const enterpriseIds = (
      (myself.body.userEnterprises as Array<{ enterpriseId: string }>) ?? []
    ).map((link) => link.enterpriseId);
    expect(enterpriseIds).toContain(seed.enterpriseA.id);
  });

  it('el usuario A sí lee su propio perfil por id', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/users/${seed.userA.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
  });

  it('el admin global puede leer el perfil de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/users/${seed.userB.id}`)
      .set(authHeader(E2E_EMAIL.admin));
    expect(response.status).toBe(200);
  });

  it('el usuario A no crea un usuario vinculado a B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/users')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        name: 'Intruso',
        email: 'intruso@e2e.test',
        password: 'secret-password',
        userEnterprises: [{ enterpriseId: seed.enterpriseB.id, role: 'user' }],
      });
    expect(response.status).toBe(403);
  });

  it('no permite enterpriseId de A en query y vinculación a B en el cuerpo', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/users')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        name: 'Intruso query',
        email: 'intruso-query@e2e.test',
        password: 'secret-password',
        userEnterprises: [{ enterpriseId: seed.enterpriseB.id, role: 'user' }],
      });
    expect(response.status).toBe(403);
  });

  it('el usuario A no consulta la tarjeta de B', async () => {
    const seed = getE2eSeed();
    const usersCard = await http()
      .get('/users/card/1')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(usersCard.status).toBe(403);
  });

  it('el usuario A no desvincula a B de su empresa', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .delete(`/users/${seed.userB.id}/enterprise/${seed.enterpriseB.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect([403, 404]).toContain(response.status);
  });

  it('el usuario A no actualiza el perfil de B', async () => {
    const seed = getE2eSeed();
    expectIdorHidden(
      (
        await http()
          .patch(`/users/${seed.userB.id}`)
          .set(authHeader(E2E_EMAIL.userA))
          .send({ name: 'Hackeado' })
      ).status,
    );
  });
});
