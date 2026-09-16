import { invokeTypeOrmMetadataCallbacks } from 'src/test-utils/cover-data-classes';
import {
  AiMode,
  AiRequestType,
  OrderStatus,
  PaymentMethod,
  RecurrentEarningType,
  SigningAction,
} from 'src/common/enums';
import { AiRequest } from './ai-request/ai-request.entity';
import { Client } from './client/client.entity';
import { DefaultSchedule } from './default-schedule/default-schedule.entity';
import { Enterprise } from './enterprise/enterprise.entity';
import { Holiday } from './holiday/holiday.entity';
import { Invoice, InvoiceStatus } from './invoice/invoice.entity';
import { InvoiceConcept } from './invoice-concept/invoice-concept.entity';
import { InvoiceConceptSerial } from './invoice-concept-serial/invoice-concept-serial.entity';
import { InvoiceSeries } from './invoice-series/invoice-series.entity';
import { Item } from './item/item.entity';
import { ItemCategory } from './item-category/item-category.entity';
import { Order } from './order/order.entity';
import { OrderConcept } from './order-concept/order-concept.entity';
import { Quote, QuoteStatus } from './quote/quote.entity';
import { QuoteConcept } from './quote-concept/quote-concept.entity';
import { RecurrentEarning } from './recurrent-earning/recurrent-earning.entity';
import { Signing } from './signing/signing.entity';
import { SigningUpdate } from './signing/signing-update.entity';
import { Spent } from './spent/spent.entity';
import { SpentConcept } from './spent-concept/spent-concept.entity';
import { SpentConceptSerial } from './spent-concept-serial/spent-concept-serial.entity';
import { Supplier } from './supplier/supplier.entity';
import { EnterpriseRole } from './enterprise-role/enterprise-role.entity';
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
      aiMode: AiMode.STANDARD,
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
      itemCategories: [],
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
    const enterpriseRole = Object.assign(new EnterpriseRole(), {
      id: 'role-1',
      enterpriseId: enterprise.id,
      role: 'empleado',
      permissions: {},
      createdAt: now,
      updatedAt: now,
      enterprise,
      userEnterprises: [],
    });
    const userEnterprise = Object.assign(new UserEnterprise(), {
      id: 'ue-1',
      userId: user.id,
      enterpriseId: enterprise.id,
      enterpriseRoleId: enterpriseRole.id,
      enterpriseRole,
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
      paymentMethod: PaymentMethod.CARD,
      description: 'Nota',
      createdAt: now,
      updatedAt: now,
      enterprise,
      invoices: [],
      quotes: [],
      orders: [],
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
      description: null,
      createdAt: now,
      updatedAt: now,
      enterprise,
      spents: [],
    });
    const itemCategory = Object.assign(new ItemCategory(), {
      id: 'item-cat-1',
      enterpriseId: enterprise.id,
      name: 'Material',
      description: 'Consumibles',
      createdAt: now,
      updatedAt: now,
      enterprise,
      items: [],
    });
    const item = Object.assign(new Item(), {
      id: 'item-1',
      itemCategoryId: itemCategory.id,
      name: 'Tornillo',
      description: 'M6',
      pricePvp: 1.5,
      lastPurchasePrice: 0.8,
      serialNumber: true,
      stock: false,
      ean: '8412345678901',
      createdAt: now,
      updatedAt: now,
      itemCategory,
    });
    itemCategory.items = [item];
    enterprise.itemCategories = [itemCategory];
    const spent = Object.assign(new Spent(), {
      id: 'spent-1',
      supplierId: supplier.id,
      code: 'FAC-2026-001',
      name: 'Material',
      issuedDate: now,
      collectionDate: now,
      declarationDate: now,
      status: 'paid',
      file: true,
      spentConcepts: [],
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
      orders: [],
      quoteConcepts: [],
    });
    const order = Object.assign(new Order(), {
      id: 'order-1',
      clientId: client.id,
      quoteId: quote.id,
      name: 'Pedido',
      date: now,
      status: OrderStatus.AWAITING_RECEIPT,
      clientName: client.name,
      clientNif: client.nif,
      clientAddress: client.address,
      issuerName: enterprise.name,
      issuerNif: enterprise.nif,
      issuerAddress: enterprise.address,
      createdAt: now,
      updatedAt: now,
      client,
      quote,
      orderConcepts: [],
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
    invoice.invoiceConcepts = [];
    const invoiceConcept = Object.assign(new InvoiceConcept(), {
      id: 'ic-1',
      invoiceId: invoice.id,
      itemId: item.id,
      position: 0,
      name: 'Tornillo',
      basePrice: 1.5,
      vat: 21,
      irpf: 0,
      quantity: 1,
      ean: '8412345678901',
      createdAt: now,
      updatedAt: now,
      invoice,
      item,
      serials: [],
    });
    const invoiceConceptSerial = Object.assign(new InvoiceConceptSerial(), {
      id: 'ics-1',
      invoiceConceptId: invoiceConcept.id,
      serialNumber: 'SN-001',
      createdAt: now,
      updatedAt: now,
      invoiceConcept,
    });
    invoiceConcept.serials = [invoiceConceptSerial];
    invoice.invoiceConcepts = [invoiceConcept];
    const quoteConcept = Object.assign(new QuoteConcept(), {
      id: 'qc-1',
      quoteId: quote.id,
      itemId: item.id,
      position: 0,
      name: 'Tornillo',
      basePrice: 1.5,
      vat: 21,
      irpf: 0,
      quantity: 1,
      ean: '8412345678901',
      createdAt: now,
      updatedAt: now,
      quote,
      item,
    });
    quote.quoteConcepts = [quoteConcept];
    const orderConcept = Object.assign(new OrderConcept(), {
      id: 'oc-1',
      orderId: order.id,
      itemId: item.id,
      position: 0,
      name: 'Tornillo',
      basePrice: 1.5,
      vat: 21,
      irpf: 0,
      quantity: 1,
      ean: '8412345678901',
      createdAt: now,
      updatedAt: now,
      order,
      item,
    });
    order.orderConcepts = [orderConcept];
    const spentConcept = Object.assign(new SpentConcept(), {
      id: 'sc-1',
      spentId: spent.id,
      itemId: item.id,
      position: 0,
      name: 'Papel',
      basePrice: 10,
      vat: 21,
      irpf: 0,
      quantity: 1,
      ean: null,
      createdAt: now,
      updatedAt: now,
      spent,
      item,
      serials: [],
    });
    const spentConceptSerial = Object.assign(new SpentConceptSerial(), {
      id: 'scs-1',
      spentConceptId: spentConcept.id,
      serialNumber: 'SN-SPENT-001',
      createdAt: now,
      updatedAt: now,
      spentConcept,
    });
    spentConcept.serials = [spentConceptSerial];
    spent.spentConcepts = [spentConcept];
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
      aiMode: AiMode.STANDARD,
      message: 'prompt',
      response: { concepts: [] },
      createdAt: now,
      updatedAt: now,
      enterprise,
    });

    invokeTypeOrmMetadataCallbacks();

    expect(enterprise.aiAccess).toBe(true);
    expect(enterprise.aiMode).toBe(AiMode.STANDARD);
    expect(user.status).toBe(UserStatusTypes.PENDING);
    expect(userEnterprise.defaultScheduleId).toBe('ds-1');
    expect(vacation.name).toBe('Vacaciones');
    expect(workSchedule.startsAt).toEqual(now);
    expect(holiday.calendarColor).toBe('#00A76F');
    expect(client.type).toBe('company');
    expect(client.paymentMethod).toBe(PaymentMethod.CARD);
    expect(supplier.spents).toEqual([]);
    expect(itemCategory.name).toBe('Material');
    expect(item.itemCategoryId).toBe('item-cat-1');
    expect(enterprise.itemCategories).toEqual([itemCategory]);
    expect(spent.file).toBe(true);
    expect(spent.code).toBe('FAC-2026-001');
    expect(spent.spentConcepts[0].name).toBe('Papel');
    expect(spent.spentConcepts[0].serials[0].serialNumber).toBe('SN-SPENT-001');
    expect(invoiceSeries.series).toBe('A');
    expect(quote.status).toBe(QuoteStatus.DRAFT);
    expect(order.status).toBe(OrderStatus.AWAITING_RECEIPT);
    expect(recurrentEarning.type).toBe(RecurrentEarningType.YEARLY);
    expect(invoice.status).toBe(InvoiceStatus.PAID);
    expect(invoice.invoiceConcepts[0].name).toBe('Tornillo');
    expect(invoice.invoiceConcepts[0].serials[0].serialNumber).toBe('SN-001');
    expect(signing.action).toBe(SigningAction.END);
    expect(signingUpdate.signingsId).toBe('sig-1');
    expect(aiRequest.type).toBe(AiRequestType.GET_SPENT_CONCEPTS);
    expect(aiRequest.aiMode).toBe(AiMode.STANDARD);
    expect(defaultSchedule.userEnterpriseLinks).toEqual([]);
    expect(UserRoleTypes.USER).toBe('user');
  });
});
