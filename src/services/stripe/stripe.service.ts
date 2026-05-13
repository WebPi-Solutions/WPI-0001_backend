import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import Stripe from 'stripe';

/**
 * Cliente de integración con la API de Stripe (servidor).
 * Usa `STRIPE_SECRET_KEY`; si no está definida, las operaciones fallan de forma controlada.
 * Expone operaciones genéricas; la composición y el mapeo de negocio viven en `BillingService`.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);

  private readonly stripeClient: Stripe | null;
  // Nota: no se cachean precios porque el endpoint de suscripciones no expone importes ni tramos.

  constructor() {
    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!secretKey) {
      this.logger.warn(
        'STRIPE_SECRET_KEY no está definida: las llamadas a la API de Stripe permanecerán deshabilitadas.',
      );
      this.stripeClient = null;
    } else {
      this.stripeClient = new Stripe(secretKey);
    }
  }

  /**
   * Indica si la integración con Stripe está lista para usarse.
   *
   * @returns `true` si existe clave secreta configurada
   */
  isStripeConfigured(): boolean {
    return this.stripeClient !== null;
  }

  /**
   * Garantiza que Stripe está configurado antes de invocar la API.
   *
   * @throws ServiceUnavailableException si falta la clave secreta
   */
  assertStripeIsConfigured(): void {
    if (!this.stripeClient) {
      this.logger.error(
        'Se ha intentado llamar a Stripe sin STRIPE_SECRET_KEY en el entorno.',
      );
      throw new ServiceUnavailableException(
        'El servicio de facturación con Stripe no está disponible en este entorno.',
      );
    }
  }

  /**
   * Obtiene el cliente Stripe subyacente (tras comprobar configuración).
   */
  private getStripeOrThrow(): Stripe {
    this.assertStripeIsConfigured();
    return this.stripeClient as Stripe;
  }

  /**
   * Crea una sesión de Stripe Checkout en modo suscripción.
   *
   * @param stripeCustomerId - Identificador `cus_...` asociado a la empresa
   * @param priceId - Identificador de precio `price_...` (debe ser recurrente)
   * @param successUrl - URL de retorno tras completar el pago/alta
   * @param cancelUrl - URL de retorno si el usuario cancela el Checkout
   * @returns URL de la sesión de Checkout para redirigir al usuario
   */
  async createSubscriptionCheckoutSessionUrl(params: {
    stripeCustomerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
    quantity?: number;
  }): Promise<string> {
    const stripe = this.getStripeOrThrow();
    const stripeCustomerId = params.stripeCustomerId?.trim();
    const priceId = params.priceId?.trim();
    const successUrl = params.successUrl?.trim();
    const cancelUrl = params.cancelUrl?.trim();

    if (!stripeCustomerId || !priceId || !successUrl || !cancelUrl) {
      throw new Error(
        'Parámetros inválidos para crear sesión de Checkout de suscripción.',
      );
    }

    try {
      const price = await stripe.prices.retrieve(priceId);
      const usageType = price.recurring?.usage_type ?? null;
      const shouldOmitQuantityForCheckout = usageType === 'metered';

      const desiredQuantity =
        params.quantity != null &&
        Number.isFinite(params.quantity) &&
        (params.quantity as number) > 0
          ? Math.floor(params.quantity as number)
          : 1;

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: stripeCustomerId,
        line_items: [
          shouldOmitQuantityForCheckout
            ? { price: priceId }
            : { price: priceId, quantity: desiredQuantity },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
        subscription_data: {
          metadata: params.metadata,
        },
      });

      const url = session.url?.trim();
      if (!url) {
        this.logger.error(
          `Stripe devolvió sesión Checkout sin url (customer=${stripeCustomerId}, price=${priceId})`,
        );
        throw new Error('No se pudo obtener la URL de Checkout.');
      }
      return url;
    } catch (error) {
      this.logger.error(
        `Error al crear sesión de Checkout para customer=${stripeCustomerId} price=${priceId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Lista suscripciones de un cliente de Stripe en los estados indicados.
   * Expande `data.items.data.price` (límite de 4 niveles de expansión de Stripe).
   *
   * @param stripeCustomerId - Identificador `cus_...`
   * @param statuses - Estados Stripe a incluir (p. ej. `active`, `trialing`)
   * @returns Lista aplanada de suscripciones de todas las páginas solicitadas
   */
  async getSubscriptionsByCustomerId(
    stripeCustomerId: string,
    statuses: Stripe.Subscription.Status[],
  ): Promise<Stripe.Subscription[]> {
    const stripe = this.getStripeOrThrow();
    const results: Stripe.Subscription[] = [];

    try {
      for (const status of statuses) {
        let startingAfter: string | undefined;
        do {
          const page = await stripe.subscriptions.list({
            customer: stripeCustomerId,
            status,
            limit: 100,
            expand: ['data.items.data.price'],
            starting_after: startingAfter,
          });
          results.push(...page.data);
          startingAfter = page.has_more
            ? page.data[page.data.length - 1]?.id
            : undefined;
        } while (startingAfter);
      }

      return results;
    } catch (error) {
      this.logger.error(
        `Error al listar suscripciones en Stripe para el cliente ${stripeCustomerId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Alias orientado a dominio: suscripciones activas o en prueba para un cliente.
   * Delega en {@link StripeService.getSubscriptionsByCustomerId}.
   *
   * @param stripeCustomerId - Identificador `cus_...`
   */
  async getSubscriptionsByAccountId(
    stripeCustomerId: string,
  ): Promise<Stripe.Subscription[]> {
    return this.getSubscriptionsByCustomerId(stripeCustomerId, [
      'active',
      'trialing',
    ]);
  }

  /**
   * Recupera un calendario de suscripción Stripe por id (fases, cantidades futuras, etc.).
   *
   * @param scheduleId - Identificador `sub_sched_...`
   * @returns Objeto de programación tal como lo devuelve Stripe
   */
  async retrieveSubscriptionSchedule(
    scheduleId: string,
  ): Promise<Stripe.SubscriptionSchedule> {
    const stripe = this.getStripeOrThrow();
    const normalizedScheduleId = scheduleId?.trim();
    if (!normalizedScheduleId) {
      throw new Error('Identificador de programación de suscripción Stripe inválido.');
    }
    try {
      return await stripe.subscriptionSchedules.retrieve(normalizedScheduleId);
    } catch (error) {
      this.logger.error(
        `Error al recuperar programación de suscripción Stripe ${normalizedScheduleId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Marca una suscripción para cancelarse al finalizar el periodo actual.
   * No cancela de inmediato: establece `cancel_at_period_end = true`.
   *
   * @param subscriptionId - Identificador `sub_...`
   * @returns Suscripción actualizada
   */
  async cancelSubscriptionAtPeriodEnd(
    subscriptionId: string,
  ): Promise<Stripe.Subscription> {
    const stripe = this.getStripeOrThrow();
    const normalizedId = subscriptionId?.trim();
    if (!normalizedId) {
      throw new Error('Identificador de suscripción Stripe inválido.');
    }

    try {
      return await stripe.subscriptions.update(normalizedId, {
        cancel_at_period_end: true,
      });
    } catch (error) {
      this.logger.error(
        `Error al marcar cancelación al final de periodo para la suscripción ${normalizedId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Revoca la cancelación programada al final del periodo actual.
   * Configura `cancel_at_period_end = false` en Stripe.
   *
   * @param subscriptionId - Identificador `sub_...`
   * @returns Suscripción actualizada
   */
  async revokeCancelSubscriptionAtPeriodEnd(
    subscriptionId: string,
  ): Promise<Stripe.Subscription> {
    const stripe = this.getStripeOrThrow();
    const normalizedId = subscriptionId?.trim();
    if (!normalizedId) {
      throw new Error('Identificador de suscripción Stripe inválido.');
    }

    try {
      return await stripe.subscriptions.update(normalizedId, {
        cancel_at_period_end: false,
      });
    } catch (error) {
      this.logger.error(
        `Error al revocar cancelación al final de periodo para la suscripción ${normalizedId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Lista productos Stripe con paginación automática.
   *
   * @param onlyActive - Si es `true`, solo productos marcados como activos en Stripe
   * @returns Todos los productos recorridos en las páginas disponibles
   */
  async getAllProducts(onlyActive = true): Promise<Stripe.Product[]> {
    const stripe = this.getStripeOrThrow();
    const products: Stripe.Product[] = [];
    let startingAfter: string | undefined;

    try {
      do {
        const page = await stripe.products.list({
          active: onlyActive ? true : undefined,
          limit: 100,
          starting_after: startingAfter,
        });
        products.push(...page.data);
        startingAfter = page.has_more
          ? page.data[page.data.length - 1]?.id
          : undefined;
      } while (startingAfter);

      return products;
    } catch (error) {
      this.logger.error(
        'Error al listar productos en Stripe',
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Recupera un producto Stripe por id, expandiendo `default_price` cuando exista.
   * Útil para construir una UI de selección/alta de suscripción (necesita `price_...`).\n+   *
   * @param productId - Identificador `prod_...`
   */
  async getProductWithDefaultPriceExpanded(
    productId: string,
  ): Promise<Stripe.Product> {
    const stripe = this.getStripeOrThrow();
    const normalizedProductId = productId?.trim();
    if (!normalizedProductId) {
      throw new Error('Identificador de producto Stripe inválido.');
    }
    try {
      return await stripe.products.retrieve(normalizedProductId, {
        expand: ['default_price'],
      });
    } catch (error) {
      this.logger.error(
        `Error al recuperar producto Stripe ${normalizedProductId} con default_price expandido`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Lista precios activos de Stripe para un producto.\n+   * Se usa para mostrar opciones mensual/anual y escalones de precio en el frontend.\n+   *
   * @param productId - Identificador `prod_...`\n+   */
  async listActivePricesForProduct(productId: string): Promise<Stripe.Price[]> {
    const stripe = this.getStripeOrThrow();
    const normalizedProductId = productId?.trim();
    if (!normalizedProductId) {
      throw new Error('Identificador de producto Stripe inválido.');
    }
    const results: Stripe.Price[] = [];
    let startingAfter: string | undefined;
    try {
      do {
        const page = await stripe.prices.list({
          product: normalizedProductId,
          active: true,
          limit: 100,
          starting_after: startingAfter,
          // Stripe no siempre incluye `tiers` en listados si no se expande explícitamente.
          // Esto permite que el frontend muestre escalones por tipo de facturación (mes/año).
          expand: ['data.tiers'],
        });
        results.push(...page.data);
        startingAfter = page.has_more
          ? page.data[page.data.length - 1]?.id
          : undefined;
      } while (startingAfter);
      return results;
    } catch (error) {
      this.logger.error(
        `Error al listar precios activos para producto Stripe ${normalizedProductId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Recupera una suscripción Stripe por id, expandiendo el primer ítem, su precio y la programación (si existe).
   *
   * @param subscriptionId - Identificador `sub_...`
   */
  async getSubscriptionWithItemsExpanded(
    subscriptionId: string,
  ): Promise<Stripe.Subscription> {
    const stripe = this.getStripeOrThrow();
    const normalizedSubscriptionId = subscriptionId?.trim();
    if (!normalizedSubscriptionId) {
      throw new Error('Identificador de suscripción Stripe inválido.');
    }
    try {
      return await stripe.subscriptions.retrieve(normalizedSubscriptionId, {
        expand: ['items.data.price', 'schedule'],
      });
    } catch (error) {
      this.logger.error(
        `Error al recuperar suscripción Stripe ${normalizedSubscriptionId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Resuelve el identificador `price_...` desde el campo `price` de un ítem de suscripción
   * (referencia en cadena o precio expandido).
   *
   * @param price - Valor `price` del ítem (`string`, objeto `Price` o ausente)
   * @returns Id de precio recortado o cadena vacía si no es posible resolverlo
   */
  private static resolveSubscriptionItemPriceId(
    price: Stripe.SubscriptionItem['price'],
  ): string {
    if (price == null) {
      return '';
    }
    // Con `expand: ['items.data.price']` el SDK tipa `price` como objeto; el id sigue siendo la referencia estable.
    if (typeof price === 'object' && 'id' in price) {
      const resolvedId = (price as { id?: string | null }).id;
      return typeof resolvedId === 'string' ? resolvedId.trim() : '';
    }
    return '';
  }

  /**
   * Determina si el precio principal del ítem es de uso `licensed` o `metered` (según Stripe).
   *
   * @param subscription - Suscripción con `items.data.price` expandido
   * @returns Tipo de uso recurrente o `null` si no se puede resolver
   */
  private static resolvePrimaryPriceUsageType(
    subscription: Stripe.Subscription,
  ): 'licensed' | 'metered' | null {
    const price = subscription.items?.data?.[0]?.price;
    if (!price || typeof price === 'string') {
      return null;
    }
    const usageType = price.recurring?.usage_type;
    if (usageType === 'metered') {
      return 'metered';
    }
    if (usageType === 'licensed') {
      return 'licensed';
    }
    return null;
  }

  /**
   * Cantidad contratada (`quantity`) del ítem con precio licenciado; mínimo 1 si Stripe no informa valor válido.
   *
   * @param subscriptionItem - Primer ítem de la suscripción
   * @returns Cantidad entera positiva
   */
  private static resolveLicensedQuantityForSubscriptionItem(
    subscriptionItem: Stripe.SubscriptionItem | undefined,
  ): number {
    const rawQuantity = subscriptionItem?.quantity;
    if (rawQuantity != null && Number.isFinite(rawQuantity) && rawQuantity > 0) {
      return Math.floor(Number(rawQuantity));
    }
    return 1;
  }

  /**
   * Resuelve el id de {@link Stripe.SubscriptionSchedule} vinculado a la suscripción (cadena o objeto expandido).
   *
   * @param subscription - Suscripción posiblemente con `schedule` expandido
   */
  private static resolveAttachedSubscriptionScheduleId(
    subscription: Stripe.Subscription,
  ): string {
    const schedule = subscription.schedule;
    if (!schedule) {
      return '';
    }
    if (typeof schedule === 'string') {
      return schedule.trim();
    }
    return schedule.id?.trim() ?? '';
  }

  /**
   * Libera la programación de facturación activa para permitir cambios inmediatos (p. ej. ampliación de cupo).
   * La suscripción continúa con la configuración vigente en el momento de la liberación.
   *
   * @param stripe - Cliente Stripe
   * @param subscription - Suscripción con `schedule` resuelto o expandido
   */
  private async releaseActiveSubscriptionScheduleIfConfigured(
    stripe: Stripe,
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const scheduleId = StripeService.resolveAttachedSubscriptionScheduleId(subscription);
    if (!scheduleId) {
      return;
    }
    this.logger.log(
      `Liberando programación de suscripción ${scheduleId} para aplicar un cambio inmediato en ${subscription.id}.`,
    );
    await stripe.subscriptionSchedules.release(scheduleId);
  }

  /**
   * Obtiene la programación existente o la crea migrando la suscripción, y devuelve el inicio de la fase 0.
   * Requiere dos llamadas cuando no existía programación: `create` con `from_subscription` y luego `retrieve`.
   *
   * @param stripe - Cliente Stripe
   * @param subscriptionId - Suscripción `sub_...`
   */
  private async resolveOrCreateSubscriptionScheduleForDowngrade(params: {
    stripe: Stripe;
    subscriptionId: string;
  }): Promise<{ scheduleId: string; phaseZeroStartDate: number }> {
    const stripe = params.stripe;
    const subscriptionId = params.subscriptionId.trim();
    const subscription = await this.getSubscriptionWithItemsExpanded(subscriptionId);
    const existingScheduleId = StripeService.resolveAttachedSubscriptionScheduleId(subscription);
    if (existingScheduleId) {
      const schedule = await stripe.subscriptionSchedules.retrieve(existingScheduleId);
      const phaseZeroStart = schedule.phases?.[0]?.start_date;
      if (!Number.isFinite(phaseZeroStart)) {
        throw new Error(
          'No se pudo leer la fecha de inicio de la fase 0 en la programación de suscripción existente.',
        );
      }
      return { scheduleId: existingScheduleId, phaseZeroStartDate: phaseZeroStart as number };
    }
    const createdSchedule = await stripe.subscriptionSchedules.create({
      from_subscription: subscriptionId,
    });
    const schedule = await stripe.subscriptionSchedules.retrieve(createdSchedule.id);
    const phaseZeroStart = schedule.phases?.[0]?.start_date;
    if (!Number.isFinite(phaseZeroStart)) {
      throw new Error(
        'No se pudo leer la fecha de inicio de la fase 0 tras crear la programación de suscripción.',
      );
    }
    return { scheduleId: createdSchedule.id, phaseZeroStartDate: phaseZeroStart as number };
  }

  /**
   * Programa la reducción de cupo (y opcionalmente otro precio) para el inicio del siguiente ciclo de facturación.
   * No genera abonos ni reembolsos: la fase futura entra con `proration_behavior: none`.
   *
   * @param stripe - Cliente Stripe
   * @param subscription - Suscripción actualizada (para `current_period_end`)
   * @param scheduleId - Id del calendario a actualizar
   * @param phaseZeroStartDate - Inicio de la fase actual (histórico de Stripe)
   * @param currentPriceId - Precio vigente hasta el fin del periodo
   * @param currentQuantity - Cupo vigente hasta el fin del periodo
   * @param targetPriceId - Precio objetivo a partir del siguiente ciclo
   * @param targetQuantity - Cupo objetivo a partir del siguiente ciclo
   */
  private async applyDeferredLicensedDowngradeWithSubscriptionSchedule(params: {
    stripe: Stripe;
    subscription: Stripe.Subscription;
    scheduleId: string;
    phaseZeroStartDate: number;
    currentPriceId: string;
    currentQuantity: number;
    targetPriceId: string;
    targetQuantity: number;
  }): Promise<void> {
    const periodEndUnix = params.subscription.current_period_end;
    if (!Number.isFinite(periodEndUnix)) {
      throw new Error('No se pudo determinar el fin del periodo de facturación actual de la suscripción.');
    }
    await params.stripe.subscriptionSchedules.update(params.scheduleId, {
      end_behavior: 'release',
      proration_behavior: 'none',
      phases: [
        {
          start_date: params.phaseZeroStartDate,
          end_date: periodEndUnix,
          items: [{ price: params.currentPriceId, quantity: params.currentQuantity }],
          proration_behavior: 'none',
        },
        {
          start_date: periodEndUnix,
          items: [{ price: params.targetPriceId, quantity: params.targetQuantity }],
          proration_behavior: 'none',
        },
      ],
    });
    this.logger.log(
      `Reducción de cupo programada para suscripción ${params.subscription.id}: ` +
        `hasta el fin del periodo actual se mantiene cantidad=${params.currentQuantity} y precio=${params.currentPriceId}; ` +
        `a partir del siguiente ciclo cantidad=${params.targetQuantity} y precio=${params.targetPriceId}.`,
    );
  }

  /**
   * Cambia el precio y/o la cantidad del ítem principal según reglas de negocio de prorrateo:
   * - Ampliación de cupo (o cambio inmediato que no sea reducción de cupo): prorrateo cobrado al momento (`always_invoice`).
   * - Reducción de cupo: sin reembolso; el nuevo cupo (y precio si aplica) queda programado al inicio del siguiente ciclo mediante {@link Stripe.SubscriptionSchedule}.
   *
   * @param subscriptionId - `sub_...`
   * @param newPriceId - `price_...` deseado para el ítem principal
   * @param quantity - Cantidad objetivo para precios `licensed` (licencias / unidades por tramo)
   */
  async updateSubscriptionPrimaryItemPrice(params: {
    subscriptionId: string;
    newPriceId: string;
    quantity?: number;
  }): Promise<void> {
    const stripe = this.getStripeOrThrow();
    const subscriptionId = params.subscriptionId?.trim();
    const newPriceId = params.newPriceId?.trim();
    if (!subscriptionId || !newPriceId) {
      throw new Error('Parámetros inválidos para modificar la suscripción.');
    }

    try {
      let subscription = await this.getSubscriptionWithItemsExpanded(subscriptionId);
      const primaryItem = subscription.items?.data?.[0];
      const primaryItemId = primaryItem?.id?.trim() || '';
      if (!primaryItemId) {
        throw new Error('No se pudo determinar el ítem principal de la suscripción.');
      }

      const usageType = StripeService.resolvePrimaryPriceUsageType(subscription);
      if (usageType === 'metered') {
        await stripe.subscriptions.update(subscriptionId, {
          items: [{ id: primaryItemId, price: newPriceId }],
          proration_behavior: 'always_invoice',
        });
        return;
      }

      if (usageType !== 'licensed') {
        const fallbackQuantity =
          params.quantity != null &&
          Number.isFinite(params.quantity) &&
          (params.quantity as number) > 0
            ? Math.floor(params.quantity as number)
            : undefined;
        await stripe.subscriptions.update(subscriptionId, {
          items: [
            fallbackQuantity != null
              ? { id: primaryItemId, price: newPriceId, quantity: fallbackQuantity }
              : { id: primaryItemId, price: newPriceId },
          ],
          proration_behavior: 'always_invoice',
        });
        return;
      }

      const currentPriceId = StripeService.resolveSubscriptionItemPriceId(primaryItem?.price);
      if (!currentPriceId) {
        throw new Error('No se pudo resolver el precio actual del ítem principal.');
      }

      const currentQuantity = StripeService.resolveLicensedQuantityForSubscriptionItem(primaryItem);
      const requestedQuantity =
        params.quantity != null &&
        Number.isFinite(params.quantity) &&
        (params.quantity as number) > 0
          ? Math.floor(params.quantity as number)
          : currentQuantity;

      if (currentPriceId === newPriceId && requestedQuantity === currentQuantity) {
        this.logger.log(
          `Sin cambios aplicables en suscripción ${subscriptionId} (mismo precio y misma cantidad licenciada).`,
        );
        return;
      }

      const isLicensedQuotaDecrease = requestedQuantity < currentQuantity;

      if (isLicensedQuotaDecrease) {
        const scheduleContext = await this.resolveOrCreateSubscriptionScheduleForDowngrade({
          stripe,
          subscriptionId,
        });
        subscription = await this.getSubscriptionWithItemsExpanded(subscriptionId);
        await this.applyDeferredLicensedDowngradeWithSubscriptionSchedule({
          stripe,
          subscription,
          scheduleId: scheduleContext.scheduleId,
          phaseZeroStartDate: scheduleContext.phaseZeroStartDate,
          currentPriceId,
          currentQuantity,
          targetPriceId: newPriceId,
          targetQuantity: requestedQuantity,
        });
        return;
      }

      await this.releaseActiveSubscriptionScheduleIfConfigured(stripe, subscription);
      subscription = await this.getSubscriptionWithItemsExpanded(subscriptionId);
      const refreshedPrimaryItemId =
        subscription.items?.data?.[0]?.id?.trim() || primaryItemId;

      this.logger.log(
        `Aplicando ampliación o cambio inmediato en ítem ${refreshedPrimaryItemId} ` +
          `(suscripción ${subscriptionId}): precio=${newPriceId}, cantidad=${requestedQuantity}. ` +
          `Se facturará el prorrateo al momento (always_invoice).`,
      );
      await stripe.subscriptionItems.update(refreshedPrimaryItemId, {
        price: newPriceId,
        quantity: requestedQuantity,
        proration_behavior: 'always_invoice',
      });
    } catch (error) {
      this.logger.error(
        `Error al modificar precio/cupo de suscripción ${subscriptionId} (precio objetivo ${newPriceId})`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Obtiene el identificador `price_...` del `default_price` de un producto (si está definido).
   *
   * @param product - Producto Stripe con o sin `default_price` expandido
   * @returns Id de precio o cadena vacía si no existe
   */
  static extractDefaultPriceIdFromProduct(product: Stripe.Product): string {
    const defaultPrice = product.default_price;
    if (!defaultPrice) {
      return '';
    }
    if (typeof defaultPrice === 'string') {
      return defaultPrice.trim();
    }
    return defaultPrice.id?.trim() || '';
  }

  /**
   * Comprueba si la respuesta de `products.retrieve` corresponde a un {@link Stripe.DeletedProduct}.
   * El SDK tipa el retorno como {@link Stripe.Product}, pero la API puede devolver un producto borrado;
   * se usa la unión oficial de Stripe y este guard para discriminar sin `unknown`.
   *
   * @param product - Respuesta envuelta (`Stripe.Response`) del recurso producto
   */
  private static isStripeDeletedProductResponse(
    product: Stripe.Response<Stripe.Product | Stripe.DeletedProduct>,
  ): product is Stripe.Response<Stripe.DeletedProduct> {
    return product.deleted === true;
  }

  /**
   * Convierte el objeto `metadata` de Stripe en entradas ordenadas por clave (estable en respuestas API).
   *
   * @param metadata - Mapa clave–valor de Stripe (puede ser vacío o indefinido)
   * @returns Lista de pares `{ key, value }` ordenada alfabéticamente por clave
   */
  static normalizeStripeMetadataToSortedEntries(
    metadata: Stripe.Metadata | null | undefined,
  ): Array<{ key: string; value: string }> {
    if (!metadata || typeof metadata !== 'object') {
      return [];
    }
    const record = metadata as Record<string, unknown>;
    return Object.keys(record)
      .sort((leftKey, rightKey) =>
        leftKey.localeCompare(rightKey, undefined, { sensitivity: 'base' }),
      )
      .map((metadataKey) => ({
        key: metadataKey,
        value: String(record[metadataKey] ?? ''),
      }));
  }

  /**
   * Recupera por id los productos Stripe indicados y devuelve un mapa id → nombre.
   * Ignora ids inválidos o productos borrados sin interrumpir el resto.
   *
   * @param productIds - Lista de `prod_...` únicos
   * @returns Mapa de identificador a nombre legible
   */
  async getProductNamesByIds(productIds: string[]): Promise<Map<string, string>> {
    const stripe = this.getStripeOrThrow();
    const uniqueIds = [
      ...new Set(
        productIds
          .map((id) => id?.trim())
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const nameById = new Map<string, string>();

    await Promise.all(
      uniqueIds.map(async (productId) => {
        try {
          const productResponse = (await stripe.products.retrieve(
            productId,
          )) as Stripe.Response<Stripe.Product | Stripe.DeletedProduct>;

          if (StripeService.isStripeDeletedProductResponse(productResponse)) {
            return;
          }

          const activeProduct: Stripe.Product = productResponse;
          nameById.set(
            productId,
            activeProduct.name.trim() || 'Producto sin nombre',
          );
        } catch (error) {
          this.logger.warn(
            `No se pudo recuperar el producto Stripe ${productId}: ${error instanceof Error ? error.message : error}`,
          );
        }
      }),
    );

    return nameById;
  }

  /**
   * Recupera nombre y metadatos de productos por id (omitidos productos borrados o errores puntuales).
   * Útil cuando el producto no aparece en el listado activo del catálogo pero sigue referenciado por precios.
   *
   * @param productIds - Lista de `prod_...` únicos
   * @returns Mapa de id a nombre y entradas de metadatos ordenadas
   */
  async getProductNamesAndMetadataByIds(
    productIds: string[],
  ): Promise<
    Map<
      string,
      {
        name: string;
        metadataEntries: Array<{ key: string; value: string }>;
      }
    >
  > {
    const stripe = this.getStripeOrThrow();
    const uniqueIds = [
      ...new Set(
        productIds
          .map((productId) => productId?.trim())
          .filter((productId): productId is string => Boolean(productId)),
      ),
    ];
    const detailsById = new Map<
      string,
      { name: string; metadataEntries: Array<{ key: string; value: string }> }
    >();

    await Promise.all(
      uniqueIds.map(async (productId) => {
        try {
          const productResponse = (await stripe.products.retrieve(
            productId,
          )) as Stripe.Response<Stripe.Product | Stripe.DeletedProduct>;

          if (StripeService.isStripeDeletedProductResponse(productResponse)) {
            return;
          }

          const activeProduct: Stripe.Product = productResponse;
          detailsById.set(productId, {
            name: activeProduct.name?.trim() || 'Producto sin nombre',
            metadataEntries:
              StripeService.normalizeStripeMetadataToSortedEntries(
                activeProduct.metadata,
              ),
          });
        } catch (error) {
          this.logger.warn(
            `No se pudo recuperar nombre y metadatos del producto Stripe ${productId}: ${error instanceof Error ? error.message : error}`,
          );
        }
      }),
    );

    return detailsById;
  }
}
