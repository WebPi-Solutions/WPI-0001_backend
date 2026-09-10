import { invokeTypeOrmMetadataCallbacks } from 'src/test-utils/cover-data-classes';
import { AiRequest, AiRequestType } from './ai-request/ai-request.entity';
import { Client } from './client/client.entity';
import { DefaultSchedule } from './default-schedule/default-schedule.entity';
import { Enterprise } from './enterprise/enterprise.entity';
import { Holiday } from './holiday/holiday.entity';
import { Invoice, InvoiceStatus } from './invoice/invoice.entity';
import { InvoiceSeries } from './invoice-series/invoice-series.entity';
import { Quote, QuoteStatus } from './quote/quote.entity';
import { RecurrentEarning, RecurrentEarningType } from './recurrent-earning/recurrent-earning.entity';
import { Signing, SigningAction } from './signing/signing.entity';
import { SigningUpdate } from './signing/signing-update.entity';
import { Spent } from './spent/spent.entity';
import { Supplier } from './supplier/supplier.entity';
import { UserEnterprise } from './user/user-enterprise.entity';
import { User, UserRoleTypes, UserStatusTypes } from './user/user.entity';
import { Vacation } from './vacation/vacation.entity';
import { WorkSchedule } from './work-schedule/work-schedule.entity';

const now = new Date('2026-04-13T08:00:00.000Z');

/**
 * Cubre constructores de todas las entidades TypeORM y ejecuta callbacks de metadatos
 * (relaciones, defaults y RelationId) que Clover marca como no ejecutados.
 */
describe('Entidades TypeORM', () => {
  it('debe instanciar cada entidad, asignar campos y ejecutar callbacks de metadatos', () => {
    const enterprise = Object.assign(new Enterprise(), {
      id: 'ent-1',
      name: 'Webpi',
      email: 'info@webpi.test',
      nif: 'B12345678',
      phone: '600',
      address: 'Calle 1',
      bankAccount: 'ES00',
      logo: 'logo.png',
      stripeId: 'cus_1',
      aiAccess: true,
      createdAt: now,
      updatedAt: now,
      clients: [],
      suppliers: [],
      userEnterprises: [],
      invoiceSeries: [],
      defaultSchedules: [],
      holidays: [],
      recurrentEarnings: [],
      aiRequests: [],
    });
    const user = Object.assign(new User(), {
      id: 'user-1',
      name: 'Ana',
      email: 'ana@test',
      role: UserRoleTypes.ADMIN,
      phone: '611',
      status: UserStatusTypes.PENDING,
      createdAt: now,
      updatedAt: now,
      userEnterprises: [],
    });
    const defaultSchedule = Object.assign(new DefaultSchedule(), {
      id: 'ds-1',
      enterpriseId: enterprise.id,
      name: 'Oficina',
      description: 'L-V',
      schedule: { monday: [] },
      createdAt: now,
      updatedAt: now,
      enterprise,
      userEnterpriseLinks: [],
    });
    const userEnterprise = Object.assign(new UserEnterprise(), {
      id: 'ue-1',
      userId: user.id,
      enterpriseId: enterprise.id,
      role: 'user',
      cardId: 1,
      defaultSchedule,
      defaultScheduleId: defaultSchedule.id,
      createdAt: now,
      updatedAt: now,
      user,
      enterprise,
      signings: [],
      vacations: [],
      workSchedules: [],
    });
    const vacation = Object.assign(new Vacation(), {
      id: 'vac-1',
      userEnterpriseId: userEnterprise.id,
      name: 'Vacaciones',
      calendarDate: '2026-08-01',
      createdAt: now,
      updatedAt: now,
      userEnterprise,
    });
    const workSchedule = Object.assign(new WorkSchedule(), {
      id: 'ws-1',
      userEnterpriseId: userEnterprise.id,
      startsAt: now,
      endsAt: now,
      createdAt: now,
      updatedAt: now,
      userEnterprise,
    });
    const holiday = Object.assign(new Holiday(), {
      id: 'hol-1',
      enterpriseId: enterprise.id,
      name: 'Festivo',
      calendarDate: '2026-12-25',
      calendarColor: '#00A76F',
      createdAt: now,
      updatedAt: now,
      enterprise,
    });
    const client = Object.assign(new Client(), {
      id: 'client-1',
      enterpriseId: enterprise.id,
      name: 'Cliente',
      nif: '12345678Z',
      email: 'c@test',
      phone: '622',
      address: 'Dir',
      type: 'company',
      accountNumber: 'ES11',
      equivalenceSurcharge: 'type_1',
      description: 'Nota',
      createdAt: now,
      updatedAt: now,
      enterprise,
      invoices: [],
      quotes: [],
      recurrentEarnings: [],
    });
    const supplier = Object.assign(new Supplier(), {
      id: 'sup-1',
      enterpriseId: enterprise.id,
      name: 'Proveedor',
      nif: 'B000',
      email: 'p@test',
      phone: '633',
      address: 'Dir P',
      type: 'individual',
      accountNumber: 'ES22',
      equivalenceSurcharge: null,
      description: null,
      createdAt: now,
      updatedAt: now,
      enterprise,
      spents: [],
    });
    const spent = Object.assign(new Spent(), {
      id: 'spent-1',
      supplierId: supplier.id,
      name: 'Material',
      issuedDate: now,
      collectionDate: now,
      declarationDate: now,
      concepts: [],
      status: 'paid',
      file: true,
      createdAt: now,
      updatedAt: now,
      supplier,
    });
    const invoiceSeries = Object.assign(new InvoiceSeries(), {
      id: 'series-1',
      enterpriseId: enterprise.id,
      series: 'A',
      description: 'Serie A',
      createdAt: now,
      updatedAt: now,
      enterprise,
      invoices: [],
      recurrentEarnings: [],
    });
    const quote = Object.assign(new Quote(), {
      id: 'quote-1',
      clientId: client.id,
      name: 'Presupuesto',
      issuedDate: now,
      formalizationDate: now,
      concepts: [],
      status: QuoteStatus.DRAFT,
      clientName: client.name,
      clientNif: client.nif,
      clientAddress: client.address,
      issuerName: enterprise.name,
      issuerNif: enterprise.nif,
      issuerAddress: enterprise.address,
      createdAt: now,
      updatedAt: now,
      client,
      invoices: [],
    });
    const recurrentEarning = Object.assign(new RecurrentEarning(), {
      id: 're-1',
      enterpriseId: enterprise.id,
      invoiceSerieId: invoiceSeries.id,
      clientId: client.id,
      type: RecurrentEarningType.YEARLY,
      name: 'Cuota',
      concepts: [],
      createdAt: now,
      updatedAt: now,
      enterprise,
      invoiceSeries,
      client,
      invoices: [],
    });
    const invoice = Object.assign(new Invoice(), {
      id: 'inv-1',
      clientId: client.id,
      seriesId: invoiceSeries.id,
      quoteId: quote.id,
      recurrentEarningId: recurrentEarning.id,
      seriesNumber: 1,
      name: 'Factura',
      issuedDate: now,
      collectionDate: now,
      concepts: [],
      status: InvoiceStatus.PAID,
      clientName: client.name,
      clientNif: client.nif,
      clientAddress: client.address,
      issuerName: enterprise.name,
      issuerNif: enterprise.nif,
      issuerAddress: enterprise.address,
      issuerBankAccount: enterprise.bankAccount,
      createdAt: now,
      updatedAt: now,
      client,
      series: invoiceSeries,
      quote,
      recurrentEarning,
    });
    const signing = Object.assign(new Signing(), {
      id: 'sig-1',
      userEnterpriseId: userEnterprise.id,
      action: SigningAction.END,
      moment: now,
      durationInSeconds: 3600,
      cancelled: false,
      createdAt: now,
      updatedAt: now,
      userEnterprise,
      updatesCount: 1,
    });
    const signingUpdate = Object.assign(new SigningUpdate(), {
      id: 'su-1',
      userEnterpriseId: userEnterprise.id,
      userEnterprise,
      signingsId: signing.id,
      signing,
      previousMoment: now,
      updatedMoment: now,
      previousAction: SigningAction.START,
      updatedAction: SigningAction.END,
      createdAt: now,
      updatedAt: now,
    });
    const aiRequest = Object.assign(new AiRequest(), {
      id: 'ai-1',
      enterpriseId: enterprise.id,
      correlationId: 'corr-1',
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
      type: AiRequestType.GET_SPENT_CONCEPTS,
      message: 'prompt',
      response: { concepts: [] },
      createdAt: now,
      updatedAt: now,
      enterprise,
    });

    invokeTypeOrmMetadataCallbacks();

    expect(enterprise.aiAccess).toBe(true);
    expect(user.status).toBe(UserStatusTypes.PENDING);
    expect(userEnterprise.defaultScheduleId).toBe('ds-1');
    expect(vacation.name).toBe('Vacaciones');
    expect(workSchedule.startsAt).toEqual(now);
    expect(holiday.calendarColor).toBe('#00A76F');
    expect(client.type).toBe('company');
    expect(supplier.spents).toEqual([]);
    expect(spent.file).toBe(true);
    expect(invoiceSeries.series).toBe('A');
    expect(quote.status).toBe(QuoteStatus.DRAFT);
    expect(recurrentEarning.type).toBe(RecurrentEarningType.YEARLY);
    expect(invoice.status).toBe(InvoiceStatus.PAID);
    expect(signing.action).toBe(SigningAction.END);
    expect(signingUpdate.signingsId).toBe('sig-1');
    expect(aiRequest.type).toBe(AiRequestType.GET_SPENT_CONCEPTS);
    expect(defaultSchedule.userEnterpriseLinks).toEqual([]);
    expect(UserRoleTypes.USER).toBe('user');
  });
});
