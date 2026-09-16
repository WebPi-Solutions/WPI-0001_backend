import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { expectIdorHidden, http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Conceptos de factura (e2e) — control de acceso', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('el usuario A no lista conceptos de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/invoice-concepts')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(403);
  });

  it('el usuario A lista conceptos de A y no ve los de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get('/invoice-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    const ids = (response.body.items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).toContain(seed.invoiceConceptA.id);
    expect(ids).not.toContain(seed.invoiceConceptB.id);
  });

  it('el usuario A no lee el concepto de B por UUID', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/invoice-concepts/${seed.invoiceConceptB.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expectIdorHidden(response.status);
  });

  it('el usuario A no crea un concepto en la factura de B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/invoice-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ invoiceId: seed.invoiceB.id, name: 'Intruso' });
    expectIdorHidden(response.status);
  });

  it('el usuario A no crea conceptos en la empresa B', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/invoice-concepts')
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ invoiceId: seed.invoiceB.id, name: 'Intruso' });
    expect(response.status).toBe(403);
  });

  it('el usuario A sí lee su concepto', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/invoice-concepts/${seed.invoiceConceptA.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(seed.invoiceConceptA.id);
  });

  it('el usuario A no actualiza ni borra el concepto de B', async () => {
    const seed = getE2eSeed();
    expectIdorHidden(
      (
        await http()
          .patch(`/invoice-concepts/${seed.invoiceConceptB.id}`)
          .set(authHeader(E2E_EMAIL.userA))
          .send({ name: 'Hackeado' })
      ).status,
    );
    expectIdorHidden(
      (
        await http()
          .delete(`/invoice-concepts/${seed.invoiceConceptB.id}`)
          .set(authHeader(E2E_EMAIL.userA))
      ).status,
    );
  });

  it('un PATCH no mueve el concepto a una factura de otra empresa', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .patch(`/invoice-concepts/${seed.invoiceConceptA.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ invoiceId: seed.invoiceB.id });
    expect(response.status).toBe(200);
    expect(response.body.invoiceId).toBe(seed.invoiceA.id);
  });

  it.each([
    {
      name: 'GET /invoice-concepts',
      method: 'get' as const,
      path: () => '/invoice-concepts',
      permission: 'invoices.read',
    },
    {
      name: 'POST /invoice-concepts',
      method: 'post' as const,
      path: () => '/invoice-concepts',
      permission: 'invoices.write',
      body: (seed: { invoiceA: { id: string } }) => ({
        invoiceId: seed.invoiceA.id,
        name: 'Intruso empleado',
      }),
    },
    {
      name: 'GET /invoice-concepts/:id',
      method: 'get' as const,
      path: (seed: { invoiceConceptA: { id: string } }) =>
        `/invoice-concepts/${seed.invoiceConceptA.id}`,
      permission: 'invoices.read',
    },
    {
      name: 'PATCH /invoice-concepts/:id',
      method: 'patch' as const,
      path: (seed: { invoiceConceptA: { id: string } }) =>
        `/invoice-concepts/${seed.invoiceConceptA.id}`,
      permission: 'invoices.write',
      body: () => ({ name: 'Hackeado' }),
    },
    {
      name: 'DELETE /invoice-concepts/:id',
      method: 'delete' as const,
      path: (seed: { invoiceConceptA: { id: string } }) =>
        `/invoice-concepts/${seed.invoiceConceptA.id}`,
      permission: 'invoices.delete',
    },
  ])('$name es 403 para el empleado sin permiso $permission', async ({ method, path, permission, body }) => {
    const seed = getE2eSeed();
    let requestBuilder = http()
      [method](path(seed))
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.employeeA));
    if (body && (method === 'post' || method === 'patch')) {
      requestBuilder = requestBuilder.send(body(seed));
    }
    const response = await requestBuilder;
    expect(response.status).toBe(403);
    expect(response.body.message).toBe(`No tiene permiso para realizar la acción ${permission}`);
  });

  it('un usuario sin empresas no lista ni crea conceptos de A', async () => {
    const seed = getE2eSeed();
    const listed = await http()
      .get('/invoice-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.outsider));
    expect(listed.status).toBe(403);
    const created = await http()
      .post('/invoice-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.outsider))
      .send({ invoiceId: seed.invoiceA.id, name: 'Intruso externo' });
    expect(created.status).toBe(403);
  });

  it('un usuario sin empresas no lee ni muta el concepto de A por UUID (IDOR 404)', async () => {
    const seed = getE2eSeed();
    const conceptPath = `/invoice-concepts/${seed.invoiceConceptA.id}`;
    expectIdorHidden((await http().get(conceptPath).set(authHeader(E2E_EMAIL.outsider))).status);
    expectIdorHidden(
      (await http().patch(conceptPath).set(authHeader(E2E_EMAIL.outsider)).send({ name: 'Hackeado' }))
        .status,
    );
    expectIdorHidden((await http().delete(conceptPath).set(authHeader(E2E_EMAIL.outsider))).status);
  });
});

describe('Conceptos de factura (e2e) — reglas de negocio', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  /**
   * Crea una factura en borrador de la empresa A.
   * @returns Identificador de la factura creada
   */
  async function createDraftInvoice(): Promise<string> {
    const seed = getE2eSeed();
    const invoice = await http()
      .post('/invoices')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        clientId: seed.clientA.id,
        seriesId: seed.seriesA.id,
        name: 'Factura de reglas de concepto',
        issuedDate: '2026-06-01',
        collectionDate: '2026-06-15',
        status: 'draft',
      });
    expect(invoice.status).toBe(201);
    return invoice.body.id as string;
  }

  /**
   * Crea un artículo con o sin gestión de número de serie.
   * @param serialNumber - Si el artículo admite series
   * @returns Identificador del artículo
   */
  async function createItem(serialNumber: boolean): Promise<string> {
    const seed = getE2eSeed();
    const item = await http()
      .post('/items')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        name: serialNumber ? 'Artículo con serie' : 'Artículo sin serie',
        itemCategoryId: seed.itemCategoryA.id,
        serialNumber,
        stock: serialNumber,
        pricePvp: 12,
      });
    expect(item.status).toBe(201);
    return item.body.id as string;
  }

  it('GET de factura incluye conceptos y sus números de serie', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .get(`/invoices/${seed.invoiceA.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect(response.status).toBe(200);
    const invoiceConcepts = response.body.invoiceConcepts as Array<{
      id: string;
      serials?: Array<{ id: string; serialNumber: string }>;
    }>;
    expect(invoiceConcepts.some((concept) => concept.id === seed.invoiceConceptA.id)).toBe(true);
    const seededConcept = invoiceConcepts.find(
      (concept) => concept.id === seed.invoiceConceptA.id,
    );
    expect(seededConcept?.serials?.some((serial) => serial.id === seed.invoiceConceptSerialA.id))
      .toBe(true);
  });

  it('no crea un concepto con un artículo de otra empresa (IDOR 404)', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/invoice-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        invoiceId: seed.invoiceA.id,
        itemId: seed.itemB.id,
      });
    expectIdorHidden(response.status);
  });

  it('rechaza una posición duplicada con 409', async () => {
    const seed = getE2eSeed();
    const response = await http()
      .post('/invoice-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        invoiceId: seed.invoiceA.id,
        name: 'Posición ocupada',
        position: 0,
      });
    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Ya existe un concepto en esa posición de la factura');
  });

  it('no muta conceptos de una factura emitida', async () => {
    const seed = getE2eSeed();
    const invoiceId = await createDraftInvoice();
    const createdConcept = await http()
      .post('/invoice-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ invoiceId, name: 'Línea emitida' });
    expect(createdConcept.status).toBe(201);

    const issued = await http()
      .patch(`/invoices/${invoiceId}/status`)
      .query({ status: 'issued' })
      .set(authHeader(E2E_EMAIL.userA));
    expect(issued.status).toBe(200);

    const conceptPath = `/invoice-concepts/${createdConcept.body.id}`;
    const patched = await http()
      .patch(conceptPath)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ name: 'No debe cambiar' });
    expect(patched.status).toBe(400);
    expect(patched.body.message).toBe(
      'No se pueden modificar los conceptos de una factura ya emitida',
    );
    const deleted = await http().delete(conceptPath).set(authHeader(E2E_EMAIL.userA));
    expect(deleted.status).toBe(400);
    const extraConcept = await http()
      .post('/invoice-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ invoiceId, name: 'Extra' });
    expect(extraConcept.status).toBe(400);
  });

  it('no desvincula el artículo ni baja la cantidad por debajo de las series', async () => {
    const seed = getE2eSeed();
    const invoiceId = await createDraftInvoice();
    const serialTrackedItemId = await createItem(true);
    const itemWithoutSerialId = await createItem(false);
    const createdConcept = await http()
      .post('/invoice-concepts')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        invoiceId,
        itemId: serialTrackedItemId,
        quantity: 2,
      });
    expect(createdConcept.status).toBe(201);
    const createdSerial = await http()
      .post('/invoice-concept-serials')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        invoiceConceptId: createdConcept.body.id,
        serialNumber: 'SN-QTY-1',
      });
    expect(createdSerial.status).toBe(201);

    const reducedQuantity = await http()
      .patch(`/invoice-concepts/${createdConcept.body.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ quantity: 0 });
    expect(reducedQuantity.status).toBe(400);
    expect(reducedQuantity.body.message).toBe(
      'La cantidad no puede ser menor que el número de series asignadas',
    );

    const unlinked = await http()
      .patch(`/invoice-concepts/${createdConcept.body.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ itemId: null });
    expect(unlinked.status).toBe(400);
    expect(unlinked.body.message).toBe(
      'No se puede quitar el artículo con número de serie mientras el concepto tenga series asignadas',
    );

    const switched = await http()
      .patch(`/invoice-concepts/${createdConcept.body.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ itemId: itemWithoutSerialId });
    expect(switched.status).toBe(400);

    expect(
      (
        await http()
          .delete(`/invoice-concept-serials/${createdSerial.body.id}`)
          .set(authHeader(E2E_EMAIL.userA))
      ).status,
    ).toBe(200);
    expect(
      (
        await http()
          .delete(`/invoice-concepts/${createdConcept.body.id}`)
          .set(authHeader(E2E_EMAIL.userA))
      ).status,
    ).toBe(200);
    expect(
      (await http().delete(`/invoices/${invoiceId}`).set(authHeader(E2E_EMAIL.userA))).status,
    ).toBe(200);
    expect(
      (
        await http()
          .delete(`/items/${serialTrackedItemId}`)
          .set(authHeader(E2E_EMAIL.userA))
      ).status,
    ).toBe(200);
    expect(
      (
        await http().delete(`/items/${itemWithoutSerialId}`).set(authHeader(E2E_EMAIL.userA))
      ).status,
    ).toBe(200);
  });
});
