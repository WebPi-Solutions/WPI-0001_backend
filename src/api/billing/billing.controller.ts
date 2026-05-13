import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { ActiveBillingSubscriptionResponseDto } from './dto/active-billing-subscription-response.dto';
import { BillingProductForSubscriptionResponseDto } from './dto/billing-product-for-subscription-response.dto';
import { BillingPerUnitProductWithPricesResponseDto } from './dto/billing-per-unit-product-with-prices-response.dto';
import { BillingTieredProductWithPricesResponseDto } from './dto/billing-tiered-product-with-prices-response.dto';
import { ActiveBillingSubscriptionResponseMapper } from './mappers/active-billing-subscription-response.mapper';
import { MapResponse } from 'src/common/decorators/map-response.decorator';

/**
 * Endpoints REST de facturación (delegación en Stripe desde el backend).
 */
@ApiTags('Facturación')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  /**
   * Lista suscripciones Stripe en estado activo o en prueba para las empresas del usuario autenticado.
   * El frontend no llama a Stripe directamente: solo actúa como cliente HTTP de este endpoint.
   *
   * @param request - Petición HTTP con `user` poblado por el middleware de Firebase
   * @param enterpriseId - Opcional: acota la consulta a una empresa concreta (debe existir vínculo)
   * @returns Lista con estado, producto (nombre y metadatos), periodo actual, uso, renovación y cancelación al finalizar (mapeada vía {@link ActiveBillingSubscriptionResponseMapper})
   */
  @Get('active-subscriptions')
  @MapResponse(ActiveBillingSubscriptionResponseDto)
  @ApiBearerAuth('auth_token')
  @ApiOperation({
    summary:
      'Obtener suscripciones Stripe activas o en prueba del usuario autenticado',
    description:
      'Agrega las suscripciones de todas las empresas vinculadas que tengan `stripeId`, salvo que se indique `enterpriseId`.',
  })
  @ApiQuery({
    name: 'enterpriseId',
    required: false,
    description:
      'UUID de empresa. Si se envía, solo se consultan suscripciones del cliente Stripe de esa empresa y debe existir vínculo usuario–empresa.',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de suscripciones (puede ser vacío si no hay cliente Stripe o suscripciones).',
    type: [ActiveBillingSubscriptionResponseDto],
  })
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  @ApiResponse({
    status: 403,
    description: 'El usuario no está vinculado a la empresa indicada en el filtro.',
  })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado en base de datos.' })
  async getActiveSubscriptions(
    @Req() request: Request,
    @Query('enterpriseId') enterpriseId?: string,
  ): Promise<ActiveBillingSubscriptionResponseDto[]> {
    if (!request.user?.id) {
      throw new UnauthorizedException('Usuario no autenticado');
    }
    const presentations =
      await this.billingService.getActiveSubscriptionsPresentationForAuthenticatedUser(
        request.user.id,
        enterpriseId,
      );
    return ActiveBillingSubscriptionResponseMapper.toResponseDtos(presentations);
  }

  /**
   * Lista productos Stripe activos filtrados por clave de metadato y, opcionalmente, por valor.
   * Se usa para que el frontend pueda ofrecer un CTA de alta de suscripción cuando no exista una activa.\n+   *
   * @param request - Petición HTTP con usuario autenticado\n+   * @param metadataKey - Clave de metadato (p. ej. `type` o `product_type`)\n+   * @param metadataValue - Valor opcional (p. ej. `signings`, `management`)\n+   */
  @Get('products-by-metadata')
  @MapResponse(BillingProductForSubscriptionResponseDto)
  @ApiBearerAuth('auth_token')
  @ApiOperation({
    summary: 'Listar productos Stripe por metadatos',
    description:
      'Devuelve productos Stripe activos cuyo `metadata[metadataKey]` coincide (y, si se informa, cuyo valor coincide).',
  })
  @ApiQuery({
    name: 'metadataKey',
    required: true,
    description: 'Clave del metadato del producto en Stripe.',
    example: 'type',
  })
  @ApiQuery({
    name: 'metadataValue',
    required: false,
    description: 'Valor del metadato (si se quiere filtrar por valor exacto).',
    example: 'signings',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de productos (puede ser vacía).',
    type: [BillingProductForSubscriptionResponseDto],
  })
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  async getProductsByMetadata(
    @Req() request: Request,
    @Query('metadataKey') metadataKey: string,
    @Query('metadataValue') metadataValue?: string,
  ): Promise<BillingProductForSubscriptionResponseDto[]> {
    if (!request.user?.id) {
      throw new UnauthorizedException('Usuario no autenticado');
    }
    return this.billingService.getActiveProductsByMetadataForAuthenticatedUser({
      authenticatedUserId: request.user.id,
      metadataKey,
      metadataValue,
    });
  }

  /**
   * Catálogo estático de productos **fichajes** (`signings`) con precios recurrentes y escalones.
   * Equivale a filtrar por metadato `type`/`product_type` = `signings`, con contrato orientado a tramos.
   *
   * @param request - Petición HTTP con usuario autenticado
   */
  @Get('products-signings-with-prices')
  @MapResponse(BillingTieredProductWithPricesResponseDto)
  @ApiBearerAuth('auth_token')
  @ApiOperation({
    summary: 'Catálogo fichajes con precios (por tramos)',
    description:
      'Devuelve productos activos del módulo fichajes y sus precios recurrentes (mes/año) con escalones cuando existan en Stripe.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de productos con precios por tramos (puede ser vacía).',
    type: [BillingTieredProductWithPricesResponseDto],
  })
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  async getProductsSigningsWithPrices(
    @Req() request: Request,
  ): Promise<BillingTieredProductWithPricesResponseDto[]> {
    if (!request.user?.id) {
      throw new UnauthorizedException('Usuario no autenticado');
    }
    return this.billingService.getActiveSigningsProductsWithTieredRecurringPricesForAuthenticatedUser(
      request.user.id,
    );
  }

  /**
   * Catálogo estático de productos **gestión** (`management`) con precios recurrentes por unidad (sin tramos).
   *
   * @param request - Petición HTTP con usuario autenticado
   */
  @Get('products-management-with-prices')
  @MapResponse(BillingPerUnitProductWithPricesResponseDto)
  @ApiBearerAuth('auth_token')
  @ApiOperation({
    summary: 'Catálogo gestión con precios (por unidad)',
    description:
      'Devuelve productos activos del módulo gestión y sus precios recurrentes (mes/año) sin estructura de escalones.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de productos con precios por unidad (puede ser vacía).',
    type: [BillingPerUnitProductWithPricesResponseDto],
  })
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  async getProductsManagementWithPrices(
    @Req() request: Request,
  ): Promise<BillingPerUnitProductWithPricesResponseDto[]> {
    if (!request.user?.id) {
      throw new UnauthorizedException('Usuario no autenticado');
    }
    return this.billingService.getActiveManagementProductsWithPerUnitRecurringPricesForAuthenticatedUser(
      request.user.id,
    );
  }

  /**
   * Crea una sesión de Stripe Checkout para iniciar una suscripción.\n+   * El frontend debe redirigir a la URL devuelta.\n+   *
   * @param request - Petición HTTP autenticada\n+   * @param body - Empresa, precio y URLs de retorno\n+   */
  @Post('create-subscription-checkout-session')
  @ApiBearerAuth('auth_token')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        enterpriseId: {
          type: 'string',
          example: '9a0f8b0a-0000-0000-0000-000000000000',
        },
        priceId: { type: 'string', example: 'price_1234567890abcdef' },
        successUrl: { type: 'string', example: 'https://app.example.com/subscriptions?success=1' },
        cancelUrl: { type: 'string', example: 'https://app.example.com/subscriptions?cancelled=1' },
      },
      required: ['enterpriseId', 'priceId', 'successUrl', 'cancelUrl'],
    },
  })
  @ApiOperation({
    summary: 'Crear sesión de Checkout para suscripción',
    description:
      'Crea una sesión de Stripe Checkout en modo suscripción usando el `priceId` indicado.',
  })
  @ApiResponse({
    status: 201,
    description: 'URL de Checkout creada.',
    schema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
  })
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  @ApiResponse({ status: 403, description: 'Sin acceso a la empresa indicada.' })
  @ApiResponse({ status: 404, description: 'Empresa sin cliente Stripe o parámetros inválidos.' })
  async createSubscriptionCheckoutSession(
    @Req() request: Request,
    @Body()
    body: {
      enterpriseId: string;
      priceId: string;
      successUrl: string;
      cancelUrl: string;
      quantity?: number;
    },
  ): Promise<{ url: string }> {
    if (!request.user?.id) {
      throw new UnauthorizedException('Usuario no autenticado');
    }
    return this.billingService.createSubscriptionCheckoutSessionForAuthenticatedUser(
      {
        authenticatedUserId: request.user.id,
        enterpriseId: body.enterpriseId,
        priceId: body.priceId,
        successUrl: body.successUrl,
        cancelUrl: body.cancelUrl,
        quantity: body.quantity,
      },
    );
  }

  /**
   * Modifica una suscripción existente cambiando su precio principal (mensual/anual u otras variantes).\n+   *
   * @param request - Petición HTTP autenticada\n+   * @param body - Empresa, suscripción y nuevo `priceId`\n+   */
  @Post('update-subscription-price')
  @HttpCode(204)
  @ApiBearerAuth('auth_token')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        enterpriseId: {
          type: 'string',
          example: '9a0f8b0a-0000-0000-0000-000000000000',
        },
        subscriptionId: { type: 'string', example: 'sub_1234567890abcdef' },
        newPriceId: { type: 'string', example: 'price_1234567890abcdef' },
        quantity: {
          type: 'number',
          example: 20,
          description:
            'Cantidad del ítem principal (licencias / unidades). Obligatoria para cambiar de tramo con el mismo `priceId` (precios por escalones).',
        },
      },
      required: ['enterpriseId', 'subscriptionId', 'newPriceId'],
    },
  })
  @ApiOperation({
    summary: 'Modificar suscripción (cambiar precio o cantidad)',
    description:
      'Cambia el `priceId` del ítem principal y, para precios licenciados, la cantidad. ' +
      'Si se amplía el cupo (o se cambia de plan sin reducir cupo), Stripe factura el prorrateo al momento (`always_invoice`). ' +
      'Si se reduce el cupo, no hay reembolso: el nuevo cupo queda programado para el inicio del siguiente ciclo mediante un calendario de suscripción.',
  })
  @ApiResponse({ status: 204, description: 'Suscripción modificada correctamente.' })
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  @ApiResponse({ status: 403, description: 'Sin acceso a la empresa indicada.' })
  @ApiResponse({ status: 404, description: 'Suscripción no encontrada o empresa sin cliente Stripe.' })
  async updateSubscriptionPrice(
    @Req() request: Request,
    @Body()
    body: { enterpriseId: string; subscriptionId: string; newPriceId: string; quantity?: number },
  ): Promise<void> {
    if (!request.user?.id) {
      throw new UnauthorizedException('Usuario no autenticado');
    }
    await this.billingService.updateSubscriptionPriceForAuthenticatedUser({
      authenticatedUserId: request.user.id,
      enterpriseId: body.enterpriseId,
      subscriptionId: body.subscriptionId,
      newPriceId: body.newPriceId,
      quantity: body.quantity,
    });
  }

  /**
   * Marca una suscripción activa para cancelarse al finalizar el periodo actual.
   * No cancela de inmediato: configura `cancel_at_period_end = true` en Stripe.
   *
   * @param request - Petición HTTP con `user` poblado por el middleware de Firebase
   * @param body - Cuerpo con `subscriptionId` y `enterpriseId` opcional para validar el vínculo
   */
  @Post('cancel-subscription-at-period-end')
  @HttpCode(204)
  @ApiBearerAuth('auth_token')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        subscriptionId: { type: 'string', example: 'sub_1234567890abcdef' },
        enterpriseId: {
          type: 'string',
          example: '9a0f8b0a-0000-0000-0000-000000000000',
          description:
            'UUID de empresa para validar el vínculo usuario–empresa antes de cancelar.',
        },
      },
      required: ['subscriptionId'],
    },
  })
  @ApiOperation({
    summary: 'Cancelar suscripción al finalizar el periodo',
    description:
      'Marca una suscripción Stripe para cancelarse al finalizar el periodo actual (cancel_at_period_end = true).',
  })
  @ApiResponse({ status: 204, description: 'Cancelación programada correctamente.' })
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  @ApiResponse({ status: 403, description: 'Sin acceso a la empresa indicada.' })
  @ApiResponse({ status: 404, description: 'Suscripción no encontrada o usuario no válido.' })
  async cancelSubscriptionAtPeriodEnd(
    @Req() request: Request,
    @Body() body: { subscriptionId: string; enterpriseId?: string },
  ): Promise<void> {
    if (!request.user?.id) {
      throw new UnauthorizedException('Usuario no autenticado');
    }
    await this.billingService.cancelActiveSubscriptionAtPeriodEndForAuthenticatedUser(
      request.user.id,
      body.subscriptionId,
      body.enterpriseId,
    );
  }

  /**
   * Revoca una cancelación programada: vuelve a dejar la suscripción activa sin `cancel_at_period_end`.
   *
   * @param request - Petición HTTP con `user` poblado por el middleware de Firebase
   * @param body - Cuerpo con `subscriptionId` y `enterpriseId` opcional para validar el vínculo
   */
  @Post('revoke-cancel-subscription-at-period-end')
  @HttpCode(204)
  @ApiBearerAuth('auth_token')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        subscriptionId: { type: 'string', example: 'sub_1234567890abcdef' },
        enterpriseId: {
          type: 'string',
          example: '9a0f8b0a-0000-0000-0000-000000000000',
          description:
            'UUID de empresa para validar el vínculo usuario–empresa antes de revocar.',
        },
      },
      required: ['subscriptionId'],
    },
  })
  @ApiOperation({
    summary: 'Revocar cancelación al finalizar el periodo',
    description:
      'Revoca la cancelación programada y vuelve a dejar `cancel_at_period_end = false` en Stripe.',
  })
  @ApiResponse({ status: 204, description: 'Cancelación revocada correctamente.' })
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  @ApiResponse({ status: 403, description: 'Sin acceso a la empresa indicada.' })
  @ApiResponse({ status: 404, description: 'Suscripción no encontrada o usuario no válido.' })
  async revokeCancelSubscriptionAtPeriodEnd(
    @Req() request: Request,
    @Body() body: { subscriptionId: string; enterpriseId?: string },
  ): Promise<void> {
    if (!request.user?.id) {
      throw new UnauthorizedException('Usuario no autenticado');
    }
    await this.billingService.revokeCancelActiveSubscriptionAtPeriodEndForAuthenticatedUser(
      request.user.id,
      body.subscriptionId,
      body.enterpriseId,
    );
  }
}
