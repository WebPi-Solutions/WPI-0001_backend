import { randomUUID } from 'crypto';
import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { expectIdorHidden, http } from '@e2e/http';
import { getE2eSeed, startE2eWorld } from '@e2e/world';

describe('Ciclo de vida HTTP (e2e) — CRUD propio, filtros y reglas de negocio', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('festivos: listado con filtros, alta, lectura, parche vacío, actualización y borrado', async () => {
    const seed = getE2eSeed();
    const list = await http()
      .get('/holidays')
      .query({
        enterpriseId: seed.enterpriseA.id,
        page: 1,
        pageSize: 20,
        sort: 'calendarDate',
        order: 'DESC',
        relations: 'enterprise',
        filter: JSON.stringify({ name_ilike: 'festivo' }),
      })
      .set(authHeader(E2E_EMAIL.userA));
    expect(list.status).toBe(200);
    expect(list.body.items.some((item: { id: string }) => item.id === seed.holidayA.id)).toBe(true);

    const invalidFilter = await http()
      .get('/holidays')
      .query({ enterpriseId: seed.enterpriseA.id, filter: '{no-json' })
      .set(authHeader(E2E_EMAIL.userA));
    expect(invalidFilter.status).toBe(200);

    const missingId = await http()
      .get(`/holidays/${seed.holidayA.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect(missingId.status).toBe(400);

    const created = await http()
      .post('/holidays')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ calendarDate: '2026-08-15', name: 'Asunción', calendarColor: '#112233' });
    expect(created.status).toBe(201);
    const createdId = created.body.id as string;

    const emptyPatch = await http()
      .patch(`/holidays/${createdId}`)
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({});
    expect(emptyPatch.status).toBe(200);

    const patched = await http()
      .patch(`/holidays/${createdId}`)
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ name: 'Asunción E2E', calendarDate: '2026-08-16', calendarColor: '#445566' });
    expect(patched.status).toBe(200);
    expect(patched.body.name).toBe('Asunción E2E');

    const removed = await http()
      .delete(`/holidays/${createdId}`)
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(removed.status).toBe(200);
  });

  it('plantillas de horario: CRUD propio y 400 sin enterpriseId', async () => {
    const seed = getE2eSeed();
    expect(
      (await http().get('/default-schedules').set(authHeader(E2E_EMAIL.userA))).status,
    ).toBe(400);

    const created = await http()
      .post('/default-schedules')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        name: 'Plantilla e2e',
        description: 'desc',
        schedule: { weekdays: { mon: [{ start: '09:00', end: '17:00' }] } },
      });
    expect(created.status).toBe(201);
    const createdId = created.body.id as string;

    const own = await http()
      .get(`/default-schedules/${createdId}`)
      .query({ enterpriseId: seed.enterpriseA.id, relations: 'enterprise' })
      .set(authHeader(E2E_EMAIL.userA));
    expect(own.status).toBe(200);

    const patched = await http()
      .patch(`/default-schedules/${createdId}`)
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ name: 'Plantilla e2e 2', description: 'otra' });
    expect(patched.status).toBe(200);

    const removed = await http()
      .delete(`/default-schedules/${createdId}`)
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(removed.status).toBe(200);
  });

  it('clientes: listado con relaciones, NIF duplicado, actualización, 404 y borrado bloqueado por recurrente', async () => {
    const seed = getE2eSeed();
    const listed = await http()
      .get('/clients')
      .query({
        enterpriseId: seed.enterpriseA.id,
        relations: 'enterprise',
        sort: 'name',
        order: 'DESC',
        page: 1,
        pageSize: 50,
        filter: JSON.stringify({ name_ilike: 'cliente', $or: [{ nif: seed.clientA.nif }] }),
      })
      .set(authHeader(E2E_EMAIL.userA));
    expect(listed.status).toBe(200);

    const duplicate = await http()
      .post('/clients')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ name: 'Dup', nif: seed.clientA.nif });
    expect(duplicate.status).toBe(409);

    const created = await http()
      .post('/clients')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ name: 'Cliente temporal', nif: 'C44444444', type: 'company', email: 'tmp@e2e.test' });
    expect(created.status).toBe(201);
    const createdId = created.body.id as string;

    const withRelations = await http()
      .get(`/clients/${createdId}`)
      .query({ relations: 'enterprise' })
      .set(authHeader(E2E_EMAIL.userA));
    expect(withRelations.status).toBe(200);

    const patched = await http()
      .patch(`/clients/${createdId}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ name: 'Cliente temporal 2', phone: '600000000' });
    expect(patched.status).toBe(200);

    expect(
      (await http().get(`/clients/${randomUUID()}`).set(authHeader(E2E_EMAIL.userA))).status,
    ).toBe(404);

    const blocked = await http()
      .delete(`/clients/${seed.clientA.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect(blocked.status).toBe(400);

    const removed = await http().delete(`/clients/${createdId}`).set(authHeader(E2E_EMAIL.userA));
    expect(removed.status).toBe(200);
  });

  it('proveedores, series, facturas, presupuestos y gastos: alta propia y mutación', async () => {
    const seed = getE2eSeed();

    const supplier = await http()
      .post('/suppliers')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ name: 'Proveedor tmp', nif: 'P33333333' });
    expect(supplier.status).toBe(201);
    expect(
      (
        await http()
          .patch(`/suppliers/${supplier.body.id}`)
          .set(authHeader(E2E_EMAIL.userA))
          .send({ name: 'Proveedor tmp 2' })
      ).status,
    ).toBe(200);

    const series = await http()
      .post('/invoice-series')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ series: 'E2E', enterpriseId: seed.enterpriseA.id, description: 'tmp' });
    expect(series.status).toBe(201);
    expect(
      (
        await http()
          .patch(`/invoice-series/${series.body.id}`)
          .set(authHeader(E2E_EMAIL.userA))
          .send({ description: 'tmp 2' })
      ).status,
    ).toBe(200);

    const invoice = await http()
      .post('/invoices')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        clientId: seed.clientA.id,
        seriesId: seed.seriesA.id,
        name: 'Factura tmp',
        issuedDate: '2026-05-01',
        collectionDate: '2026-05-15',
        status: 'draft',
        concepts: [{ name: 'Hora', base_price: 10, vat: 21, irpf: 0, quantity: 1, supplied: true }],
      });
    expect(invoice.status).toBe(201);
    expect(
      (
        await http()
          .get('/invoices')
          .query({
            enterpriseId: seed.enterpriseA.id,
            relations: 'client,series',
            filter: JSON.stringify({ status: 'draft', 'client.id': seed.clientA.id }),
          })
          .set(authHeader(E2E_EMAIL.userA))
      ).status,
    ).toBe(200);
    expect(
      (
        await http()
          .patch(`/invoices/${invoice.body.id}`)
          .set(authHeader(E2E_EMAIL.userA))
          .send({ name: 'Factura tmp 2' })
      ).status,
    ).toBe(200);

    const quote = await http()
      .post('/quotes')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        clientId: seed.clientA.id,
        name: 'Presupuesto tmp',
        issuedDate: '2026-05-01',
        formalizationDate: '2026-05-20',
        status: 'draft',
        concepts: [],
      });
    expect(quote.status).toBe(201);
    expect(
      (
        await http()
          .patch(`/quotes/${quote.body.id}`)
          .set(authHeader(E2E_EMAIL.userA))
          .send({ name: 'Presupuesto tmp 2' })
      ).status,
    ).toBe(200);

    const spent = await http()
      .post('/spents')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        supplierId: seed.supplierA.id,
        name: 'Gasto tmp',
        issuedDate: '2026-05-01',
        collectionDate: '2026-05-15',
        declarationDate: '2026-05-01',
        status: 'paid',
        concepts: [],
      });
    expect(spent.status).toBe(201);
    expect(
      (
        await http()
          .patch(`/spents/${spent.body.id}`)
          .set(authHeader(E2E_EMAIL.userA))
          .send({ name: 'Gasto tmp 2' })
      ).status,
    ).toBe(200);
    expect((await http().delete(`/spents/${spent.body.id}`).set(authHeader(E2E_EMAIL.userA))).status).toBe(
      200,
    );

    expect((await http().delete(`/quotes/${quote.body.id}`).set(authHeader(E2E_EMAIL.userA))).status).toBe(
      200,
    );
    expect(
      (await http().delete(`/invoices/${invoice.body.id}`).set(authHeader(E2E_EMAIL.userA))).status,
    ).toBe(200);
    expect(
      (await http().delete(`/invoice-series/${series.body.id}`).set(authHeader(E2E_EMAIL.userA))).status,
    ).toBe(200);
    expect(
      (await http().delete(`/suppliers/${supplier.body.id}`).set(authHeader(E2E_EMAIL.userA))).status,
    ).toBe(200);
  });

  it('ingresos recurrentes, IA, fichajes, vacaciones y horarios propios', async () => {
    const seed = getE2eSeed();
    const recurrent = await http()
      .post('/recurrent-earnings')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        invoiceSerieId: seed.seriesA.id,
        clientId: seed.clientA.id,
        type: 'monthly',
        name: 'Cuota tmp',
        concepts: [],
      });
    expect(recurrent.status).toBe(201);
    expect(
      (
        await http()
          .patch(`/recurrent-earnings/${recurrent.body.id}`)
          .set(authHeader(E2E_EMAIL.userA))
          .send({ name: 'Cuota tmp 2' })
      ).status,
    ).toBe(200);
    expect(
      (await http().get(`/recurrent-earnings/${recurrent.body.id}`).set(authHeader(E2E_EMAIL.userA)))
        .status,
    ).toBe(200);
    expect(
      (
        await http().delete(`/recurrent-earnings/${recurrent.body.id}`).set(authHeader(E2E_EMAIL.userA))
      ).status,
    ).toBe(200);

    const aiDeniedForAdministrator = await http()
      .post('/ai-requests')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        type: 'get_spent_issuer',
        message: 'e2e',
      });
    expect(aiDeniedForAdministrator.status).toBe(403);
    expect(aiDeniedForAdministrator.body.message).toBe(
      'No tiene permiso para realizar la acción aiRequests.write',
    );

    const aiRequest = await http()
      .post('/ai-requests')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.admin))
      .send({
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        type: 'get_spent_issuer',
        message: 'e2e',
      });
    expect(aiRequest.status).toBe(201);
    expect(
      (await http().get(`/ai-requests/${aiRequest.body.id}`).set(authHeader(E2E_EMAIL.userA))).status,
    ).toBe(200);

    const signing = await http()
      .post('/signings')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        userEnterpriseId: seed.linkA.id,
        action: 'start',
        moment: '2026-06-01T08:00:00.000Z',
      });
    expect(signing.status).toBe(201);
    expect(
      (
        await http()
          .get(`/signings/${signing.body.id}/signing-updates`)
          .query({ enterpriseId: seed.enterpriseA.id })
          .set(authHeader(E2E_EMAIL.userA))
      ).status,
    ).toBe(200);
    expect(
      (
        await http()
          .patch(`/signings/${signing.body.id}`)
          .query({ enterpriseId: seed.enterpriseA.id })
          .set(authHeader(E2E_EMAIL.userA))
          .send({ action: 'end' })
      ).status,
    ).toBe(200);

    const vacation = await http()
      .post('/vacations')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ userEnterpriseId: seed.linkA.id, calendarDate: '2026-07-01' });
    expect(vacation.status).toBe(201);
    expect(
      (
        await http()
          .get(`/vacations/${vacation.body.id}`)
          .query({ enterpriseId: seed.enterpriseA.id })
          .set(authHeader(E2E_EMAIL.userA))
      ).status,
    ).toBe(200);
    expect(
      (
        await http()
          .patch(`/vacations/${vacation.body.id}`)
          .query({ enterpriseId: seed.enterpriseA.id })
          .set(authHeader(E2E_EMAIL.userA))
          .send({ calendarDate: '2026-07-02' })
      ).status,
    ).toBe(200);
    expect(
      (
        await http()
          .delete(`/vacations/${vacation.body.id}`)
          .query({ enterpriseId: seed.enterpriseA.id })
          .set(authHeader(E2E_EMAIL.userA))
      ).status,
    ).toBe(200);

    const workSchedule = await http()
      .post('/work-schedules')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        userEnterpriseId: seed.linkA.id,
        startsAt: '2026-06-02T08:00:00.000Z',
        endsAt: '2026-06-02T16:00:00.000Z',
      });
    expect([200, 201]).toContain(workSchedule.status);
    if (workSchedule.status === 201 || workSchedule.status === 200) {
      const workScheduleId = workSchedule.body.id as string;
      expect(
        (
          await http()
            .get(`/work-schedules/${workScheduleId}`)
            .query({ enterpriseId: seed.enterpriseA.id })
            .set(authHeader(E2E_EMAIL.userA))
        ).status,
      ).toBe(200);
      expect(
        (
          await http()
            .delete(`/work-schedules/${workScheduleId}`)
            .query({ enterpriseId: seed.enterpriseA.id })
            .set(authHeader(E2E_EMAIL.userA))
        ).status,
      ).toBe(200);
    }
  });

  it('usuarios: alta en A, listado, tarjeta, email, parche propio y kiosco', async () => {
    const seed = getE2eSeed();
    const created = await http()
      .post('/users')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        name: 'Alta e2e',
        email: `alta-${Date.now()}@e2e.test`,
        password: 'secret-password',
        userEnterprises: [{ enterpriseId: seed.enterpriseA.id }],
      });
    expect([200, 201]).toContain(created.status);

    const listed = await http()
      .get('/users')
      .query({
        enterpriseId: seed.enterpriseA.id,
        relations: 'userEnterprises',
        filter: JSON.stringify({ name_ilike: 'usuario' }),
      })
      .set(authHeader(E2E_EMAIL.userA));
    expect(listed.status).toBe(200);

    const byCard = await http()
      .get('/users/card/1')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(byCard.status).toBe(200);

    const invalidCard = await http()
      .get('/users/card/0')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(invalidCard.status).toBe(400);

    const byEmail = await http()
      .get(`/users/email/${E2E_EMAIL.userA}`)
      .query({ relations: 'userEnterprises' })
      .set(authHeader(E2E_EMAIL.userA));
    expect(byEmail.status).toBe(200);

    const patched = await http()
      .patch(`/users/${seed.userA.id}`)
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .send({ name: 'Usuario A e2e' });
    expect(patched.status).toBe(200);

    const kiosk = await http()
      .get('/user-enterprises/card/1')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(kiosk.status).toBe(200);

    const kioskInvalid = await http()
      .get('/user-enterprises/card/abc')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(kioskInvalid.status).toBe(400);
  });

  it('empresas: filtro JSON inválido, parche propio, logo propio y alta de admin', async () => {
    const seed = getE2eSeed();
    const listed = await http()
      .get('/enterprises')
      .query({ filter: '{x', relations: 'clients', pageSize: 20, sort: 'name', order: 'ASC' })
      .set(authHeader(E2E_EMAIL.userA));
    expect(listed.status).toBe(200);

    const patched = await http()
      .patch(`/enterprises/${seed.enterpriseA.id}`)
      .set(authHeader(E2E_EMAIL.userA))
      .send({ phone: '600111222' });
    expect(patched.status).toBe(200);

    const logo = await http()
      .post('/enterprises/logo')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: 'logo.png', contentType: 'image/png' });
    expect([200, 201, 400, 500]).toContain(logo.status);

    const logoMissingFile = await http()
      .post('/enterprises/logo')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(logoMissingFile.status).toBe(400);

    const duplicateNif = await http()
      .post('/enterprises')
      .set(authHeader(E2E_EMAIL.admin))
      .send({
        name: 'Empresa NIF duplicado',
        email: `dup-nif-${Date.now()}@e2e.test`,
        nif: seed.enterpriseA.nif,
      });
    expect(duplicateNif.status).toBe(409);

    const created = await http()
      .post('/enterprises')
      .set(authHeader(E2E_EMAIL.admin))
      .send({
        name: 'Empresa admin e2e',
        email: `admin-ent-${Date.now()}@e2e.test`,
        nif: `Z${Date.now().toString().slice(-8)}`,
      });
    expect(created.status).toBe(201);
    expect(created.body.id).toBeDefined();
  });

  it('billing propio: catálogo, checkout, cambio de precio y cancelación', async () => {
    const seed = getE2eSeed();
    const catalog = await http()
      .get('/billing/products-by-metadata')
      .query({ metadataKey: 'type', metadataValue: 'signings' })
      .set(authHeader(E2E_EMAIL.userA));
    expect(catalog.status).toBe(200);

    const checkout = await http()
      .post('/billing/create-subscription-checkout-session')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        enterpriseId: seed.enterpriseA.id,
        priceId: 'price_e2e',
        successUrl: 'https://app.test/ok',
        cancelUrl: 'https://app.test/ko',
      });
    expect([200, 201, 400, 404]).toContain(checkout.status);

    const updatePrice = await http()
      .post('/billing/update-subscription-price')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        enterpriseId: seed.enterpriseA.id,
        subscriptionId: 'sub_e2e_a',
        priceId: 'price_e2e',
      });
    expect([200, 201, 204, 400, 404]).toContain(updatePrice.status);

    const cancel = await http()
      .post('/billing/cancel-subscription-at-period-end')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        enterpriseId: seed.enterpriseA.id,
        subscriptionId: 'sub_e2e_a',
      });
    expect([200, 201, 204, 400, 404]).toContain(cancel.status);

    const revoke = await http()
      .post('/billing/revoke-cancel-subscription-at-period-end')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        enterpriseId: seed.enterpriseA.id,
        subscriptionId: 'sub_e2e_a',
      });
    expect([200, 201, 204, 400, 404]).toContain(revoke.status);

    const subscriptions = await http()
      .get('/billing/active-subscriptions')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(subscriptions.status).toBe(200);
  });

  it('métricas con filtro JSON inválido y válido; gasto AI y archivo sin fichero', async () => {
    const seed = getE2eSeed();
    const metrics = await http()
      .get('/metrics/invoices/subtotals-by-status')
      .query({
        enterpriseId: seed.enterpriseA.id,
        filter: '{broken',
      })
      .set(authHeader(E2E_EMAIL.userA));
    expect(metrics.status).toBe(200);

    const metricsOk = await http()
      .get('/metrics/clients/counts-by-type')
      .query({
        enterpriseId: seed.enterpriseA.id,
        filter: JSON.stringify({ name_ilike: 'cliente' }),
      })
      .set(authHeader(E2E_EMAIL.userA));
    expect(metricsOk.status).toBe(200);

    const aiMissing = await http()
      .post('/spents/ai/file')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(aiMissing.status).toBe(400);

    const fileMissing = await http()
      .post('/spents/file')
      .query({ spentId: seed.spentA.id })
      .set(authHeader(E2E_EMAIL.userA));
    expect(fileMissing.status).toBe(400);

    const aiOk = await http()
      .post('/spents/ai/file')
      .query({ enterpriseId: seed.enterpriseA.id })
      .set(authHeader(E2E_EMAIL.userA))
      .attach('file', Buffer.from('%PDF-1.4 e2e'), { filename: 'gasto.pdf', contentType: 'application/pdf' });
    expect([200, 201]).toContain(aiOk.status);
  });

  it('IDOR de recursos propios vs ajenos y admin en HR', async () => {
    const seed = getE2eSeed();
    expectIdorHidden(
      (
        await http()
          .get(`/holidays/${seed.holidayB.id}`)
          .query({ enterpriseId: seed.enterpriseA.id })
          .set(authHeader(E2E_EMAIL.userA))
      ).status,
    );
    const adminHoliday = await http()
      .get(`/holidays/${seed.holidayB.id}`)
      .query({ enterpriseId: seed.enterpriseB.id })
      .set(authHeader(E2E_EMAIL.admin));
    expect(adminHoliday.status).toBe(200);

    const unlinkForeign = await http()
      .delete(`/users/${seed.userA.id}/enterprise/${seed.enterpriseB.id}`)
      .set(authHeader(E2E_EMAIL.userA));
    expect([400, 403, 404]).toContain(unlinkForeign.status);
  });
});
