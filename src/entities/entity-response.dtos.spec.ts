import { QuoteStatus } from './quote/quote.entity';
import { InvoiceStatus } from './invoice/invoice.entity';
import { AiRequestType } from './ai-request/ai-request.entity';
import { RecurrentEarningType } from './recurrent-earning/recurrent-earning.entity';
import { SigningAction } from './signing/signing.entity';
import { UserRoleTypes, UserStatusTypes } from './user/user.entity';
import { coverDtoClass } from 'src/test-utils/cover-data-classes';
import { InvoiceSeriesResponseDto } from './invoice-series/dto/invoice-series-response.dto';
import { ClientResponseDto } from './client/dto/client-response.dto';
import { SpentResponseDto } from './spent/dto/spent-response.dto';
import { SupplierResponseDto } from './supplier/dto/supplier-response.dto';
import { QuoteResponseDto } from './quote/dto/quote-response.dto';
import { InvoiceResponseDto } from './invoice/dto/invoice-response.dto';
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
      equivalenceSurcharge: 'type_1',
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
      equivalenceSurcharge: null,
      description: null,
      createdAt: now,
      updatedAt: now,
      enterprise,
    });
    const spent = coverDtoClass(SpentResponseDto, {
      id: 'spent-1',
      supplierId: 'sup-1',
      name: 'Material',
      issuedDate: now,
      collectionDate: now,
      declarationDate: now,
      concepts: [
        {
          name: 'Papel',
          base_price: 10,
          vat: 21,
          irpf: 0,
          quantity: 1,
          supplied: false,
          percentage: 100,
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
    expect(spent.concepts[0].percentage).toBe(100);
    expect(spent.supplier?.name).toBe('Proveedor');
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
      equivalenceSurcharge: null,
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
      concepts: [
        { name: 'Horas', base_price: 50, vat: 21, irpf: 15, quantity: 2, supplied: false },
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
      concepts: [
        { name: 'Horas', base_price: 50, vat: 21, irpf: 15, quantity: 2, supplied: false },
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
    expect(invoice.seriesNumber).toBe(12);
    expect(recurrent.invoices?.[0].id).toBe('inv-1');
  });

  it('debe instanciar vacaciones, horario, plantilla, festivo y fichajes', () => {
    const userEnterprise = coverDtoClass(UserEnterpriseResponseDto, {
      id: 'ue-1',
      userId: 'user-1',
      enterpriseId: 'ent-1',
      role: 'user',
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
      role: 'administrator',
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
});
