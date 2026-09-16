import { QuoteStatus } from './quote/quote.entity';
import { InvoiceStatus } from './invoice/invoice.entity';
import {
  AiMode,
  AiRequestType,
  OrderStatus,
  PaymentMethod,
  RecurrentEarningType,
  SigningAction,
} from 'src/common/enums';
import { UserRoleTypes, UserStatusTypes } from './user/user.entity';
import { plainToInstance } from 'class-transformer';
import { coverDtoClass } from 'src/test-utils/cover-data-classes';
import { InvoiceSeriesResponseDto } from './invoice-series/dto/invoice-series-response.dto';
import { ItemCategoryResponseDto } from './item-category/dto/item-category-response.dto';
import { ItemResponseDto } from './item/dto/item-response.dto';
import { ClientResponseDto } from './client/dto/client-response.dto';
import { SpentResponseDto } from './spent/dto/spent-response.dto';
import { SupplierResponseDto } from './supplier/dto/supplier-response.dto';
import { QuoteResponseDto } from './quote/dto/quote-response.dto';
import { QuoteConceptResponseDto } from './quote-concept/dto/quote-concept-response.dto';
import { OrderResponseDto } from './order/dto/order-response.dto';
import { OrderConceptResponseDto } from './order-concept/dto/order-concept-response.dto';
import { InvoiceResponseDto } from './invoice/dto/invoice-response.dto';
import { InvoiceConceptResponseDto } from './invoice-concept/dto/invoice-concept-response.dto';
import { InvoiceConceptSerialResponseDto } from './invoice-concept-serial/dto/invoice-concept-serial-response.dto';
import { SpentConceptResponseDto } from './spent-concept/dto/spent-concept-response.dto';
import { SpentConceptSerialResponseDto } from './spent-concept-serial/dto/spent-concept-serial-response.dto';
import { VacationResponseDto } from './vacation/dto/vacation-response.dto';
import { WorkScheduleResponseDto } from './work-schedule/dto/work-schedule-response.dto';
import { DefaultScheduleResponseDto } from './default-schedule/dto/default-schedule-response.dto';
import { HolidayResponseDto } from './holiday/dto/holiday-response.dto';
import { SigningResponseDto } from './signing/dto/signing-response.dto';
import { SigningUpdateResponseDto } from './signing/dto/signing-update-response.dto';
import { AiRequestResponseDto } from './ai-request/dto/ai-request-response.dto';
import { RecurrentEarningResponseDto } from './recurrent-earning/dto/recurrent-earning-response.dto';
import { UserEnterpriseResponseDto, UserResponseDto } from './user/dto/user-response.dto';
import { UserEnterpriseResponseDto as ReexportedUserEnterpriseResponseDto } from './user/dto/user-enterprise-response.dto';
import { EnterpriseResponseDto } from './enterprise/dto/enterprise-response.dto';
import { EnterpriseRoleResponseDto } from './enterprise-role/dto/enterprise-role-response.dto';

const now = new Date('2026-04-13T08:00:00.000Z');

/**
 * Empresa pública mínima reutilizada en las relaciones anidadas.
 *
 * @returns DTO de empresa con campos típicos
 */
function buildEnterprise(): EnterpriseResponseDto {
  return coverDtoClass(EnterpriseResponseDto, {
    id: 'ent-1',
    name: 'Webpi',
    email: 'info@webpi.test',
    nif: 'B12345678',
    phone: '600000000',
    address: 'Calle 1',
    bankAccount: 'ES00',
    logo: 'logo.png',
    aiAccess: true,
    aiMode: AiMode.STANDARD,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Cubre constructores, `@Type` y factorías Swagger de los DTO de respuesta de entidades.
 */
describe('DTO de respuesta de entidades', () => {
  it('debe instanciar serie, cliente, proveedor y gasto', () => {
    const enterprise = buildEnterprise();
    const series = coverDtoClass(InvoiceSeriesResponseDto, {
      id: 'series-1',
      enterpriseId: 'ent-1',
      series: 'A',
      description: 'Serie A',
      createdAt: now,
      updatedAt: now,
      enterprise,
    });
    const client = coverDtoClass(ClientResponseDto, {
      id: 'client-1',
      enterpriseId: 'ent-1',
      name: 'Cliente',
      nif: '12345678Z',
      email: 'c@test',
      phone: '611',
      address: 'Dir',
      type: 'company',
      accountNumber: 'ES11',
      paymentMethod: PaymentMethod.CARD,
      description: 'Nota',
      createdAt: now,
      updatedAt: now,
      enterprise,
    });
    const supplier = coverDtoClass(SupplierResponseDto, {
      id: 'sup-1',
      enterpriseId: 'ent-1',
      name: 'Proveedor',
      nif: 'B000',
      email: 'p@test',
      phone: '622',
      address: 'Dir P',
      type: 'individual',
      accountNumber: 'ES22',
      description: null,
      createdAt: now,
      updatedAt: now,
      enterprise,
    });
    const spent = coverDtoClass(SpentResponseDto, {
      id: 'spent-1',
      supplierId: 'sup-1',
      code: 'FAC-2026-001',
      name: 'Material',
      issuedDate: now,
      collectionDate: now,
      declarationDate: now,
      spentConcepts: [
        {
          id: 'sc-1',
          spentId: 'spent-1',
          itemId: null,
          position: 0,
          name: 'Papel',
          basePrice: 10,
          vat: 21,
          irpf: 0,
          quantity: 1,
          ean: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
      status: 'paid',
      file: true,
      createdAt: now,
      updatedAt: now,
      supplier,
    });

    expect(series.series).toBe('A');
    expect(client.type).toBe('company');
    expect(client.paymentMethod).toBe(PaymentMethod.CARD);
    expect(spent.spentConcepts?.[0].basePrice).toBe(10);
    expect(spent.supplier?.name).toBe('Proveedor');
    expect(spent.code).toBe('FAC-2026-001');
    const itemCategory = coverDtoClass(ItemCategoryResponseDto, {
      id: 'item-cat-1',
      enterpriseId: 'ent-1',
      name: 'Material',
      description: 'Consumibles',
      createdAt: now,
      updatedAt: now,
      enterprise,
    });
    const item = coverDtoClass(ItemResponseDto, {
      id: 'item-1',
      itemCategoryId: 'item-cat-1',
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
    expect(itemCategory.name).toBe('Material');
    expect(item.itemCategory?.id).toBe('item-cat-1');
    expect(item.pricePvp).toBe(1.5);
    expect(item.lastPurchasePrice).toBe(0.8);
    expect(item.serialNumber).toBe(true);
    expect(item.stock).toBe(false);
    expect(item.ean).toBe('8412345678901');
  });

  it('debe instanciar cotización, factura e ingreso recurrente', () => {
    const client = coverDtoClass(ClientResponseDto, {
      id: 'client-1',
      enterpriseId: 'ent-1',
      name: 'Cliente',
      nif: '12345678Z',
      email: null,
      phone: null,
      address: null,
      type: null,
      accountNumber: null,
      paymentMethod: PaymentMethod.BANK_TRANSFER,
      description: null,
      createdAt: now,
      updatedAt: now,
    });
    const quote = coverDtoClass(QuoteResponseDto, {
      id: 'quote-1',
      clientId: 'client-1',
      name: 'Presupuesto',
      issuedDate: now,
      formalizationDate: now,
      quoteConcepts: [
        {
          id: 'qc-1',
          quoteId: 'quote-1',
          itemId: 'item-1',
          position: 0,
          name: 'Horas',
          basePrice: 50,
          vat: 21,
          irpf: 15,
          quantity: 2,
          ean: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
      status: QuoteStatus.ISSUED,
      clientName: 'Cliente',
      clientNif: '12345678Z',
      clientAddress: 'Dir',
      issuerName: 'Webpi',
      issuerNif: 'B123',
      issuerAddress: 'Calle 1',
      createdAt: now,
      updatedAt: now,
      client,
    });
    const order = coverDtoClass(OrderResponseDto, {
      id: 'order-1',
      clientId: 'client-1',
      quoteId: 'quote-1',
      name: 'Pedido',
      date: now,
      orderConcepts: [
        {
          id: 'oc-1',
          orderId: 'order-1',
          itemId: 'item-1',
          position: 0,
          name: 'Horas',
          basePrice: 50,
          vat: 21,
          irpf: 15,
          quantity: 2,
          ean: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
      status: OrderStatus.AWAITING_RECEIPT,
      clientName: 'Cliente',
      clientNif: '12345678Z',
      clientAddress: 'Dir',
      issuerName: 'Webpi',
      issuerNif: 'B123',
      issuerAddress: 'Calle 1',
      createdAt: now,
      updatedAt: now,
      client,
      quote,
    });
    const series = coverDtoClass(InvoiceSeriesResponseDto, {
      id: 'series-1',
      enterpriseId: 'ent-1',
      series: 'A',
      description: null,
      createdAt: now,
      updatedAt: now,
    });
    const invoice = coverDtoClass(InvoiceResponseDto, {
      id: 'inv-1',
      clientId: 'client-1',
      seriesId: 'series-1',
      recurrentEarningId: 're-1',
      seriesNumber: 12,
      name: 'Factura',
      issuedDate: now,
      collectionDate: now,
      invoiceConcepts: [
        {
          id: 'ic-1',
          invoiceId: 'inv-1',
          itemId: null,
          position: 0,
          name: 'Horas',
          basePrice: 50,
          vat: 21,
          irpf: 15,
          quantity: 2,
          ean: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
      status: InvoiceStatus.ISSUED,
      clientName: 'Cliente',
      clientNif: '12345678Z',
      clientAddress: 'Dir',
      issuerName: 'Webpi',
      issuerNif: 'B123',
      issuerAddress: 'Calle 1',
      issuerBankAccount: 'ES00',
      createdAt: now,
      updatedAt: now,
      client,
      series,
    });
    const recurrent = coverDtoClass(RecurrentEarningResponseDto, {
      id: 're-1',
      enterpriseId: 'ent-1',
      invoiceSerieId: 'series-1',
      clientId: 'client-1',
      type: RecurrentEarningType.MONTHLY,
      name: 'Cuota',
      concepts: [
        { name: 'Cuota', base_price: 100, vat: 21, irpf: 0, quantity: 1, supplied: false },
      ],
      createdAt: now,
      updatedAt: now,
      enterprise: buildEnterprise(),
      invoiceSeries: series,
      client,
      invoices: [invoice],
    });

    expect(quote.status).toBe(QuoteStatus.ISSUED);
    expect(quote.quoteConcepts?.[0].basePrice).toBe(50);
    expect(order.status).toBe(OrderStatus.AWAITING_RECEIPT);
    expect(order.orderConcepts?.[0].basePrice).toBe(50);
    expect(invoice.seriesNumber).toBe(12);
    expect(invoice.invoiceConcepts[0].basePrice).toBe(50);
    const invoiceConcept = coverDtoClass(InvoiceConceptResponseDto, invoice.invoiceConcepts[0]);
    expect(invoiceConcept.name).toBe('Horas');
    const quoteConcept = coverDtoClass(QuoteConceptResponseDto, quote.quoteConcepts[0]);
    expect(quoteConcept.name).toBe('Horas');
    const orderConcept = coverDtoClass(OrderConceptResponseDto, order.orderConcepts[0]);
    expect(orderConcept.name).toBe('Horas');
    const invoiceConceptSerial = coverDtoClass(InvoiceConceptSerialResponseDto, {
      id: 'ics-1',
      invoiceConceptId: 'ic-1',
      serialNumber: 'SN-1',
      createdAt: now,
      updatedAt: now,
    });
    expect(invoiceConceptSerial.serialNumber).toBe('SN-1');
    const spentConcept = coverDtoClass(SpentConceptResponseDto, {
      id: 'sc-1',
      spentId: 'spent-1',
      itemId: null,
      position: 0,
      name: 'Papel',
      basePrice: 10,
      vat: 21,
      irpf: 0,
      quantity: 1,
      ean: null,
      createdAt: now,
      updatedAt: now,
    });
    expect(spentConcept.name).toBe('Papel');
    const spentConceptSerial = coverDtoClass(SpentConceptSerialResponseDto, {
      id: 'scs-1',
      spentConceptId: 'sc-1',
      serialNumber: 'SN-SPENT-1',
      createdAt: now,
      updatedAt: now,
    });
    expect(spentConceptSerial.serialNumber).toBe('SN-SPENT-1');
    expect(recurrent.invoices?.[0].id).toBe('inv-1');
  });

  it('debe instanciar vacaciones, horario, plantilla, festivo y fichajes', () => {
    const enterpriseRole = coverDtoClass(EnterpriseRoleResponseDto, {
      id: 'role-1',
      enterpriseId: 'ent-1',
      role: 'empleado',
      permissions: {},
      createdAt: now,
      updatedAt: now,
      userCount: 2,
    });
    const userEnterprise = coverDtoClass(UserEnterpriseResponseDto, {
      id: 'ue-1',
      userId: 'user-1',
      enterpriseId: 'ent-1',
      enterpriseRoleId: enterpriseRole.id,
      enterpriseRole,
      cardId: 1,
      defaultScheduleId: 'ds-1',
      createdAt: now,
      updatedAt: now,
    });
    const vacation = coverDtoClass(VacationResponseDto, {
      id: 'vac-1',
      userEnterpriseId: 'ue-1',
      name: 'Vacaciones',
      calendarDate: '2026-08-01',
      createdAt: now,
      updatedAt: now,
      userEnterprise,
    });
    const workSchedule = coverDtoClass(WorkScheduleResponseDto, {
      id: 'ws-1',
      userEnterpriseId: 'ue-1',
      startsAt: now,
      endsAt: now,
      createdAt: now,
      updatedAt: now,
      userEnterprise,
    });
    const defaultSchedule = coverDtoClass(DefaultScheduleResponseDto, {
      id: 'ds-1',
      enterpriseId: 'ent-1',
      name: 'Oficina',
      description: 'L-V',
      schedule: { monday: ['09:00-17:00'] },
      createdAt: now,
      updatedAt: now,
      enterprise: buildEnterprise(),
    });
    const holiday = coverDtoClass(HolidayResponseDto, {
      id: 'hol-1',
      enterpriseId: 'ent-1',
      name: 'Festivo',
      calendarDate: '2026-12-25',
      calendarColor: '#00A76F',
      createdAt: now,
      updatedAt: now,
      enterprise: buildEnterprise(),
    });
    const signing = coverDtoClass(SigningResponseDto, {
      id: 'sig-1',
      userEnterpriseId: 'ue-1',
      action: SigningAction.START,
      moment: now,
      durationInSeconds: null,
      cancelled: false,
      createdAt: now,
      updatedAt: now,
      updatesCount: 2,
      userEnterprise,
    });
    const signingUpdate = coverDtoClass(SigningUpdateResponseDto, {
      id: 'su-1',
      userEnterpriseId: 'ue-1',
      signingsId: 'sig-1',
      previousMoment: now,
      updatedMoment: now,
      previousAction: SigningAction.START,
      updatedAction: SigningAction.END,
      createdAt: now,
      updatedAt: now,
      userEnterprise,
    });

    expect(vacation.calendarDate).toBe('2026-08-01');
    expect(workSchedule.userEnterpriseId).toBe('ue-1');
    expect(defaultSchedule.schedule.monday).toEqual(['09:00-17:00']);
    expect(holiday.calendarColor).toBe('#00A76F');
    expect(signing.updatesCount).toBe(2);
    expect(signingUpdate.updatedAction).toBe(SigningAction.END);
  });

  it('debe instanciar petición de IA, usuario y reexport del vínculo', () => {
    const user = coverDtoClass(UserResponseDto, {
      id: 'user-1',
      name: 'Ana',
      email: 'ana@test',
      role: UserRoleTypes.USER,
      phone: '633',
      status: UserStatusTypes.ACTIVE,
      createdAt: now,
      updatedAt: now,
    });
    const userEnterprise = coverDtoClass(UserEnterpriseResponseDto, {
      id: 'ue-1',
      userId: 'user-1',
      enterpriseId: 'ent-1',
      enterpriseRoleId: 'role-1',
      cardId: 7,
      defaultScheduleId: null,
      defaultSchedule: null,
      createdAt: now,
      updatedAt: now,
      user,
      enterprise: buildEnterprise(),
    });
    user.userEnterprises = [userEnterprise];
    const aiRequest = coverDtoClass(AiRequestResponseDto, {
      id: 'ai-1',
      enterpriseId: 'ent-1',
      correlationId: 'corr-1',
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      type: AiRequestType.GET_SPENT_ISSUER,
      aiMode: AiMode.STANDARD,
      message: 'prompt',
      response: { issuer: 'ACME' },
      createdAt: now,
      updatedAt: now,
      enterprise: buildEnterprise(),
    });

    expect(user.userEnterprises?.[0].cardId).toBe(7);
    expect(aiRequest.totalTokens).toBe(30);
    expect(ReexportedUserEnterpriseResponseDto).toBe(UserEnterpriseResponseDto);
  });

  it('normaliza userCount inválido o negativo a 0', () => {
    const invalidUserCount = plainToInstance(
      EnterpriseRoleResponseDto,
      { userCount: 'no-es-numero' },
      { excludeExtraneousValues: true },
    );
    const negativeUserCount = plainToInstance(
      EnterpriseRoleResponseDto,
      { userCount: -4 },
      { excludeExtraneousValues: true },
    );

    expect(invalidUserCount.userCount).toBe(0);
    expect(negativeUserCount.userCount).toBe(0);
  });
});
