import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AiRequest } from '../../../src/entities/ai-request/ai-request.entity';
import { Client } from '../../../src/entities/client/client.entity';
import { DefaultSchedule } from '../../../src/entities/default-schedule/default-schedule.entity';
import { Enterprise } from '../../../src/entities/enterprise/enterprise.entity';
import { Holiday } from '../../../src/entities/holiday/holiday.entity';
import { InvoiceSeries } from '../../../src/entities/invoice-series/invoice-series.entity';
import { Invoice, InvoiceStatus } from '../../../src/entities/invoice/invoice.entity';
import { InvoiceConcept } from '../../../src/entities/invoice-concept/invoice-concept.entity';
import { InvoiceConceptSerial } from '../../../src/entities/invoice-concept-serial/invoice-concept-serial.entity';
import { Item } from '../../../src/entities/item/item.entity';
import { ItemCategory } from '../../../src/entities/item-category/item-category.entity';
import { Quote, QuoteStatus } from '../../../src/entities/quote/quote.entity';
import { RecurrentEarning } from '../../../src/entities/recurrent-earning/recurrent-earning.entity';
import { Signing } from '../../../src/entities/signing/signing.entity';
import { Spent } from '../../../src/entities/spent/spent.entity';
import { Supplier } from '../../../src/entities/supplier/supplier.entity';
import { EnterpriseRole } from '../../../src/entities/enterprise-role/enterprise-role.entity';
import { UserEnterprise } from '../../../src/entities/user/user-enterprise.entity';
import { User, UserRoleTypes, UserStatusTypes } from '../../../src/entities/user/user.entity';
import {
  AiRequestType,
  RecurrentEarningType,
  SigningAction,
} from '../../../src/common/enums';
import {
  ADMINISTRATOR_ROLE_PERMISSIONS,
  EMPLOYEE_ROLE_PERMISSIONS,
  ENTERPRISE_ROLE_NAME_ADMINISTRATOR,
  ENTERPRISE_ROLE_NAME_EMPLOYEE,
} from '../../../src/common/helpers/enterprise-permission/permission.catalog';
import { Vacation } from '../../../src/entities/vacation/vacation.entity';
import { WorkSchedule } from '../../../src/entities/work-schedule/work-schedule.entity';
import { E2E_EMAIL } from './auth';

/**
 * Dataset determinista para las pruebas e2e de aislamiento multi-empresa.
 */
export interface E2eSeed {
  enterpriseA: Enterprise;
  enterpriseB: Enterprise;
  userA: User;
  userB: User;
  admin: User;
  outsider: User;
  employeeA: User;
  administratorRoleA: EnterpriseRole;
  employeeRoleA: EnterpriseRole;
  administratorRoleB: EnterpriseRole;
  employeeRoleB: EnterpriseRole;
  linkA: UserEnterprise;
  linkB: UserEnterprise;
  linkEmployeeA: UserEnterprise;
  clientA: Client;
  clientB: Client;
  supplierA: Supplier;
  supplierB: Supplier;
  seriesA: InvoiceSeries;
  seriesB: InvoiceSeries;
  invoiceA: Invoice;
  invoiceB: Invoice;
  invoiceConceptA: InvoiceConcept;
  invoiceConceptB: InvoiceConcept;
  invoiceConceptSerialA: InvoiceConceptSerial;
  invoiceConceptSerialB: InvoiceConceptSerial;
  quoteA: Quote;
  quoteB: Quote;
  spentA: Spent;
  spentB: Spent;
  itemCategoryA: ItemCategory;
  itemCategoryB: ItemCategory;
  itemA: Item;
  itemB: Item;
  recurrentA: RecurrentEarning;
  recurrentB: RecurrentEarning;
  holidayA: Holiday;
  holidayB: Holiday;
  defaultScheduleA: DefaultSchedule;
  defaultScheduleB: DefaultSchedule;
  signingA: Signing;
  signingB: Signing;
  vacationA: Vacation;
  vacationB: Vacation;
  workScheduleA: WorkSchedule;
  workScheduleB: WorkSchedule;
  aiRequestA: AiRequest;
  aiRequestB: AiRequest;
}

/**
 * Persiste dos empresas aisladas, usuarios (A, B, admin global, sin empresas) y un recurso de cada tipo.
 *
 * @param dataSource - Conexión TypeORM del Postgres de Testcontainers
 * @returns Identificadores y entidades sembradas
 */
export async function seedE2eDatabase(dataSource: DataSource): Promise<E2eSeed> {
  const enterpriseA = await dataSource.getRepository(Enterprise).save({
    name: 'Empresa A',
    email: 'empresa-a@e2e.test',
    nif: 'A11111111',
    stripeId: 'cus_e2e_a',
    aiAccess: true,
  });
  const enterpriseB = await dataSource.getRepository(Enterprise).save({
    name: 'Empresa B',
    email: 'empresa-b@e2e.test',
    nif: 'B22222222',
    stripeId: 'cus_e2e_b',
    aiAccess: true,
  });

  const userA = await dataSource.getRepository(User).save({
    name: 'Usuario A',
    email: E2E_EMAIL.userA,
    role: UserRoleTypes.USER,
    status: UserStatusTypes.ACTIVE,
  });
  const userB = await dataSource.getRepository(User).save({
    name: 'Usuario B',
    email: E2E_EMAIL.userB,
    role: UserRoleTypes.USER,
    status: UserStatusTypes.ACTIVE,
  });
  const admin = await dataSource.getRepository(User).save({
    name: 'Administrador global',
    email: E2E_EMAIL.admin,
    role: UserRoleTypes.ADMIN,
    status: UserStatusTypes.ACTIVE,
  });
  const outsider = await dataSource.getRepository(User).save({
    name: 'Usuario sin empresas',
    email: E2E_EMAIL.outsider,
    role: UserRoleTypes.USER,
    status: UserStatusTypes.ACTIVE,
  });
  const employeeA = await dataSource.getRepository(User).save({
    name: 'Empleado A',
    email: E2E_EMAIL.employeeA,
    role: UserRoleTypes.USER,
    status: UserStatusTypes.ACTIVE,
  });

  const roleRepository = dataSource.getRepository(EnterpriseRole);
  const administratorRoleA = await roleRepository.save({
    enterpriseId: enterpriseA.id,
    role: ENTERPRISE_ROLE_NAME_ADMINISTRATOR,
    permissions: ADMINISTRATOR_ROLE_PERMISSIONS,
  });
  const employeeRoleA = await roleRepository.save({
    enterpriseId: enterpriseA.id,
    role: ENTERPRISE_ROLE_NAME_EMPLOYEE,
    permissions: EMPLOYEE_ROLE_PERMISSIONS,
  });
  const administratorRoleB = await roleRepository.save({
    enterpriseId: enterpriseB.id,
    role: ENTERPRISE_ROLE_NAME_ADMINISTRATOR,
    permissions: ADMINISTRATOR_ROLE_PERMISSIONS,
  });
  const employeeRoleB = await roleRepository.save({
    enterpriseId: enterpriseB.id,
    role: ENTERPRISE_ROLE_NAME_EMPLOYEE,
    permissions: EMPLOYEE_ROLE_PERMISSIONS,
  });

  const linkA = await dataSource.getRepository(UserEnterprise).save({
    userId: userA.id,
    enterpriseId: enterpriseA.id,
    enterpriseRoleId: administratorRoleA.id,
    cardId: 1,
  });
  const linkB = await dataSource.getRepository(UserEnterprise).save({
    userId: userB.id,
    enterpriseId: enterpriseB.id,
    enterpriseRoleId: administratorRoleB.id,
    cardId: 1,
  });
  const linkEmployeeA = await dataSource.getRepository(UserEnterprise).save({
    userId: employeeA.id,
    enterpriseId: enterpriseA.id,
    enterpriseRoleId: employeeRoleA.id,
    cardId: 2,
  });

  const clientA = await dataSource.getRepository(Client).save({
    enterpriseId: enterpriseA.id,
    name: 'Cliente A',
    nif: 'C11111111',
  });
  const clientB = await dataSource.getRepository(Client).save({
    enterpriseId: enterpriseB.id,
    name: 'Cliente B',
    nif: 'C22222222',
  });

  const supplierA = await dataSource.getRepository(Supplier).save({
    enterpriseId: enterpriseA.id,
    name: 'Proveedor A',
    nif: 'P11111111',
  });
  const supplierB = await dataSource.getRepository(Supplier).save({
    enterpriseId: enterpriseB.id,
    name: 'Proveedor B',
    nif: 'P22222222',
  });

  const seriesA = await dataSource.getRepository(InvoiceSeries).save({
    enterpriseId: enterpriseA.id,
    series: 'A',
    description: 'Serie A',
  });
  const seriesB = await dataSource.getRepository(InvoiceSeries).save({
    enterpriseId: enterpriseB.id,
    series: 'B',
    description: 'Serie B',
  });

  const issuedDate = '2026-02-01';
  const invoiceA = await dataSource.getRepository(Invoice).save({
    clientId: clientA.id,
    seriesId: seriesA.id,
    name: 'Factura A',
    issuedDate,
    collectionDate: '2026-02-15',
    status: InvoiceStatus.DRAFT,
  });
  const invoiceB = await dataSource.getRepository(Invoice).save({
    clientId: clientB.id,
    seriesId: seriesB.id,
    name: 'Factura B',
    issuedDate,
    collectionDate: '2026-02-15',
    status: InvoiceStatus.DRAFT,
  });

  const quoteA = await dataSource.getRepository(Quote).save({
    clientId: clientA.id,
    name: 'Presupuesto A',
    issuedDate,
    formalizationDate: '2026-02-20',
    status: QuoteStatus.DRAFT,
    concepts: [],
  });
  const quoteB = await dataSource.getRepository(Quote).save({
    clientId: clientB.id,
    name: 'Presupuesto B',
    issuedDate,
    formalizationDate: '2026-02-20',
    status: QuoteStatus.DRAFT,
    concepts: [],
  });

  const spentA = await dataSource.getRepository(Spent).save({
    supplierId: supplierA.id,
    name: 'Gasto A',
    issuedDate,
    collectionDate: '2026-02-15',
    declarationDate: issuedDate,
    status: 'paid',
    file: true,
    concepts: [],
  });
  const spentB = await dataSource.getRepository(Spent).save({
    supplierId: supplierB.id,
    name: 'Gasto B',
    issuedDate,
    collectionDate: '2026-02-15',
    declarationDate: issuedDate,
    status: 'paid',
    file: true,
    concepts: [],
  });

  const itemCategoryA = await dataSource.getRepository(ItemCategory).save({
    enterpriseId: enterpriseA.id,
    name: 'Categoría A',
    description: 'Artículos de A',
  });
  const itemCategoryB = await dataSource.getRepository(ItemCategory).save({
    enterpriseId: enterpriseB.id,
    name: 'Categoría B',
    description: 'Artículos de B',
  });
  const itemA = await dataSource.getRepository(Item).save({
    itemCategoryId: itemCategoryA.id,
    name: 'Artículo A',
    description: 'Artículo de la empresa A',
    pricePvp: 10,
    lastPurchasePrice: 5,
    serialNumber: true,
    stock: false,
  });
  const itemB = await dataSource.getRepository(Item).save({
    itemCategoryId: itemCategoryB.id,
    name: 'Artículo B',
    description: 'Artículo de la empresa B',
    pricePvp: 20,
    lastPurchasePrice: 8,
    serialNumber: true,
    stock: false,
  });

  const invoiceConceptA = await dataSource.getRepository(InvoiceConcept).save({
    invoiceId: invoiceA.id,
    itemId: itemA.id,
    position: 0,
    name: 'Concepto A',
    basePrice: 10,
    vat: 21,
    irpf: 0,
    quantity: 2,
    supplied: false,
  });
  const invoiceConceptB = await dataSource.getRepository(InvoiceConcept).save({
    invoiceId: invoiceB.id,
    itemId: itemB.id,
    position: 0,
    name: 'Concepto B',
    basePrice: 20,
    vat: 21,
    irpf: 0,
    quantity: 2,
    supplied: false,
  });
  const invoiceConceptSerialA = await dataSource.getRepository(InvoiceConceptSerial).save({
    invoiceConceptId: invoiceConceptA.id,
    serialNumber: 'SN-A-1',
  });
  const invoiceConceptSerialB = await dataSource.getRepository(InvoiceConceptSerial).save({
    invoiceConceptId: invoiceConceptB.id,
    serialNumber: 'SN-B-1',
  });

  const recurrentA = await dataSource.getRepository(RecurrentEarning).save({
    enterpriseId: enterpriseA.id,
    invoiceSerieId: seriesA.id,
    clientId: clientA.id,
    type: RecurrentEarningType.MONTHLY,
    name: 'Cuota A',
    concepts: [],
  });
  const recurrentB = await dataSource.getRepository(RecurrentEarning).save({
    enterpriseId: enterpriseB.id,
    invoiceSerieId: seriesB.id,
    clientId: clientB.id,
    type: RecurrentEarningType.MONTHLY,
    name: 'Cuota B',
    concepts: [],
  });

  const holidayA = await dataSource.getRepository(Holiday).save({
    enterpriseId: enterpriseA.id,
    name: 'Festivo A',
    calendarDate: '2026-12-25',
  });
  const holidayB = await dataSource.getRepository(Holiday).save({
    enterpriseId: enterpriseB.id,
    name: 'Festivo B',
    calendarDate: '2026-12-26',
  });

  const defaultScheduleA = await dataSource.getRepository(DefaultSchedule).save({
    enterpriseId: enterpriseA.id,
    name: 'Horario A',
    schedule: { weekdays: {} },
  });
  const defaultScheduleB = await dataSource.getRepository(DefaultSchedule).save({
    enterpriseId: enterpriseB.id,
    name: 'Horario B',
    schedule: { weekdays: {} },
  });

  const signingA = await dataSource.getRepository(Signing).save({
    userEnterpriseId: linkA.id,
    action: SigningAction.START,
    moment: new Date('2026-04-13T08:00:00.000Z'),
  });
  const signingB = await dataSource.getRepository(Signing).save({
    userEnterpriseId: linkB.id,
    action: SigningAction.START,
    moment: new Date('2026-04-13T08:00:00.000Z'),
  });

  const vacationA = await dataSource.getRepository(Vacation).save({
    userEnterpriseId: linkA.id,
    name: 'Vacaciones A',
    calendarDate: '2026-08-01',
  });
  const vacationB = await dataSource.getRepository(Vacation).save({
    userEnterpriseId: linkB.id,
    name: 'Vacaciones B',
    calendarDate: '2026-08-02',
  });

  const workScheduleA = await dataSource.getRepository(WorkSchedule).save({
    userEnterpriseId: linkA.id,
    startsAt: new Date('2026-04-13T08:00:00.000Z'),
    endsAt: new Date('2026-04-13T16:00:00.000Z'),
  });
  const workScheduleB = await dataSource.getRepository(WorkSchedule).save({
    userEnterpriseId: linkB.id,
    startsAt: new Date('2026-04-13T08:00:00.000Z'),
    endsAt: new Date('2026-04-13T16:00:00.000Z'),
  });

  const aiRequestA = await dataSource.getRepository(AiRequest).save({
    enterpriseId: enterpriseA.id,
    correlationId: randomUUID(),
    promptTokens: 1,
    completionTokens: 1,
    totalTokens: 2,
    type: AiRequestType.GET_SPENT_ISSUER,
    message: 'prompt A',
    response: { name: 'A' },
  });
  const aiRequestB = await dataSource.getRepository(AiRequest).save({
    enterpriseId: enterpriseB.id,
    correlationId: randomUUID(),
    promptTokens: 1,
    completionTokens: 1,
    totalTokens: 2,
    type: AiRequestType.GET_SPENT_ISSUER,
    message: 'prompt B',
    response: { name: 'B' },
  });

  return {
    enterpriseA,
    enterpriseB,
    userA,
    userB,
    admin,
    outsider,
    employeeA,
    administratorRoleA,
    employeeRoleA,
    administratorRoleB,
    employeeRoleB,
    linkA,
    linkB,
    linkEmployeeA,
    clientA,
    clientB,
    supplierA,
    supplierB,
    seriesA,
    seriesB,
    invoiceA,
    invoiceB,
    invoiceConceptA,
    invoiceConceptB,
    invoiceConceptSerialA,
    invoiceConceptSerialB,
    quoteA,
    quoteB,
    spentA,
    spentB,
    itemCategoryA,
    itemCategoryB,
    itemA,
    itemB,
    recurrentA,
    recurrentB,
    holidayA,
    holidayB,
    defaultScheduleA,
    defaultScheduleB,
    signingA,
    signingB,
    vacationA,
    vacationB,
    workScheduleA,
    workScheduleB,
    aiRequestA,
    aiRequestB,
  };
}
