import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Fichajes (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el usuario A no lista fichajes de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/signings')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('el usuario A no lee un fichaje de B aunque envíe enterpriseId de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/signings/${seed.signingB.id}`)
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('el usuario A no crea un fichaje en el vínculo de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/signings')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        userEnterpriseId: seed.linkB.id,
        action: 'start',
        moment: '2026-04-14T08:00:00.000Z',
      });
    expect(response.status).toBe(403);
  });

  it('el usuario A lee su fichaje y no muta el de B', async () => {
    const seed = getE2eSeed();
    const own = await http()
      .get(`/signings/${seed.signingA.id}`)
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(own.status).toBe(200);
    const patchForeign = await http()
      .patch(`/signings/${seed.signingB.id}`)
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ action: 'end' });
    expect(patchForeign.status).toBe(404);
    const deleteForeign = await http()
      .delete(`/signings/${seed.signingB.id}`)
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(deleteForeign.status).toBe(404);
  });
});
