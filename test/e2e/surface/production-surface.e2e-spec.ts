import { NextFunction, Request, Response } from 'express';
import { coverDtoClass, invokeTypeOrmMetadataCallbacks } from 'src/test-utils/cover-data-classes';
import { Concept, SpentConcept } from 'src/models/Concept';
import { swaggerMiddleware } from 'src/middleware/swagger/swagger.middleware';
import { ClientResponseDto } from 'src/entities/client/dto/client-response.dto';
import { SupplierResponseDto } from 'src/entities/supplier/dto/supplier-response.dto';
import { InvoiceResponseDto } from 'src/entities/invoice/dto/invoice-response.dto';
import { QuoteResponseDto } from 'src/entities/quote/dto/quote-response.dto';
import { SpentResponseDto } from 'src/entities/spent/dto/spent-response.dto';
import { UserResponseDto } from 'src/entities/user/dto/user-response.dto';
import { CreateUserDto } from 'src/entities/user/dto/create-user.dto';
import { EnterpriseResponseDto } from 'src/entities/enterprise/dto/enterprise-response.dto';
import { HolidayResponseDto } from 'src/entities/holiday/dto/holiday-response.dto';
import { DefaultScheduleResponseDto } from 'src/entities/default-schedule/dto/default-schedule-response.dto';
import { VacationResponseDto } from 'src/entities/vacation/dto/vacation-response.dto';
import { WorkScheduleResponseDto } from 'src/entities/work-schedule/dto/work-schedule-response.dto';
import { SigningResponseDto } from 'src/entities/signing/dto/signing-response.dto';
import { SigningUpdateResponseDto } from 'src/entities/signing/dto/signing-update-response.dto';
import { AiRequestResponseDto } from 'src/entities/ai-request/dto/ai-request-response.dto';
import { RecurrentEarningResponseDto } from 'src/entities/recurrent-earning/dto/recurrent-earning-response.dto';
import { InvoiceSeriesResponseDto } from 'src/entities/invoice-series/dto/invoice-series-response.dto';
import { UserEnterpriseResponseDto } from 'src/entities/user/dto/user-enterprise-response.dto';
import { ActiveBillingSubscriptionResponseDto } from 'src/api/billing/dto/active-billing-subscription-response.dto';
import { BillingPerUnitProductWithPricesResponseDto } from 'src/api/billing/dto/billing-per-unit-product-with-prices-response.dto';
import { BillingPriceTierDto, BillingTieredProductWithPricesResponseDto, BillingTieredRecurringPriceDto } from 'src/api/billing/dto/billing-tiered-product-with-prices-response.dto';
import { CreateSigningDto } from 'src/api/signing/dto/create-signing.dto';
import { UpdateSigningDto } from 'src/api/signing/dto/update-signing.dto';
import { EnterpriseLogoUploadDto } from 'src/api/enterprise/dto/enterprise-logo-upload.dto';
import { SpentFileUploadDto } from 'src/api/spent/dto/spent-file-upload.dto';
import { SpentAiFileUploadDto } from 'src/api/spent/dto/spent-ai-file-upload.dto';
import { Client } from 'src/entities/client/client.entity';
import { Enterprise } from 'src/entities/enterprise/enterprise.entity';
import { User, UserRoleTypes, UserStatusTypes } from 'src/entities/user/user.entity';
import { SigningAction } from 'src/entities/signing/signing.entity';
import { startE2eWorld } from '@e2e/world';

describe('Superficie de producción (e2e) — DTOs, entidades y Swagger', () => {
  beforeAll(async () => {
    await startE2eWorld();
  });

  it('instancia DTOs, entidades y modelos de concepto', () => {
    coverDtoClass(ClientResponseDto, { id: 'c1', name: 'N', nif: 'X' });
    coverDtoClass(SupplierResponseDto, { id: 's1', name: 'N', nif: 'X' });
    coverDtoClass(InvoiceResponseDto, { id: 'i1', name: 'N' });
    coverDtoClass(QuoteResponseDto, { id: 'q1', name: 'N' });
    coverDtoClass(SpentResponseDto, { id: 'g1', name: 'N' });
    coverDtoClass(UserResponseDto, { id: 'u1', email: 'a@e2e.test', name: 'A' });
    coverDtoClass(CreateUserDto, {
      name: 'N',
      email: 'n@e2e.test',
      password: 'secret-password',
      userEnterprises: [],
      defaultScheduleId: null,
    });
    coverDtoClass(CreateUserDto, {
      name: 'N2',
      email: 'n2@e2e.test',
      defaultScheduleId: '00000000-0000-0000-0000-000000000001',
    });
    coverDtoClass(EnterpriseResponseDto, { id: 'e1', name: 'E', nif: 'A' });
    coverDtoClass(HolidayResponseDto, { id: 'h1', calendarDate: '2026-01-01' });
    coverDtoClass(DefaultScheduleResponseDto, { id: 'd1', name: 'H' });
    coverDtoClass(VacationResponseDto, { id: 'v1', calendarDate: '2026-01-01' });
    coverDtoClass(WorkScheduleResponseDto, { id: 'w1' });
    coverDtoClass(SigningResponseDto, { id: 'sg1' });
    coverDtoClass(SigningUpdateResponseDto, { id: 'su1' });
    coverDtoClass(AiRequestResponseDto, { id: 'ai1' });
    coverDtoClass(RecurrentEarningResponseDto, { id: 'r1', name: 'R' });
    coverDtoClass(InvoiceSeriesResponseDto, { id: 'is1', series: 'A' });
    coverDtoClass(UserEnterpriseResponseDto, { id: 'ue1' });
    coverDtoClass(ActiveBillingSubscriptionResponseDto, {
      subscriptionId: 'sub',
      status: 'active',
    });
    coverDtoClass(BillingPerUnitProductWithPricesResponseDto, { name: 'P', metadata: [], prices: [] });
    coverDtoClass(BillingTieredProductWithPricesResponseDto, { name: 'P', metadata: [], prices: [] });
    coverDtoClass(BillingPriceTierDto, { upTo: 10, unitAmount: 500, flatAmount: 0 });
    coverDtoClass(BillingTieredRecurringPriceDto, {
      priceId: 'price_1',
      currency: 'eur',
      interval: 'month',
      intervalCount: 1,
      usageType: 'licensed',
      unitAmount: 1000,
      billingScheme: 'tiered',
      tiersMode: 'graduated',
      tiers: [],
    });
    coverDtoClass(CreateSigningDto, {
      userEnterpriseId: 'x',
      action: SigningAction.START,
      durationInSeconds: 0,
    });
    coverDtoClass(UpdateSigningDto, { action: SigningAction.END, durationInSeconds: 10 });
    coverDtoClass(EnterpriseLogoUploadDto, {});
    coverDtoClass(SpentFileUploadDto, {});
    coverDtoClass(SpentAiFileUploadDto, {});

    Object.assign(new Client(), { name: 'C', nif: 'N', enterpriseId: 'e' });
    Object.assign(new Enterprise(), { name: 'E', nif: 'N', email: 'e@e2e.test' });
    Object.assign(new User(), {
      name: 'U',
      email: 'u@e2e.test',
      role: UserRoleTypes.USER,
      status: UserStatusTypes.ACTIVE,
    });
    invokeTypeOrmMetadataCallbacks();

    const concept = new Concept();
    expect(concept.quantity).toBe(0);
    const spentConcept = new SpentConcept();
    expect(spentConcept.percentage).toBe(100);
  });

  it('cubre el middleware Basic de Swagger (sin header, esquema incorrecto, credenciales mal y bien)', () => {
    const response = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
    const nextFunction = jest.fn() as jest.MockedFunction<NextFunction>;

    swaggerMiddleware({ headers: {} } as Request, response as unknown as Response, nextFunction);
    expect(response.status).toHaveBeenCalledWith(401);

    swaggerMiddleware(
      { headers: { authorization: 'Bearer x' } } as Request,
      response as unknown as Response,
      nextFunction,
    );
    expect(nextFunction).not.toHaveBeenCalled();

    swaggerMiddleware(
      { headers: { authorization: `Basic ${Buffer.from('bad:bad').toString('base64')}` } } as Request,
      response as unknown as Response,
      nextFunction,
    );
    expect(response.send).toHaveBeenCalledWith('Credenciales inválidas.');

    swaggerMiddleware(
      { headers: { authorization: `Basic ${Buffer.from('admin:admin').toString('base64')}` } } as Request,
      response as unknown as Response,
      nextFunction,
    );
    expect(nextFunction).toHaveBeenCalled();
  });
});
