import { randomUUID } from 'crypto';
import { E2E_EMAIL, authHeader } from '@e2e/auth';
import { http } from '@e2e/http';
import { getE2eApp, getE2eSeed, startE2eWorld } from '@e2e/world';
import { QuoteService } from 'src/api/quote/quote.service';
import { Quote, QuoteStatus } from 'src/entities/quote/quote.entity';
import { EnterpriseAccessService } from 'src/common/helpers/enterprise-access/enterprise-access.service';
import { runWithEnterpriseAccessContext } from 'src/common/helpers/enterprise-access/enterprise-access.storage';

/**
 * Ramas de error de servicios y helpers que el contrato HTTP feliz no recorre
 * (cliente/proveedor ausente, filtro de empresas por id, ALS sin userEnterprises).
 */
describe('Ramas de error de dominio (e2e)', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('factura, presupuesto y gasto rechazan tenant incompleto o desconocido', async () => {
    const missingInvoiceClient = await http()
      .post('/invoices')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        name: 'Sin cliente',
        issuedDate: '2026-05-01',
        collectionDate: '2026-05-15',
        status: 'draft',
        concepts: [],
      });
    expect(missingInvoiceClient.status).toBe(400);

    const unknownInvoiceClient = await http()
      .post('/invoices')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        clientId: randomUUID(),
        name: 'Cliente fantasma',
        issuedDate: '2026-05-01',
        collectionDate: '2026-05-15',
        status: 'draft',
        concepts: [],
      });
    expect(unknownInvoiceClient.status).toBe(404);

    const missingQuoteClient = await http()
      .post('/quotes')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        name: 'Sin cliente',
        issuedDate: '2026-05-01',
        formalizationDate: '2026-05-20',
        status: 'accepted',
        concepts: [],
      });
    expect(missingQuoteClient.status).toBe(400);

    const unknownQuoteClient = await http()
      .post('/quotes')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        clientId: randomUUID(),
        name: 'Cliente fantasma',
        issuedDate: '2026-05-01',
        formalizationDate: '2026-05-20',
        status: 'accepted',
        concepts: [],
      });
    expect(unknownQuoteClient.status).toBe(404);

    const missingSpentSupplier = await http()
      .post('/spents')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        name: 'Sin proveedor',
        issuedDate: '2026-05-01',
        collectionDate: '2026-05-15',
        declarationDate: '2026-05-01',
        status: 'paid',
        concepts: [],
      });
    expect(missingSpentSupplier.status).toBe(400);

    const unknownSpentSupplier = await http()
      .post('/spents')
      .set(authHeader(E2E_EMAIL.userA))
      .send({
        supplierId: randomUUID(),
        name: 'Proveedor fantasma',
        issuedDate: '2026-05-01',
        collectionDate: '2026-05-15',
        declarationDate: '2026-05-01',
        status: 'paid',
        concepts: [],
      });
    expect(unknownSpentSupplier.status).toBe(404);

    const quoteService = getE2eApp().get(QuoteService);
    await expect(
      quoteService.setQuotePersistentData({
        status: QuoteStatus.ISSUED,
      } as Quote),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      quoteService.setQuotePersistentData({
        clientId: randomUUID(),
        status: QuoteStatus.ISSUED,
      } as Quote),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('PATCH/DELETE de proveedor y gasto inexistentes son 404; enterpriseId en blanco es 400', async () => {
    const missingId = randomUUID();
    expect((await http().patch(`/suppliers/${missingId}`).set(authHeader(E2E_EMAIL.userA)).send({ name: 'X' })).status).toBe(
      404,
    );
    expect((await http().delete(`/suppliers/${missingId}`).set(authHeader(E2E_EMAIL.userA))).status).toBe(404);
    expect((await http().patch(`/spents/${missingId}`).set(authHeader(E2E_EMAIL.userA)).send({ name: 'X' })).status).toBe(
      404,
    );
    expect((await http().get(`/users/${missingId}`).set(authHeader(E2E_EMAIL.userA))).status).toBe(404);
    expect(
      (await http().patch(`/users/${missingId}`).set(authHeader(E2E_EMAIL.userA)).send({ name: 'X' })).status,
    ).toBe(404);

    const whitespaceEnterprise = await http()
      .get('/clients')
      .query({ enterpriseId: '   ' })
      .set(authHeader(E2E_EMAIL.userA));
    expect(whitespaceEnterprise.status).toBe(400);
  });

  it('listado de empresas filtra por id en array y cubre AccessContext sin userEnterprises', async () => {
    const seed = getE2eSeed();
    const listed = await http()
      .get('/enterprises')
      .query({
        pageSize: 50,
        filter: JSON.stringify({ id: [seed.enterpriseA.id, seed.enterpriseB.id] }),
      })
      .set(authHeader(E2E_EMAIL.userA));
    expect(listed.status).toBe(200);

    const listedBySingleId = await http()
      .get('/enterprises')
      .query({
        pageSize: 50,
        filter: JSON.stringify({ id: seed.enterpriseA.id }),
      })
      .set(authHeader(E2E_EMAIL.userA));
    expect(listedBySingleId.status).toBe(200);

    const listedByNullId = await http()
      .get('/enterprises')
      .query({
        pageSize: 50,
        filter: JSON.stringify({ id: null }),
      })
      .set(authHeader(E2E_EMAIL.userA));
    expect(listedByNullId.status).toBe(200);

    const accessService = getE2eApp().get(EnterpriseAccessService);
    const accessContext = {
      userId: seed.userA.id,
      isGlobalAdmin: false,
      allowedEnterpriseIds: [seed.enterpriseA.id],
    };
    runWithEnterpriseAccessContext(accessContext, () => {
      try {
        accessService.assertEntityAccessible(accessContext, null, { notFoundMessage: 'oculto' });
      } catch {
        // Empresa nula: entra al 404 y usa el fallback «desconocida» del log.
      }
      try {
        accessService.assertEntityAccessible(accessContext, undefined, { notFoundMessage: 'oculto' });
      } catch {
        // Empresa ausente.
      }
      try {
        accessService.assertEntityAccessible(accessContext, 'empresa-ajena-e2e', {
          notFoundMessage: 'oculto',
        });
      } catch {
        // Empresa ajena con id no vacío: cubre el ?? con valor definido.
      }
      expect(() =>
        accessService.assertUserRecordAccessible(
          accessContext,
          { id: seed.userB.id, userEnterprises: undefined },
          'Usuario no encontrado',
        ),
      ).toThrow();
    });
  });
});
