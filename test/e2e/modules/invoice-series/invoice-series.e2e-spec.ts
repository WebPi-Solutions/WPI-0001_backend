import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { expectIdorHidden, http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Series de factura (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el usuario A no lista series de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/invoice-series')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('el usuario A lee su serie y no la de B', async () => {
    const seed = getE2eSeed();
    const own = await http()
      .get(`/invoice-series/${seed.seriesA.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect(own.status).toBe(200);
    const foreign = await http()
      .get(`/invoice-series/${seed.seriesB.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(foreign.status);
  });

  it('el usuario A no crea una serie en B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/invoice-series')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ series: 'Z', enterpriseId: seed.enterpriseB.id });
    expect(response.status).toBe(403);
  });

  it('el usuario A no actualiza ni borra la serie de B', async () => {
    const seed = getE2eSeed();
    expectIdorHidden(
      (
        await http()
          .patch(`/invoice-series/${seed.seriesB.id}`)
          .set(authHeader(E2E_EMAIL.userA))
          .send({ description: 'Hackeada' })
      ).status,
    );
    expectIdorHidden(
      (await http().delete(`/invoice-series/${seed.seriesB.id}`).set(authHeader(E2E_EMAIL.userA)))
        .status,
    );
  });
});
