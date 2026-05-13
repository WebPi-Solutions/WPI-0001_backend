import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { UserRepository } from 'src/entities/user/user-repository.service';
import { StripeService } from 'src/services/stripe/stripe.service';
import { BillingSubscriptionPresentation } from './types/billing-subscription-presentation';

/**
 * Lógica de negocio para facturación y consultas de suscripciones vía Stripe.
 * Orquesta llamadas a {@link StripeService}, resuelve nombres de producto y construye
 * las presentaciones consumidas por el controlador y el mapper de respuesta.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly stripeService: StripeService,
  ) {}

  /**
   * Lista productos Stripe activos filtrando por una clave de metadato y, opcionalmente, por su valor.
   * Devuelve únicamente productos con `default_price` presente para poder crear suscripción vía Checkout.
   *
   * @param authenticatedUserId - Usuario autenticado (`req.user.id`) usado solo para trazas y consistencia de permisos
   * @param metadataKey - Clave del metadato a filtrar (p. ej. `type`)
   * @param metadataValue - Valor exacto opcional (p. ej. `signings`)
   * @returns Lista de productos (id, nombre, metadatos normalizados y precio por defecto)
   */
  async getActiveProductsByMetadataForAuthenticatedUser(params: {
    authenticatedUserId: string;
    metadataKey: string;
    metadataValue?: string;
  }): Promise<
    Array<{
      productId: string;
      name: string;
      metadata: Array<{ key: string; value: string }>;
      defaultPriceId: string;
    }>
  > {
    const metadataKey = params.metadataKey?.trim();
    const metadataValue = params.metadataValue?.trim() || '';

    if (!metadataKey) {
      return [];
    }

    if (!this.stripeService.isStripeConfigured()) {
      this.logger.warn(
        'Stripe no está configurado; se devuelve lista vacía de productos.',
      );
      return [];
    }

    this.logger.log(
      `Consulta de productos por metadato key=${metadataKey}` +
        (metadataValue ? ` value=${metadataValue}` : '') +
        ` (usuario ${params.authenticatedUserId})`,
    );

    const catalogProducts = await this.stripeService.getAllProducts(true);
    const normalizedKey = metadataKey.toLowerCase();
    const normalizedValue = metadataValue.toLowerCase();

    const matches = catalogProducts.filter((product) => {
      const record = (product.metadata ?? {}) as Record<string, unknown>;
      const rawValue = record[metadataKey] ?? record[normalizedKey];
      if (rawValue === undefined || rawValue === null) {
        // Stripe metadata es case-sensitive; se intenta también búsqueda case-insensitive por claves existentes
        const foundKey = Object.keys(record).find(
          (key) => key.trim().toLowerCase() === normalizedKey,
        );
        if (!foundKey) {
          return false;
        }
        const foundValue = String(record[foundKey] ?? '').trim();
        return normalizedValue ? foundValue.toLowerCase() === normalizedValue : true;
      }
      const coerced = String(rawValue ?? '').trim();
      return normalizedValue ? coerced.toLowerCase() === normalizedValue : true;
    });

    const enriched = await Promise.all(
      matches.map(async (product) => {
        try {
          const expanded = await this.stripeService.getProductWithDefaultPriceExpanded(
            product.id,
          );
          const defaultPriceId =
            StripeService.extractDefaultPriceIdFromProduct(expanded);
          if (!defaultPriceId) {
            this.logger.warn(
              `Producto Stripe ${expanded.id} coincide con filtro pero no tiene default_price; se omite.`,
            );
            return null;
          }
          return {
            productId: expanded.id,
            name: expanded.name?.trim() || 'Producto sin nombre',
            metadata: StripeService.normalizeStripeMetadataToSortedEntries(
              expanded.metadata,
            ),
            defaultPriceId,
          };
        } catch (error) {
          this.logger.warn(
            `No se pudo enriquecer producto Stripe ${product.id} para respuesta de alta de suscripción: ${error instanceof Error ? error.message : error}`,
          );
          return null;
        }
      }),
    );

    return enriched
      .filter(
        (item): item is NonNullable<typeof item> =>
          item !== null && Boolean(item.productId),
      )
      .sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }),
      );
  }

  /**
   * Resuelve productos Stripe activos para un módulo de catálogo (`signings` | `management`),
   * probando primero el metadato `type` y, si no hay coincidencias, `product_type`.
   *
   * @param authenticatedUserId - Usuario autenticado (trazas y consistencia de permisos)
   * @param billingModuleType - Valor esperado del metadato (`signings` o `management`)
   * @returns Lista de productos sin precios (solo identidad y metadatos)
   */
  private async resolveActiveProductsForBillingModuleType(params: {
    authenticatedUserId: string;
    billingModuleType: string;
  }): Promise<
    Array<{
      productId: string;
      name: string;
      metadata: Array<{ key: string; value: string }>;
    }>
  > {
    const billingModuleType = params.billingModuleType?.trim();
    if (!billingModuleType) {
      return [];
    }

    let products = await this.getActiveProductsByMetadataForAuthenticatedUser({
      authenticatedUserId: params.authenticatedUserId,
      metadataKey: 'type',
      metadataValue: billingModuleType,
    });

    if (!products.length) {
      products = await this.getActiveProductsByMetadataForAuthenticatedUser({
        authenticatedUserId: params.authenticatedUserId,
        metadataKey: 'product_type',
        metadataValue: billingModuleType,
      });
    }

    return products.map((product) => ({
      productId: product.productId,
      name: product.name,
      metadata: product.metadata,
    }));
  }

  /**
   * Ordena precios recurrentes: primero mensual, luego anual; dentro del mismo intervalo por `intervalCount`.
   */
  private sortRecurringPriceRowsByInterval<
    T extends { interval: string; intervalCount: number },
  >(rows: T[]): T[] {
    return [...rows].sort((left, right) => {
      if (left.interval !== right.interval) {
        return left.interval === 'month' ? -1 : 1;
      }
      return left.intervalCount - right.intervalCount;
    });
  }

  /**
   * Construye la fila de precio **con escalones** a partir de un `Price` de Stripe.
   *
   * @param price - Objeto precio Stripe (debe ser recurrente)
   * @returns Objeto plano compatible con {@link BillingTieredRecurringPriceDto}
   */
  private buildTieredRecurringPriceRowFromStripePrice(price: Stripe.Price): {
    priceId: string;
    currency: string;
    interval: string;
    intervalCount: number;
    usageType: string | null;
    unitAmount: number | null;
    billingScheme: string;
    tiersMode: string | null;
    tiers: Array<{
      upTo: number | null;
      unitAmount: number | null;
      flatAmount: number | null;
    }>;
  } {
    return {
      priceId: price.id,
      currency: String(price.currency ?? '').toLowerCase(),
      interval: String(price.recurring?.interval ?? ''),
      intervalCount:
        Number.isFinite(price.recurring?.interval_count) &&
        (price.recurring?.interval_count ?? 0) > 0
          ? (price.recurring?.interval_count as number)
          : 1,
      usageType: price.recurring?.usage_type
        ? String(price.recurring.usage_type)
        : null,
      unitAmount:
        typeof price.unit_amount === 'number' ? price.unit_amount : null,
      billingScheme: String(price.billing_scheme ?? ''),
      tiersMode: price.tiers_mode ? String(price.tiers_mode) : null,
      tiers: Array.isArray(price.tiers)
        ? price.tiers.map((tier) => ({
            upTo: typeof tier.up_to === 'number' ? tier.up_to : null,
            unitAmount:
              typeof tier.unit_amount === 'number' ? tier.unit_amount : null,
            flatAmount:
              typeof tier.flat_amount === 'number' ? tier.flat_amount : null,
          }))
        : [],
    };
  }

  /**
   * Construye la fila de precio **por unidad** (sin tramos) a partir de un `Price` de Stripe.
   *
   * @param price - Objeto precio Stripe (debe ser recurrente)
   * @returns Objeto plano compatible con {@link BillingPerUnitRecurringPriceDto}
   */
  private buildPerUnitRecurringPriceRowFromStripePrice(price: Stripe.Price): {
    priceId: string;
    currency: string;
    interval: string;
    intervalCount: number;
    usageType: string | null;
    unitAmount: number | null;
    billingScheme: string;
  } {
    return {
      priceId: price.id,
      currency: String(price.currency ?? '').toLowerCase(),
      interval: String(price.recurring?.interval ?? ''),
      intervalCount:
        Number.isFinite(price.recurring?.interval_count) &&
        (price.recurring?.interval_count ?? 0) > 0
          ? (price.recurring?.interval_count as number)
          : 1,
      usageType: price.recurring?.usage_type
        ? String(price.recurring.usage_type)
        : null,
      unitAmount:
        typeof price.unit_amount === 'number' ? price.unit_amount : null,
      billingScheme: String(price.billing_scheme ?? ''),
    };
  }

  /**
   * Lista precios recurrentes mes/año de un producto y los proyecta al formato indicado.
   *
   * @param productId - `prod_...`
   * @param priceProjection - `tiered` incluye escalones; `per_unit` omite tramos del contrato
   */
  private async listSortedRecurringPricesForProduct(params: {
    productId: string;
    priceProjection: 'tiered' | 'per_unit';
  }): Promise<
    | Array<ReturnType<BillingService['buildTieredRecurringPriceRowFromStripePrice']>>
    | Array<ReturnType<BillingService['buildPerUnitRecurringPriceRowFromStripePrice']>>
  > {
    const prices = await this.stripeService.listActivePricesForProduct(
      params.productId,
    );
    const recurringOnly = prices
      .filter((price) => price.type === 'recurring' && price.recurring)
      .filter((price) => {
        const interval = price.recurring?.interval?.toString() ?? '';
        return interval === 'month' || interval === 'year';
      });

    if (params.priceProjection === 'tiered') {
      const mapped = recurringOnly.map((price) =>
        this.buildTieredRecurringPriceRowFromStripePrice(price),
      );
      return this.sortRecurringPriceRowsByInterval(mapped);
    }

    const mapped = recurringOnly.map((price) =>
      this.buildPerUnitRecurringPriceRowFromStripePrice(price),
    );
    return this.sortRecurringPriceRowsByInterval(mapped);
  }

  /**
   * Catálogo **fichajes**: productos `signings` con precios recurrentes y escalones (contrato por tramos).
   *
   * @param authenticatedUserId - Usuario autenticado
   */
  async getActiveSigningsProductsWithTieredRecurringPricesForAuthenticatedUser(
    authenticatedUserId: string,
  ): Promise<
    Array<{
      productId: string;
      name: string;
      metadata: Array<{ key: string; value: string }>;
      prices: Array<ReturnType<
        BillingService['buildTieredRecurringPriceRowFromStripePrice']
      >>;
    }>
  > {
    const products = await this.resolveActiveProductsForBillingModuleType({
      authenticatedUserId,
      billingModuleType: 'signings',
    });

    return Promise.all(
      products.map(async (product) => {
        try {
          const prices = (await this.listSortedRecurringPricesForProduct({
            productId: product.productId,
            priceProjection: 'tiered',
          })) as Array<
            ReturnType<BillingService['buildTieredRecurringPriceRowFromStripePrice']>
          >;
          return { ...product, prices };
        } catch (error) {
          this.logger.warn(
            `No se pudieron listar precios (fichajes) para producto ${product.productId}: ${
              error instanceof Error ? error.message : error
            }`,
          );
          return { ...product, prices: [] };
        }
      }),
    );
  }

  /**
   * Catálogo **gestión**: productos `management` con precios recurrentes por unidad (sin tramos en el contrato).
   *
   * @param authenticatedUserId - Usuario autenticado
   */
  async getActiveManagementProductsWithPerUnitRecurringPricesForAuthenticatedUser(
    authenticatedUserId: string,
  ): Promise<
    Array<{
      productId: string;
      name: string;
      metadata: Array<{ key: string; value: string }>;
      prices: Array<ReturnType<
        BillingService['buildPerUnitRecurringPriceRowFromStripePrice']
      >>;
    }>
  > {
    const products = await this.resolveActiveProductsForBillingModuleType({
      authenticatedUserId,
      billingModuleType: 'management',
    });

    return Promise.all(
      products.map(async (product) => {
        try {
          const prices = (await this.listSortedRecurringPricesForProduct({
            productId: product.productId,
            priceProjection: 'per_unit',
          })) as Array<
            ReturnType<BillingService['buildPerUnitRecurringPriceRowFromStripePrice']>
          >;
          return { ...product, prices };
        } catch (error) {
          this.logger.warn(
            `No se pudieron listar precios (gestión) para producto ${product.productId}: ${
              error instanceof Error ? error.message : error
            }`,
          );
          return { ...product, prices: [] };
        }
      }),
    );
  }

  /**
   * Crea una sesión de Checkout para iniciar una suscripción usando el `priceId` indicado.
   * Valida que el usuario está vinculado a la empresa, y que la empresa tiene `stripeId` (customer).\n+   *
   * @param authenticatedUserId - Usuario autenticado
   * @param enterpriseId - Empresa sobre la que se crea la suscripción (se valida vínculo)
   * @param priceId - Precio recurrente en Stripe (`price_...`)
   * @param successUrl - URL de retorno tras completar\n+   * @param cancelUrl - URL de retorno si cancela\n+   */
  async createSubscriptionCheckoutSessionForAuthenticatedUser(params: {
    authenticatedUserId: string;
    enterpriseId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    quantity?: number;
  }): Promise<{ url: string }> {
    if (!this.stripeService.isStripeConfigured()) {
      this.logger.warn(
        'Stripe no está configurado; no se puede iniciar Checkout en este entorno.',
      );
      throw new NotFoundException('Stripe no está disponible en este entorno.');
    }

    const enterpriseId = params.enterpriseId?.trim();
    const priceId = params.priceId?.trim();
    const successUrl = params.successUrl?.trim();
    const cancelUrl = params.cancelUrl?.trim();

    if (!enterpriseId || !priceId || !successUrl || !cancelUrl) {
      throw new NotFoundException('Parámetros inválidos para iniciar Checkout.');
    }

    const user = await this.userRepository.findById(params.authenticatedUserId, [
      'userEnterprises',
      'userEnterprises.enterprise',
    ]);

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const link = (user.userEnterprises ?? []).find(
      (candidate) =>
        candidate.enterpriseId === enterpriseId ||
        candidate.enterprise?.id === enterpriseId,
    );
    if (!link?.enterprise) {
      throw new ForbiddenException(
        'No tiene acceso a la empresa indicada para crear suscripciones.',
      );
    }

    const stripeCustomerId = link.enterprise.stripeId?.trim() || '';
    if (!stripeCustomerId) {
      throw new NotFoundException(
        'La empresa no tiene cliente de Stripe asociado todavía.',
      );
    }

    const url = await this.stripeService.createSubscriptionCheckoutSessionUrl({
      stripeCustomerId,
      priceId,
      successUrl,
      cancelUrl,
      metadata: {
        enterpriseId,
        authenticatedUserId: params.authenticatedUserId,
        priceId,
      },
      quantity: params.quantity,
    });

    return { url };
  }

  /**
   * Modifica una suscripción existente (`priceId` y/o cantidad licenciada).
   * Valida vínculo usuario–empresa y que la suscripción pertenece al cliente Stripe de esa empresa.
   *
   * La política de prorrateo efectiva la implementa {@link StripeService.updateSubscriptionPrimaryItemPrice}
   * (ampliación facturada al momento; reducción de cupo programada al siguiente ciclo sin abono).
   *
   * @param authenticatedUserId - Usuario autenticado
   * @param enterpriseId - Empresa sobre la que se valida el permiso
   * @param subscriptionId - Suscripción `sub_...` a modificar
   * @param newPriceId - Nuevo precio recurrente `price_...`
   * @param quantity - Cantidad licenciada objetivo (opcional)
   */
  async updateSubscriptionPriceForAuthenticatedUser(params: {
    authenticatedUserId: string;
    enterpriseId: string;
    subscriptionId: string;
    newPriceId: string;
    quantity?: number;
  }): Promise<void> {
    if (!this.stripeService.isStripeConfigured()) {
      this.logger.warn(
        'Stripe no está configurado; no se puede modificar la suscripción en este entorno.',
      );
      return;
    }

    const enterpriseId = params.enterpriseId?.trim();
    const subscriptionId = params.subscriptionId?.trim();
    const newPriceId = params.newPriceId?.trim();

    if (!enterpriseId || !subscriptionId || !newPriceId) {
      throw new NotFoundException('Parámetros inválidos para modificar suscripción.');
    }

    const user = await this.userRepository.findById(params.authenticatedUserId, [
      'userEnterprises',
      'userEnterprises.enterprise',
    ]);

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const link = (user.userEnterprises ?? []).find(
      (candidate) =>
        candidate.enterpriseId === enterpriseId ||
        candidate.enterprise?.id === enterpriseId,
    );
    if (!link?.enterprise) {
      throw new ForbiddenException(
        'No tiene acceso a la empresa indicada para modificar suscripciones.',
      );
    }

    const stripeCustomerId = link.enterprise.stripeId?.trim() || '';
    if (!stripeCustomerId) {
      throw new NotFoundException(
        'La empresa no tiene cliente de Stripe asociado todavía.',
      );
    }

    const subscriptions = await this.stripeService.getSubscriptionsByAccountId(
      stripeCustomerId,
    );
    const belongsToCustomer = subscriptions.some(
      (subscription) => subscription.id === subscriptionId,
    );
    if (!belongsToCustomer) {
      throw new NotFoundException('Suscripción no encontrada para la empresa indicada.');
    }

    await this.stripeService.updateSubscriptionPrimaryItemPrice({
      subscriptionId,
      newPriceId,
      quantity: params.quantity,
    });
  }

  /**
   * Obtiene las suscripciones Stripe en estados `active` o `trialing` para el usuario autenticado,
   * resuelve nombres de producto y devuelve presentaciones listas para mapear al DTO público.
   *
   * @param authenticatedUserId - UUID del usuario (`req.user.id`)
   * @param enterpriseIdFilter - Si se informa, solo se consulta la empresa indicada (debe estar vinculada)
   * @returns Lista de presentaciones (sin duplicar `subscription.id` entre clientes Stripe)
   */
  async getActiveSubscriptionsPresentationForAuthenticatedUser(
    authenticatedUserId: string,
    enterpriseIdFilter?: string,
  ): Promise<BillingSubscriptionPresentation[]> {
    this.logger.log(
      `Consulta de suscripciones activas para el usuario ${authenticatedUserId}` +
        (enterpriseIdFilter ? ` (empresa filtrada: ${enterpriseIdFilter})` : ''),
    );

    if (!this.stripeService.isStripeConfigured()) {
      this.logger.warn(
        'Stripe no está configurado; se devuelve lista vacía de suscripciones.',
      );
      return [];
    }

    const user = await this.userRepository.findById(authenticatedUserId, [
      'userEnterprises',
      'userEnterprises.enterprise',
    ]);

    if (!user) {
      this.logger.warn(
        `Usuario ${authenticatedUserId} no encontrado al resolver suscripciones`,
      );
      throw new NotFoundException('Usuario no encontrado');
    }

    const links = user.userEnterprises ?? [];

    if (enterpriseIdFilter) {
      const hasEnterpriseAccess = links.some(
        (link) =>
          link.enterpriseId === enterpriseIdFilter ||
          link.enterprise?.id === enterpriseIdFilter,
      );
      if (!hasEnterpriseAccess) {
        this.logger.warn(
          `Usuario ${authenticatedUserId} sin vínculo con la empresa ${enterpriseIdFilter}`,
        );
        throw new ForbiddenException(
          'No tiene acceso a la empresa indicada para consultar suscripciones.',
        );
      }
    }

    const customerTargets = this.buildStripeCustomerTargetsFromUserLinks(
      links,
      enterpriseIdFilter,
    );

    if (customerTargets.length === 0) {
      this.logger.log(
        'No hay clientes Stripe (`stripeId`) asociados a las empresas del usuario; nada que consultar.',
      );
      return [];
    }

    const mergedSubscriptions: Stripe.Subscription[] = [];
    const seenSubscriptionIds = new Set<string>();
    const subscriptionIdToEnterpriseId = new Map<string, string>();

    for (const target of customerTargets) {
      try {
        const subscriptions =
          await this.stripeService.getSubscriptionsByAccountId(
            target.stripeCustomerId,
          );
        for (const subscription of subscriptions) {
          if (seenSubscriptionIds.has(subscription.id)) {
            continue;
          }
          seenSubscriptionIds.add(subscription.id);
          mergedSubscriptions.push(subscription);
          subscriptionIdToEnterpriseId.set(subscription.id, target.enterpriseId);
        }
      } catch (error) {
        this.logger.error(
          `Fallo al obtener suscripciones para el cliente Stripe ${target.stripeCustomerId} (empresa ${target.enterpriseId})`,
          error instanceof Error ? error.stack : undefined,
        );
        throw error;
      }
    }

    const productIds = BillingService.collectUniqueProductIdsFromSubscriptions(
      mergedSubscriptions,
    );
    const { namesById: productNamesById, metadataById: productMetadataById } =
      await BillingService.resolveProductNamesAndMetadataWithCatalogAndRetrieval(
        this.stripeService,
        productIds,
      );

    const usedUnitsByEnterpriseId =
      await this.resolveUsedUnitsByEnterpriseId(subscriptionIdToEnterpriseId);

    const subscriptionSchedulesBySubscriptionId =
      mergedSubscriptions.length > 0
        ? await this.resolveSubscriptionSchedulesBySubscriptionId(mergedSubscriptions)
        : new Map<string, Stripe.SubscriptionSchedule>();

    const presentations = mergedSubscriptions.map((subscription) =>
      BillingService.buildPresentationForSubscription(
        subscription,
        productNamesById,
        productMetadataById,
        subscriptionIdToEnterpriseId.get(subscription.id) ?? null,
        usedUnitsByEnterpriseId,
        subscriptionSchedulesBySubscriptionId.get(subscription.id) ?? null,
      ),
    );

    this.logger.log(
      `Suscripciones activas/trial presentadas: ${presentations.length} para el usuario ${authenticatedUserId}`,
    );
    return presentations;
  }

  /**
   * Calcula las unidades consumidas (usuarios activos) por empresa para las suscripciones devueltas.
   *
   * @param subscriptionIdToEnterpriseId - Mapa suscripción → empresa
   * @returns Mapa empresa → unidades usadas
   */
  private async resolveUsedUnitsByEnterpriseId(
    subscriptionIdToEnterpriseId: Map<string, string>,
  ): Promise<Map<string, number>> {
    const uniqueEnterpriseIds = [
      ...new Set(
        [...subscriptionIdToEnterpriseId.values()]
          .map((id) => id?.trim())
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const usedByEnterprise = new Map<string, number>();

    await Promise.all(
      uniqueEnterpriseIds.map(async (enterpriseId) => {
        try {
          const used =
            await this.userRepository.countActiveNonSigningsUsersForEnterprise(
              enterpriseId,
            );
          usedByEnterprise.set(enterpriseId, used);
        } catch (error) {
          this.logger.warn(
            `No se pudo calcular unidades usadas (usuarios activos) para la empresa ${enterpriseId}: ${error instanceof Error ? error.message : error}`,
          );
          usedByEnterprise.set(enterpriseId, 0);
        }
      }),
    );

    return usedByEnterprise;
  }

  /**
   * Obtiene los calendarios de suscripción (`SubscriptionSchedule`) asociados a las suscripciones listadas,
   * en paralelo, para detectar reducciones de cupo licenciado programadas.
   *
   * @param subscriptions - Suscripciones Stripe con campo `schedule` (id u objeto)
   * @returns Mapa `subscription.id` → calendario recuperado
   */
  private async resolveSubscriptionSchedulesBySubscriptionId(
    subscriptions: Stripe.Subscription[],
  ): Promise<Map<string, Stripe.SubscriptionSchedule>> {
    const scheduleIdBySubscriptionId = new Map<string, string>();
    for (const subscription of subscriptions) {
      const scheduleReference = subscription.schedule;
      if (!scheduleReference) {
        continue;
      }
      const scheduleId =
        typeof scheduleReference === 'string'
          ? scheduleReference.trim()
          : scheduleReference.id?.trim() ?? '';
      if (scheduleId) {
        scheduleIdBySubscriptionId.set(subscription.id, scheduleId);
      }
    }

    const resolvedSchedulesBySubscriptionId = new Map<string, Stripe.SubscriptionSchedule>();
    await Promise.all(
      [...scheduleIdBySubscriptionId.entries()].map(
        async ([subscriptionId, scheduleId]) => {
          try {
            const schedule =
              await this.stripeService.retrieveSubscriptionSchedule(scheduleId);
            resolvedSchedulesBySubscriptionId.set(subscriptionId, schedule);
          } catch (error) {
            this.logger.warn(
              `No se pudo recuperar la programación de suscripción ${scheduleId} ` +
                `para la suscripción ${subscriptionId}: ${
                  error instanceof Error ? error.message : String(error)
                }`,
            );
          }
        },
      ),
    );

    return resolvedSchedulesBySubscriptionId;
  }

  /**
   * Marca una suscripción Stripe para cancelarse al finalizar el periodo actual (`cancel_at_period_end = true`),
   * validando que el usuario autenticado está vinculado a la empresa dueña del cliente Stripe al que pertenece.
   *
   * @param authenticatedUserId - UUID del usuario autenticado (`req.user.id`)
   * @param subscriptionId - Identificador Stripe `sub_...`
   * @param enterpriseIdFilter - Empresa contra la que se valida el permiso (normalmente empresa activa)
   */
  async cancelActiveSubscriptionAtPeriodEndForAuthenticatedUser(
    authenticatedUserId: string,
    subscriptionId: string,
    enterpriseIdFilter?: string,
  ): Promise<void> {
    this.logger.log(
      `Solicitud de cancelación al fin de periodo para suscripción ${subscriptionId} (usuario ${authenticatedUserId})` +
        (enterpriseIdFilter ? ` (empresa: ${enterpriseIdFilter})` : ''),
    );

    if (!this.stripeService.isStripeConfigured()) {
      this.logger.warn(
        'Stripe no está configurado; no se puede cancelar suscripción en este entorno.',
      );
      return;
    }

    const user = await this.userRepository.findById(authenticatedUserId, [
      'userEnterprises',
      'userEnterprises.enterprise',
    ]);

    if (!user) {
      this.logger.warn(
        `Usuario ${authenticatedUserId} no encontrado al cancelar suscripción`,
      );
      throw new NotFoundException('Usuario no encontrado');
    }

    const links = user.userEnterprises ?? [];
    if (enterpriseIdFilter) {
      const hasEnterpriseAccess = links.some(
        (link) =>
          link.enterpriseId === enterpriseIdFilter ||
          link.enterprise?.id === enterpriseIdFilter,
      );
      if (!hasEnterpriseAccess) {
        this.logger.warn(
          `Usuario ${authenticatedUserId} sin vínculo con la empresa ${enterpriseIdFilter} al cancelar suscripción`,
        );
        throw new ForbiddenException(
          'No tiene acceso a la empresa indicada para cancelar suscripciones.',
        );
      }
    }

    const customerTargets = this.buildStripeCustomerTargetsFromUserLinks(
      links,
      enterpriseIdFilter,
    );

    if (customerTargets.length === 0) {
      this.logger.warn(
        'El usuario no tiene clientes Stripe asociados; no se puede cancelar suscripción.',
      );
      throw new NotFoundException('No hay cliente de Stripe asociado a la empresa.');
    }

    const normalizedSubscriptionId = subscriptionId?.trim();
    if (!normalizedSubscriptionId) {
      throw new NotFoundException('Identificador de suscripción inválido.');
    }

    let isSubscriptionWithinAuthorizedCustomers = false;
    for (const target of customerTargets) {
      const subscriptions =
        await this.stripeService.getSubscriptionsByAccountId(
          target.stripeCustomerId,
        );
      if (subscriptions.some((subscription) => subscription.id === normalizedSubscriptionId)) {
        isSubscriptionWithinAuthorizedCustomers = true;
        break;
      }
    }

    if (!isSubscriptionWithinAuthorizedCustomers) {
      this.logger.warn(
        `Suscripción ${normalizedSubscriptionId} no encontrada en clientes Stripe autorizados para el usuario ${authenticatedUserId}`,
      );
      throw new NotFoundException('Suscripción no encontrada para la empresa indicada.');
    }

    await this.stripeService.cancelSubscriptionAtPeriodEnd(normalizedSubscriptionId);
  }

  /**
   * Revoca una cancelación programada al final del periodo (`cancel_at_period_end = false`) para una suscripción,
   * validando que el usuario autenticado está vinculado a la empresa dueña del cliente Stripe al que pertenece.
   *
   * @param authenticatedUserId - UUID del usuario autenticado (`req.user.id`)
   * @param subscriptionId - Identificador Stripe `sub_...`
   * @param enterpriseIdFilter - Empresa contra la que se valida el permiso (normalmente empresa activa)
   */
  async revokeCancelActiveSubscriptionAtPeriodEndForAuthenticatedUser(
    authenticatedUserId: string,
    subscriptionId: string,
    enterpriseIdFilter?: string,
  ): Promise<void> {
    this.logger.log(
      `Solicitud de revocación de cancelación al fin de periodo para suscripción ${subscriptionId} (usuario ${authenticatedUserId})` +
        (enterpriseIdFilter ? ` (empresa: ${enterpriseIdFilter})` : ''),
    );

    if (!this.stripeService.isStripeConfigured()) {
      this.logger.warn(
        'Stripe no está configurado; no se puede revocar cancelación en este entorno.',
      );
      return;
    }

    const user = await this.userRepository.findById(authenticatedUserId, [
      'userEnterprises',
      'userEnterprises.enterprise',
    ]);

    if (!user) {
      this.logger.warn(
        `Usuario ${authenticatedUserId} no encontrado al revocar cancelación`,
      );
      throw new NotFoundException('Usuario no encontrado');
    }

    const links = user.userEnterprises ?? [];
    if (enterpriseIdFilter) {
      const hasEnterpriseAccess = links.some(
        (link) =>
          link.enterpriseId === enterpriseIdFilter ||
          link.enterprise?.id === enterpriseIdFilter,
      );
      if (!hasEnterpriseAccess) {
        this.logger.warn(
          `Usuario ${authenticatedUserId} sin vínculo con la empresa ${enterpriseIdFilter} al revocar cancelación`,
        );
        throw new ForbiddenException(
          'No tiene acceso a la empresa indicada para revocar cancelaciones.',
        );
      }
    }

    const customerTargets = this.buildStripeCustomerTargetsFromUserLinks(
      links,
      enterpriseIdFilter,
    );

    if (customerTargets.length === 0) {
      this.logger.warn(
        'El usuario no tiene clientes Stripe asociados; no se puede revocar cancelación.',
      );
      throw new NotFoundException('No hay cliente de Stripe asociado a la empresa.');
    }

    const normalizedSubscriptionId = subscriptionId?.trim();
    if (!normalizedSubscriptionId) {
      throw new NotFoundException('Identificador de suscripción inválido.');
    }

    let isSubscriptionWithinAuthorizedCustomers = false;
    for (const target of customerTargets) {
      const subscriptions =
        await this.stripeService.getSubscriptionsByAccountId(
          target.stripeCustomerId,
        );
      if (
        subscriptions.some(
          (subscription) => subscription.id === normalizedSubscriptionId,
        )
      ) {
        isSubscriptionWithinAuthorizedCustomers = true;
        break;
      }
    }

    if (!isSubscriptionWithinAuthorizedCustomers) {
      this.logger.warn(
        `Suscripción ${normalizedSubscriptionId} no encontrada en clientes Stripe autorizados para el usuario ${authenticatedUserId} (revocación)`,
      );
      throw new NotFoundException('Suscripción no encontrada para la empresa indicada.');
    }

    await this.stripeService.revokeCancelSubscriptionAtPeriodEnd(
      normalizedSubscriptionId,
    );
  }

  /**
   * Construye la lista de pares empresa–cliente Stripe a consultar según los vínculos del usuario.
   *
   * @param links - Relaciones `user_enterprise` cargadas con `enterprise`
   * @param enterpriseIdFilter - Filtro opcional por empresa
   * @returns Lista de objetivos únicos por `stripeCustomerId` (conserva la primera empresa asociada)
   */
  private buildStripeCustomerTargetsFromUserLinks(
    links: Array<{
      enterpriseId: string;
      enterprise?: { id: string; stripeId?: string | null } | null;
    }>,
    enterpriseIdFilter?: string,
  ): Array<{ enterpriseId: string; stripeCustomerId: string }> {
    const uniqueByCustomer = new Map<
      string,
      { enterpriseId: string; stripeCustomerId: string }
    >();

    for (const link of links) {
      const enterprise = link.enterprise;
      if (!enterprise?.id) {
        continue;
      }
      if (enterpriseIdFilter && enterprise.id !== enterpriseIdFilter) {
        continue;
      }
      const stripeCustomerId = enterprise.stripeId?.trim();
      if (!stripeCustomerId) {
        continue;
      }
      if (!uniqueByCustomer.has(stripeCustomerId)) {
        uniqueByCustomer.set(stripeCustomerId, {
          enterpriseId: enterprise.id,
          stripeCustomerId,
        });
      }
    }

    return [...uniqueByCustomer.values()];
  }

  /**
   * Combina el catálogo de productos activos en Stripe con recuperaciones puntuales para ids ausentes,
   * devolviendo nombre y metadatos por producto en una sola pasada de catálogo.
   *
   * @param stripeService - Cliente Stripe de bajo nivel
   * @param productIds - Ids `prod_...` referenciados por las suscripciones
   * @returns Mapas id → nombre e id → metadatos ordenados
   */
  private static async resolveProductNamesAndMetadataWithCatalogAndRetrieval(
    stripeService: StripeService,
    productIds: string[],
  ): Promise<{
    namesById: Map<string, string>;
    metadataById: Map<string, Array<{ key: string; value: string }>>;
  }> {
    const mergedNames = new Map<string, string>();
    const mergedMetadata = new Map<string, Array<{ key: string; value: string }>>();
    const catalogProducts = await stripeService.getAllProducts(true);
    for (const product of catalogProducts) {
      mergedNames.set(product.id, product.name?.trim() || 'Producto sin nombre');
      mergedMetadata.set(
        product.id,
        StripeService.normalizeStripeMetadataToSortedEntries(product.metadata),
      );
    }
    const missingIds = productIds.filter((id) => !mergedNames.has(id));
    if (missingIds.length === 0) {
      return { namesById: mergedNames, metadataById: mergedMetadata };
    }
    const retrievedById =
      await stripeService.getProductNamesAndMetadataByIds(missingIds);
    for (const [productId, bundle] of retrievedById) {
      mergedNames.set(productId, bundle.name);
      mergedMetadata.set(productId, bundle.metadataEntries);
    }
    return { namesById: mergedNames, metadataById: mergedMetadata };
  }

  /**
   * Recorre todas las líneas de ítems de las suscripciones y devuelve ids de producto únicos.
   *
   * @param subscriptions - Suscripciones Stripe ya cargadas con precios
   * @returns Lista de `prod_...` sin duplicados
   */
  private static collectUniqueProductIdsFromSubscriptions(
    subscriptions: Stripe.Subscription[],
  ): string[] {
    const unique = new Set<string>();
    for (const subscription of subscriptions) {
      for (const item of subscription.items?.data ?? []) {
        const productId = BillingService.extractProductIdFromSubscriptionItem(
          item,
        );
        if (productId) {
          unique.add(productId);
        }
      }
    }
    return [...unique];
  }

  /**
   * Obtiene el id de producto Stripe desde un ítem de suscripción (`price.product`).
   *
   * @param item - Ítem de suscripción Stripe
   * @returns `prod_...` o `null` si no se puede resolver
   */
  private static extractProductIdFromSubscriptionItem(
    item: Stripe.SubscriptionItem,
  ): string | null {
    const price = item.price;
    if (!price || typeof price === 'string') {
      return null;
    }
    const product = price.product;
    if (typeof product === 'string') {
      return product.trim() || null;
    }
    if (product && typeof product === 'object') {
      if ('deleted' in product && (product as { deleted?: boolean }).deleted) {
        return null;
      }
      return (product as Stripe.Product).id ?? null;
    }
    return null;
  }

  /**
   * Id de producto de la primera línea de la suscripción (producto “principal” mostrado al usuario).
   *
   * @param subscription - Suscripción Stripe
   */
  private static extractPrimaryProductId(
    subscription: Stripe.Subscription,
  ): string | null {
    const firstItem = subscription.items?.data?.[0];
    if (!firstItem) {
      return null;
    }
    return BillingService.extractProductIdFromSubscriptionItem(firstItem);
  }

  /**
   * Si el precio ya trae el producto expandido con nombre, lo devuelve (evita id en UI).
   *
   * @param subscription - Suscripción Stripe
   * @returns Nombre legible o `null`
   */
  private static extractInlineProductNameFromSubscription(
    subscription: Stripe.Subscription,
  ): string | null {
    const firstItem = subscription.items?.data?.[0];
    const price = firstItem?.price;
    if (!price || typeof price === 'string') {
      return null;
    }
    const product = price.product;
    if (product && typeof product === 'object') {
      if ('deleted' in product && (product as { deleted?: boolean }).deleted) {
        return null;
      }
      const stripeProduct = product as Stripe.Product;
      const name = stripeProduct.name?.trim();
      return name || null;
    }
    return null;
  }

  /**
   * Si el precio ya trae el producto expandido, devuelve sus metadatos como entradas ordenadas.
   * Si el producto no está expandido (solo id), devuelve `null` para resolver desde el catálogo.
   *
   * @param subscription - Suscripción Stripe
   * @returns Lista de metadatos o `null` si no hay producto expandido
   */
  private static extractInlineProductMetadataFromSubscription(
    subscription: Stripe.Subscription,
  ): Array<{ key: string; value: string }> | null {
    const firstItem = subscription.items?.data?.[0];
    const price = firstItem?.price;
    if (!price || typeof price === 'string') {
      return null;
    }
    const product = price.product;
    if (!product || typeof product === 'string') {
      return null;
    }
    if ('deleted' in product && (product as { deleted?: boolean }).deleted) {
      return null;
    }
    const stripeProduct = product as Stripe.Product;
    return StripeService.normalizeStripeMetadataToSortedEntries(
      stripeProduct.metadata,
    );
  }

  /**
   * Convierte epoch en segundos a ISO 8601 UTC.
   *
   * @param secondsSinceEpoch - Valor Stripe `current_period_*`
   */
  private static secondsToIso8601(seconds: number | undefined): string {
    if (!Number.isFinite(seconds)) {
      return new Date(0).toISOString();
    }
    return new Date((seconds as number) * 1000).toISOString();
  }

  /**
   * Si el calendario de Stripe define una fase posterior con menos licencias que el periodo actual,
   * expone la fecha efectiva y el nuevo tope (para mostrar aviso en el cliente).
   *
   * @param subscription - Suscripción con cantidad actual del ítem principal
   * @param schedule - Calendario recuperado (`SubscriptionSchedule`)
   * @returns Resumen o `null` si no hay reducción programada reconocible
   */
  private static resolveScheduledLicensedQuotaReductionSummary(params: {
    subscription: Stripe.Subscription;
    schedule: Stripe.SubscriptionSchedule | null;
  }): {
    nextMaxUsers: number;
    effectiveAtIso: string;
  } | null {
    const schedule = params.schedule;
    if (!schedule?.phases || schedule.phases.length < 2) {
      return null;
    }
    const primaryItem = params.subscription.items?.data?.[0];
    const currentLicensedMax = Number.isFinite(primaryItem?.quantity)
      ? Math.floor(Number(primaryItem?.quantity))
      : 0;
    if (currentLicensedMax <= 0) {
      return null;
    }
    const phasesSorted = [...schedule.phases].sort(
      (leftPhase, rightPhase) =>
        Number(leftPhase.start_date ?? 0) - Number(rightPhase.start_date ?? 0),
    );
    const upcomingPhase = phasesSorted[1];
    const nextQuantityRaw = upcomingPhase.items?.[0]?.quantity;
    const nextQuantity =
      nextQuantityRaw != null && Number.isFinite(nextQuantityRaw) && nextQuantityRaw > 0
        ? Math.floor(Number(nextQuantityRaw))
        : 1;
    if (nextQuantity >= currentLicensedMax) {
      return null;
    }
    const effectiveStartUnix = upcomingPhase.start_date;
    if (!Number.isFinite(effectiveStartUnix)) {
      return null;
    }
    return {
      nextMaxUsers: nextQuantity,
      effectiveAtIso: BillingService.secondsToIso8601(effectiveStartUnix as number),
    };
  }

  /**
   * Ensambla la presentación de una suscripción con nombre y metadatos de producto resueltos.
   *
   * @param subscription - Objeto Stripe
   * @param productNamesById - Nombres resueltos desde catálogo y recuperaciones
   * @param productMetadataById - Metadatos por producto (misma fuente que los nombres)
   * @param subscriptionSchedule - Calendario asociado (si existe) para detectar bajadas de cupo futuras
   */
  private static buildPresentationForSubscription(
    subscription: Stripe.Subscription,
    productNamesById: Map<string, string>,
    productMetadataById: Map<string, Array<{ key: string; value: string }>>,
    resolvedEnterpriseId: string | null,
    usedUnitsByEnterpriseId: Map<string, number>,
    subscriptionSchedule: Stripe.SubscriptionSchedule | null,
  ): BillingSubscriptionPresentation {
    const inlineName =
      BillingService.extractInlineProductNameFromSubscription(subscription);
    const primaryProductId =
      BillingService.extractPrimaryProductId(subscription);
    const catalogName = primaryProductId
      ? productNamesById.get(primaryProductId)
      : undefined;

    const productName =
      inlineName?.trim() ||
      catalogName?.trim() ||
      'Producto sin nombre';

    const inlineMetadataEntries =
      BillingService.extractInlineProductMetadataFromSubscription(subscription);
    const metadataFromCatalog = primaryProductId
      ? productMetadataById.get(primaryProductId) ?? []
      : [];
    const productMetadataEntries =
      inlineMetadataEntries !== null
        ? inlineMetadataEntries
        : metadataFromCatalog;

    const periodStart = subscription.current_period_start;
    const periodEnd = subscription.current_period_end;

    const primaryItem = subscription.items?.data?.[0];
    const quantity = Number.isFinite(primaryItem?.quantity)
      ? (primaryItem?.quantity as number)
      : 0;

    const priceFromSubscription = primaryItem?.price;
    const recurring =
      priceFromSubscription && typeof priceFromSubscription !== 'string'
        ? priceFromSubscription.recurring
        : null;
    const intervalType = recurring?.interval?.toString()?.trim() || null;
    const intervalCountRaw = recurring?.interval_count;
    const intervalCount =
      intervalCountRaw != null && Number.isFinite(intervalCountRaw) && intervalCountRaw > 0
        ? intervalCountRaw
        : 1;
    const billingInterval =
      intervalType != null ? { type: intervalType, count: intervalCount } : null;

    const enterpriseId = resolvedEnterpriseId?.trim() || '';
    const usedUnits = enterpriseId ? usedUnitsByEnterpriseId.get(enterpriseId) ?? 0 : 0;

    const scheduledLicensedQuotaReduction =
      BillingService.resolveScheduledLicensedQuotaReductionSummary({
        subscription,
        schedule: subscriptionSchedule,
      });

    return {
      subscriptionId: subscription.id,
      status: subscription.status,
      product: {
        name: productName,
        metadata: productMetadataEntries,
      },
      usage: {
        used: usedUnits,
        max: quantity,
      },
      billingInterval,
      currentPeriod: {
        start: BillingService.secondsToIso8601(periodStart),
        end: BillingService.secondsToIso8601(periodEnd),
      },
      renewsAtIso: BillingService.secondsToIso8601(periodEnd),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      scheduledLicensedQuotaReduction,
    };
  }
}
