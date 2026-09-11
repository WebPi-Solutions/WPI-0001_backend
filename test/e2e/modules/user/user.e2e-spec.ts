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
        userEnterprises: [{ enterpriseId: seed.enterpriseB.id }],
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
        userEnterprises: [{ enterpriseId: seed.enterpriseB.id }],
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

describe('Usuarios (e2e) — autenticación, validación y RBAC', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('todas las rutas de usuarios sin Bearer son 401', async () => {
    const seed = getE2eSeed();
    const list = await http().get('/users').query({ enterpriseId: seed.enterpriseA.id });
    expect(list.status).toBe(401);
    const create = await http()
      .post('/users')
      .query({ enterpriseId: seed.enterpriseA.id })
      .send({});
    expect(create.status).toBe(401);
    const myself = await http().get('/users/myself');
    expect(myself.status).toBe(401);
    const card = await http()
      .get('/users/card/1')
      .query({ enterpriseId: seed.enterpriseA.id });
    expect(card.status).toBe(401);
    const byEmail = await http().get(`/users/email/${E2E_EMAIL.userA}`);
    expect(byEmail.status).toBe(401);
    const byId = await http().get(`/users/${seed.userA.id}`);
    expect(byId.status).toBe(401);
    const patch = await http().patch(`/users/${seed.userA.id}`).send({ name: 'X' });
    expect(patch.status).toBe(401);
    const unlink = await http().delete(
      `/users/${seed.userA.id}/enterprise/${seed.enterpriseA.id}`,
    );
    expect(unlink.status).toBe(401);
  });

  it('token inválido o email desconocido son 401 o 403 en /users/myself', async () => {
    const invalid = await http()
      .get('/users/myself')
      .set(authHeader('invalid-token'));
    expect([401, 403]).toContain(invalid.status);
    const unknown = await http()
      .get('/users/myself')
      .set(authHeader(E2E_EMAIL.unknown));
    expect([401, 403]).toContain(unknown.status);
  });

  it('GET /users y GET /users/card/:cardId sin enterpriseId son 400', async () => {
    expect((await http().get('/users').set(authHeader(E2E_EMAIL.userA))).status).toBe(400);
    expect(
      (await http().get('/users/card/1').set(authHeader(E2E_EMAIL.userA))).status,
    ).toBe(400);
  });

  it('GET /users/card/:cardId con cardId inválido es 400 y con tarjeta inexistente es 404', async () => {
    const seed = getE2eSeed();
    const invalidCard = await http()
      .get('/users/card/abc')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(invalidCard.status).toBe(400);
    expect(invalidCard.body.message).toBe('cardId inválido');

    const zeroCard = await http()
      .get('/users/card/0')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(zeroCard.status).toBe(400);

    const missingCard = await http()
      .get('/users/card/99999')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(missingCard.status).toBe(404);
  });

  it('GET /users/card/1 de A es 200 para el Administrador', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/users/card/1')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(seed.userA.id);
  });

  it('POST /users sin enterpriseId es 400; cuerpo sin vínculo es 400', async () => {
    const missingQuery = await http()
      .post('/users')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        name: 'Sin query',
        email: 'sin-query@e2e.test',
        password: 'secret-password',
      });
    expect(missingQuery.status).toBe(400);

    const seed = getE2eSeed();
    const missingLink = await http()
      .post('/users')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        name: 'Sin vínculo',
        email: 'sin-vinculo@e2e.test',
        password: 'secret-password',
      });
    expect(missingLink.status).toBe(400);
    expect(missingLink.body.message).toBe(
      'El usuario debe estar vinculado a una única empresa.',
    );
  });

  it('el empleado no lista, no crea, no lee a otro, no edita ni desvincula (403 de permiso)', async () => {
    const seed = getE2eSeed();
    const list = await http()
      .get('/users')
      .query({ enterpriseId: seed.enterpriseA.id, relations: 'userEnterprises' })
      .set(authHeader(E2E_EMAIL.employeeA));
    expect(list.status).toBe(403);
    expect(list.body.message).toBe('No tiene permiso para realizar la acción users.read');

    const create = await http()
      .post('/users')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.employeeA))
      .send({
        name: 'Creado por empleado',
        email: 'creado-empleado@e2e.test',
        password: 'secret-password',
        userEnterprises: [{ enterpriseId: seed.enterpriseA.id }],
      });
    expect(create.status).toBe(403);
    expect(create.body.message).toBe('No tiene permiso para realizar la acción users.write');

    const byId = await http()
      .get(`/users/${seed.userA.id}`)
      .set(authHeader(E2E_EMAIL.employeeA));
    expect(byId.status).toBe(403);
    expect(byId.body.message).toBe('No tiene permiso para realizar la acción users.read');

    const byEmail = await http()
      .get(`/users/email/${E2E_EMAIL.userA}`)
      .set(authHeader(E2E_EMAIL.employeeA));
    expect(byEmail.status).toBe(403);

    const card = await http()
      .get('/users/card/1')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.employeeA));
    expect(card.status).toBe(403);

    const patchOther = await http()
      .patch(`/users/${seed.userA.id}`)
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.employeeA))
      .send({ name: 'Hackeado' });
    expect(patchOther.status).toBe(403);
    expect(patchOther.body.message).toBe(
      'No tiene permiso para realizar la acción users.write',
    );

    const patchSelf = await http()
      .patch(`/users/${seed.employeeA.id}`)
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.employeeA))
      .send({ name: 'Autoedición' });
    expect(patchSelf.status).toBe(403);

    const unlink = await http()
      .delete(`/users/${seed.userA.id}/enterprise/${seed.enterpriseA.id}`)
      .set(authHeader(E2E_EMAIL.employeeA));
    expect(unlink.status).toBe(403);
    expect(unlink.body.message).toBe(
      'No tiene permiso para realizar la acción users.delete',
    );
  });

  it('un usuario sin empresas no lista usuarios de A', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/users')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.outsider));
    expect(response.status).toBe(403);
  });

  it('GET /users de A es 200 y contiene a userA y al empleado', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/users')
      .query({ enterpriseId: seed.enterpriseA.id, relations: 'userEnterprises' })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    const ids = (response.body.items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining([seed.userA.id, seed.employeeA.id]));
    expect(ids).not.toContain(seed.userB.id);
  });

  it('desvincular un usuario de una empresa a la que no pertenece es 400', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .delete(`/users/${seed.userA.id}/enterprise/${seed.enterpriseB.id}`)
      .set(authHeader(E2E_EMAIL.admin));
    expect([400, 404]).toContain(response.status);
  });
});
