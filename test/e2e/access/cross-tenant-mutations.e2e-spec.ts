import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { expectIdorHidden, http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

/**
 * Mutaciones HTTP diseñadas para saltarse el aislamiento entre empresas
 * (FKs cruzadas, relocatar `enterpriseId`, escalada a admin global, filtros `$or`).
 */
describe('Aislamiento multi-empresa (e2e) — mutaciones cruzadas', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el usuario A no crea una factura con la serie de B aunque el cliente sea de A', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/invoices')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        clientId: seed.clientA.id,
        seriesId: seed.seriesB.id,
        name: 'Serie ajena',
        issuedDate: '2026-03-01',
        collectionDate: '2026-03-15',
        status: 'draft',
        concepts: [],
      });
    expectIdorHidden(response.status);
  });

  it('el usuario A no retargetea su factura al cliente de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .patch(`/invoices/${seed.invoiceA.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ clientId: seed.clientB.id });
    expectIdorHidden(response.status);
  });

  it('el usuario A no retargetea su factura a la serie de B vía relación anidada', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .patch(`/invoices/${seed.invoiceA.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ series: { id: seed.seriesB.id } });
    expectIdorHidden(response.status);
  });

  it('el usuario A no retargetea su presupuesto al cliente de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .patch(`/quotes/${seed.quoteA.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ clientId: seed.clientB.id });
    expectIdorHidden(response.status);
  });

  it('el usuario A no retargetea su gasto al proveedor de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .patch(`/spents/${seed.spentA.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ supplierId: seed.supplierB.id });
    expectIdorHidden(response.status);
  });

  it('el usuario A no mueve su cliente a la empresa B (query de A + cuerpo de B)', async () => {
    const seed = getE2eSeed();
    const blockedByGuard = await http()
      .patch(`/clients/${seed.clientA.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ enterpriseId: seed.enterpriseB.id });
    expect(blockedByGuard.status).toBe(403);

    const patchResponse = await http()
      .patch(`/clients/${seed.clientA.id}`)
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ enterpriseId: seed.enterpriseB.id, name: 'Cliente A' });
    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body.enterpriseId).toBe(seed.enterpriseA.id);

    const listOnB = await http()
      .get('/clients')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(listOnB.status).toBe(403);
  });

  it('el usuario A no mueve su proveedor ni su serie a la empresa B (query de A + cuerpo de B)', async () => {
    const seed = getE2eSeed();
    const supplierResponse = await http()
      .patch(`/suppliers/${seed.supplierA.id}`)
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ enterpriseId: seed.enterpriseB.id });
    expect(supplierResponse.status).toBe(200);
    expect(supplierResponse.body.enterpriseId).toBe(seed.enterpriseA.id);

    const seriesResponse = await http()
      .patch(`/invoice-series/${seed.seriesA.id}`)
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ enterpriseId: seed.enterpriseB.id, series: 'A' });
    expect(seriesResponse.status).toBe(200);
    expect(seriesResponse.body.enterpriseId).toBe(seed.enterpriseA.id);
  });

  it('el usuario A no se autoasigna el rol global de administrador', async () => {
    const seed = getE2eSeed();
    const patchResponse = await http()
      .patch(`/users/${seed.userA.id}`)
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ role: 'administrator' });
    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body.role).not.toBe('administrator');

    const foreignEnterprise = await http()
      .get(`/enterprises/${seed.enterpriseB.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(foreignEnterprise.status);
  });

  it('un filtro $or no lista facturas de B cuando la query es de A', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/invoices')
      .query({
        enterpriseId: seed.enterpriseA.id,
        filter: JSON.stringify({ $or: [{ id: seed.invoiceB.id }] }),
      })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    const ids = (response.body.items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).not.toContain(seed.invoiceB.id);
  });

  it('el administrador global sí opera sobre recursos de B', async () => {
    const seed = getE2eSeed();
    const invoice = await http()
      .get(`/invoices/${seed.invoiceB.id}`)
      .set(authHeader(E2E_EMAIL.admin));
    expect(invoice.status).toBe(200);
    const client = await http()
      .get(`/clients/${seed.clientB.id}`)
      .set(authHeader(E2E_EMAIL.admin));
    expect(client.status).toBe(200);
  });
});
