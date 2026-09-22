import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { expectIdorHidden, http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Facturas (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el usuario A no lista facturas de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/invoices')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('el usuario A lista facturas de A y no incluye las de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/invoices')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    const ids = (response.body.items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).toContain(seed.invoiceA.id);
    expect(ids).not.toContain(seed.invoiceB.id);
  });

  it('el usuario A lee su factura y no la de B (IDOR 404)', async () => {
    const seed = getE2eSeed();
    const own = await http().get(`/invoices/${seed.invoiceA.id}`).set(authHeader(E2E_EMAIL.userA));
    expect(own.status).toBe(200);
    const foreign = await http()
      .get(`/invoices/${seed.invoiceB.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(foreign.status);
  });

  it('el usuario A no crea una factura colgando del cliente de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/invoices')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        clientId: seed.clientB.id,
        seriesId: seed.seriesB.id,
        name: 'Intrusa',
        issuedDate: '2026-03-01',
        collectionDate: '2026-03-15',
        status: 'draft',
      });
    expectIdorHidden(response.status);
  });

  it('no registra una factura con una serie inactiva', async () => {
    const seed = getE2eSeed();
    const series = await http()
      .post('/invoice-series')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        enterpriseId: seed.enterpriseA.id,
        series: `E2E-INACTIVA-ALTA-${Date.now()}`,
        active: false,
      });
    expect(series.status).toBe(201);

    const response = await http()
      .post('/invoices')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        clientId: seed.clientA.id,
        seriesId: series.body.id,
        name: 'Factura con serie inactiva',
        issuedDate: '2026-03-01',
        collectionDate: '2026-03-15',
        status: 'draft',
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('No se puede usar una serie de factura inactiva');
  });

  it('no edita una factura cuando su serie se ha dado de baja', async () => {
    const seed = getE2eSeed();
    const series = await http()
      .post('/invoice-series')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        enterpriseId: seed.enterpriseA.id,
        series: `E2E-INACTIVA-EDICION-${Date.now()}`,
        active: true,
      });
    expect(series.status).toBe(201);

    const invoice = await http()
      .post('/invoices')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        clientId: seed.clientA.id,
        seriesId: series.body.id,
        name: 'Factura antes de baja',
        issuedDate: '2026-03-01',
        collectionDate: '2026-03-15',
        status: 'draft',
      });
    expect(invoice.status).toBe(201);

    const deactivate = await http()
      .patch(`/invoice-series/${series.body.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ active: false });
    expect(deactivate.status).toBe(200);

    const response = await http()
      .patch(`/invoices/${invoice.body.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ name: 'Factura editada tras la baja' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('No se puede usar una serie de factura inactiva');
  });

  it('el usuario A no actualiza ni borra la factura de B', async () => {
    const seed = getE2eSeed();
    const patchResponse = await http()
      .patch(`/invoices/${seed.invoiceB.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ name: 'Hackeada' });
    expectIdorHidden(patchResponse.status);
    const statusResponse = await http()
      .patch(`/invoices/${seed.invoiceB.id}/status`)
      .query({ status: 'issued' })
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(statusResponse.status);
    const deleteResponse = await http()
      .delete(`/invoices/${seed.invoiceB.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(deleteResponse.status);
  });

  it('el admin global sí lee la factura de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/invoices/${seed.invoiceB.id}`)
      .set(authHeader(E2E_EMAIL.admin));
    expect(response.status).toBe(200);
  });
});
