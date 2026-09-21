import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { expectIdorHidden, http } from '@e2e/http';
import { deletePurchasedItemSerials, purchaseItemSerials } from '@e2e/inventory';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Números de serie de conceptos de factura (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el usuario A no lista series de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/invoice-concept-serials')
      .query({
        enterpriseId: seed.enterpriseB.id,
        invoiceConceptId: seed.invoiceConceptB.id,
      })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('el usuario A lista series de su concepto y no las de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/invoice-concept-serials')
      .query({
        enterpriseId: seed.enterpriseA.id,
        invoiceConceptId: seed.invoiceConceptA.id,
      })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    const ids = (response.body.items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).toContain(seed.invoiceConceptSerialA.id);
    expect(ids).not.toContain(seed.invoiceConceptSerialB.id);
  });

  it('el usuario A no lista series colgando del concepto de B aunque use su enterpriseId', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/invoice-concept-serials')
      .query({
        enterpriseId: seed.enterpriseA.id,
        invoiceConceptId: seed.invoiceConceptB.id,
      })
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(response.status);
  });

  it('el usuario A no lee el número de serie de B por UUID', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/invoice-concept-serials/${seed.invoiceConceptSerialB.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(response.status);
  });

  it('el usuario A no crea un número de serie en el concepto de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/invoice-concept-serials')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ invoiceConceptId: seed.invoiceConceptB.id, serialNumber: 'INTRUSO' });
    expectIdorHidden(response.status);
  });

  it('el usuario A sí lee su número de serie', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/invoice-concept-serials/${seed.invoiceConceptSerialA.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(seed.invoiceConceptSerialA.id);
  });

  it('el usuario A no actualiza ni borra el número de serie de B', async () => {
    const seed = getE2eSeed();
    expectIdorHidden(
      (
        await http()
          .patch(`/invoice-concept-serials/${seed.invoiceConceptSerialB.id}`)
          .set(authHeader(E2E_EMAIL.userA))
          .send({ serialNumber: 'HACK' })
      ).status,
    );
    expectIdorHidden(
      (
        await http()
          .delete(`/invoice-concept-serials/${seed.invoiceConceptSerialB.id}`)
          .set(authHeader(E2E_EMAIL.userA))
      ).status,
    );
  });

  it.each([
    {
      name: 'GET /invoice-concept-serials',
      method: 'get' as const,
      path: () => '/invoice-concept-serials',
      permission: 'invoices.read',
    },
    {
      name: 'POST /invoice-concept-serials',
      method: 'post' as const,
      path: () => '/invoice-concept-serials',
      permission: 'invoices.write',
      body: (seed: { invoiceConceptA: { id: string } }) => ({
        invoiceConceptId: seed.invoiceConceptA.id,
        serialNumber: 'EMPLEADO',
      }),
    },
    {
      name: 'GET /invoice-concept-serials/:id',
      method: 'get' as const,
      path: (seed: { invoiceConceptSerialA: { id: string } }) =>
        `/invoice-concept-serials/${seed.invoiceConceptSerialA.id}`,
      permission: 'invoices.read',
    },
    {
      name: 'PATCH /invoice-concept-serials/:id',
      method: 'patch' as const,
      path: (seed: { invoiceConceptSerialA: { id: string } }) =>
        `/invoice-concept-serials/${seed.invoiceConceptSerialA.id}`,
      permission: 'invoices.write',
      body: () => ({ serialNumber: 'HACK' }),
    },
    {
      name: 'DELETE /invoice-concept-serials/:id',
      method: 'delete' as const,
      path: (seed: { invoiceConceptSerialA: { id: string } }) =>
        `/invoice-concept-serials/${seed.invoiceConceptSerialA.id}`,
      permission: 'invoices.delete',
    },
  ])('$name es 403 para el empleado sin permiso $permission', async ({ method, path, permission, body }) => {
    const seed = getE2eSeed();
    let requestBuilder = http()
      [method](path(seed))
      .query({
        enterpriseId: seed.enterpriseA.id,
        invoiceConceptId: seed.invoiceConceptA.id,
      })
      .set(authHeader(E2E_EMAIL.employeeA));
    if (body && (method === 'post' || method === 'patch')) {
      requestBuilder = requestBuilder.send(body(seed));
    }
    const response = await requestBuilder;
    expect(response.status).toBe(403);
    expect(response.body.message).toBe(`No tiene permiso para realizar la acción ${permission}`);
  });
});

describe('Números de serie de conceptos de factura (e2e) — reglas de negocio', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  /**
   * Crea una factura en borrador de la empresa A.
   * @returns Identificador de la factura
   */
  async function createDraftInvoice(): Promise<string> {
    const seed = getE2eSeed();
    const invoice = await http()
      .post('/invoices')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        clientId: seed.clientA.id,
        seriesId: seed.seriesA.id,
        name: 'Factura de reglas de serie',
        issuedDate: '2026-06-01',
        collectionDate: '2026-06-15',
        status: 'draft',
      });
    expect(invoice.status).toBe(201);
    return invoice.body.id as string;
  }

  it('un PATCH no mueve el número de serie a otro concepto', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .patch(`/invoice-concept-serials/${seed.invoiceConceptSerialA.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ invoiceConceptId: seed.invoiceConceptB.id });
    expect(response.status).toBe(200);
    expect(response.body.invoiceConceptId).toBe(seed.invoiceConceptA.id);
  });

  it('rechaza vender un número de serie que no está en stock', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/invoice-concept-serials')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        invoiceConceptId: seed.invoiceConceptA.id,
        serialNumber: seed.invoiceConceptSerialA.serialNumber,
      });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('El número de serie no está disponible en stock');
  });

  it('no asigna series a un concepto manual ni a un artículo sin número de serie', async () => {
    const seed = getE2eSeed();
    const invoiceId = await createDraftInvoice();
    const itemWithoutSerial = await http()
      .post('/items')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        name: 'Sin serie',
        itemCategoryId: seed.itemCategoryA.id,
        serialNumber: false,
        pricePvp: 5,
      });
    expect(itemWithoutSerial.status).toBe(201);

    const manualConcept = await http()
      .post('/invoice-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ invoiceId, name: 'Hora manual', quantity: 2 });
    expect(manualConcept.status).toBe(201);
    const serialOnManual = await http()
      .post('/invoice-concept-serials')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        invoiceConceptId: manualConcept.body.id,
        serialNumber: 'SN-MANUAL',
      });
    expect(serialOnManual.status).toBe(400);
    expect(serialOnManual.body.message).toBe(
      'Solo se pueden asignar números de serie a conceptos vinculados a un artículo que se gestiona con número de serie',
    );

    const conceptWithoutSerialItem = await http()
      .post('/invoice-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        invoiceId,
        itemId: itemWithoutSerial.body.id,
        quantity: 2,
      });
    expect(conceptWithoutSerialItem.status).toBe(201);
    const serialOnItem = await http()
      .post('/invoice-concept-serials')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        invoiceConceptId: conceptWithoutSerialItem.body.id,
        serialNumber: 'SN-NOSERIAL',
      });
    expect(serialOnItem.status).toBe(400);

    await http()
      .delete(`/invoice-concepts/${manualConcept.body.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    await http()
      .delete(`/invoice-concepts/${conceptWithoutSerialItem.body.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    await http().delete(`/invoices/${invoiceId}`).set(authHeader(E2E_EMAIL.userA));
    await http()
      .delete(`/items/${itemWithoutSerial.body.id}`)
      .set(authHeader(E2E_EMAIL.userA));
  });

  it('no crea más series que la cantidad del concepto', async () => {
    const seed = getE2eSeed();
    const invoiceId = await createDraftInvoice();
    const serialTrackedItem = await http()
      .post('/items')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        name: 'Con serie',
        itemCategoryId: seed.itemCategoryA.id,
        serialNumber: true,
        stock: true,
        pricePvp: 8,
      });
    expect(serialTrackedItem.status).toBe(201);
    const purchased = await purchaseItemSerials(serialTrackedItem.body.id, ['SN-CAP-1']);
    const concept = await http()
      .post('/invoice-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        invoiceId,
        itemId: serialTrackedItem.body.id,
        quantity: 1,
      });
    expect(concept.status).toBe(201);
    const firstSerial = await http()
      .post('/invoice-concept-serials')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        invoiceConceptId: concept.body.id,
        serialNumber: 'SN-CAP-1',
      });
    expect(firstSerial.status).toBe(201);
    const extraSerial = await http()
      .post('/invoice-concept-serials')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        invoiceConceptId: concept.body.id,
        serialNumber: 'SN-CAP-2',
      });
    expect(extraSerial.status).toBe(400);
    expect(extraSerial.body.message).toBe(
      'El número de series no puede superar la cantidad del concepto',
    );

    await http()
      .delete(`/invoice-concept-serials/${firstSerial.body.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    await http()
      .delete(`/invoice-concepts/${concept.body.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    await http().delete(`/invoices/${invoiceId}`).set(authHeader(E2E_EMAIL.userA));
    await deletePurchasedItemSerials(purchased);
    await http()
      .delete(`/items/${serialTrackedItem.body.id}`)
      .set(authHeader(E2E_EMAIL.userA));
  });

  it('no muta series de una factura emitida', async () => {
    const seed = getE2eSeed();
    const invoiceId = await createDraftInvoice();
    const serialTrackedItem = await http()
      .post('/items')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        name: 'Serie emitida',
        itemCategoryId: seed.itemCategoryA.id,
        serialNumber: true,
        stock: true,
        pricePvp: 8,
      });
    expect(serialTrackedItem.status).toBe(201);
    const purchased = await purchaseItemSerials(serialTrackedItem.body.id, ['SN-ISSUED-1']);
    const concept = await http()
      .post('/invoice-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        invoiceId,
        itemId: serialTrackedItem.body.id,
        quantity: 1,
      });
    expect(concept.status).toBe(201);
    const createdSerial = await http()
      .post('/invoice-concept-serials')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        invoiceConceptId: concept.body.id,
        serialNumber: 'SN-ISSUED-1',
      });
    expect(createdSerial.status).toBe(201);

    const issued = await http()
      .patch(`/invoices/${invoiceId}/status`)
      .query({ status: 'issued' })
      .set(authHeader(E2E_EMAIL.userA));
    expect(issued.status).toBe(200);

    const patched = await http()
      .patch(`/invoice-concept-serials/${createdSerial.body.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ serialNumber: 'SN-ISSUED-2' });
    expect(patched.status).toBe(400);
    expect(patched.body.message).toBe(
      'No se pueden modificar los números de serie de una factura ya emitida',
    );
    const deleted = await http()
      .delete(`/invoice-concept-serials/${createdSerial.body.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect(deleted.status).toBe(400);
    const extra = await http()
      .post('/invoice-concept-serials')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        invoiceConceptId: concept.body.id,
        serialNumber: 'SN-ISSUED-EXTRA',
      });
    expect(extra.status).toBe(400);
  });
});
