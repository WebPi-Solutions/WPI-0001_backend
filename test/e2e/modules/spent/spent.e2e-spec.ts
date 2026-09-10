import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { expectIdorHidden, http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Gastos (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el usuario A no lista gastos de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/spents')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('el usuario A no lee el gasto de B por UUID', async () => {
    const seed = getE2eSeed();
    const response = await http().get(`/spents/${seed.spentB.id}`).set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(response.status);
  });

  it('el usuario A no crea un gasto del proveedor de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/spents')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        supplierId: seed.supplierB.id,
        name: 'Intruso',
        issuedDate: '2026-03-01',
        collectionDate: '2026-03-15',
        declarationDate: '2026-03-01',
        status: 'paid',
        concepts: [],
      });
    expectIdorHidden(response.status);
  });

  it('el usuario A no descarga ni borra el fichero del gasto de B', async () => {
    const seed = getE2eSeed();
    const download = await http()
      .get(`/spents/${seed.spentB.id}/file/download`)
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(download.status);
    const removeFile = await http()
      .delete(`/spents/${seed.spentB.id}/file`)
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(removeFile.status);
  });

  it('el usuario A no lanza IA de gastos sobre la empresa B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/spents/ai/file')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA))
      .attach('file', Buffer.from('%PDF-1.4 e2e'), 'gasto.pdf');
    expect(response.status).toBe(403);
  });

  it('el usuario A sí lee su gasto', async () => {
    const seed = getE2eSeed();
    const response = await http().get(`/spents/${seed.spentA.id}`).set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
  });

  it('el usuario A no actualiza ni borra el gasto de B', async () => {
    const seed = getE2eSeed();
    expectIdorHidden(
      (
        await http()
          .patch(`/spents/${seed.spentB.id}`)
          .set(authHeader(E2E_EMAIL.userA))
          .send({ name: 'Hackeado' })
      ).status,
    );
    expectIdorHidden(
      (await http().delete(`/spents/${seed.spentB.id}`).set(authHeader(E2E_EMAIL.userA))).status,
    );
  });
});
