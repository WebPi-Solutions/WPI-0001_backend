/**
 * Vista intermedia de una suscripción lista para mapear al DTO público de la API.
 * Se construye en `BillingService` a partir de objetos Stripe y del catálogo de productos.
 */
export interface BillingSubscriptionPresentation {
  /** Identificador de la suscripción en Stripe (`sub_...`). */
  subscriptionId: string;

  /** Estado de la suscripción en Stripe (p. ej. `active`, `trialing`). */
  status: string;

  /** Producto principal: nombre resuelto y metadatos del producto Stripe. */
  product: {
    name: string;
    metadata: Array<{ key: string; value: string }>;
  };

  /**
   * Uso de unidades (consumidas vs máximo).
   * `max` coincide con la cantidad contratada en Stripe (ítem principal), sin exponer `quantity` en el DTO.
   */
  usage: { used: number; max: number };

  /**
   * Intervalo de facturación del precio principal.
   * Se resuelve desde `price.recurring.interval` y `price.recurring.interval_count` cuando exista.
   */
  billingInterval: { type: string; count: number } | null;

  /** Periodo de facturación actual (inicio y fin en ISO 8601). */
  currentPeriod: { start: string; end: string };

  /**
   * Próxima renovación o facturación esperada (ISO 8601).
   * Para suscripciones estándar coincide con el fin del periodo actual salvo configuraciones avanzadas.
   */
  renewsAtIso: string;

  /** Si la suscripción quedará cancelada al terminar el periodo actual. */
  cancelAtPeriodEnd: boolean;

  /**
   * Reducción de cupo licenciado ya programada en Stripe (p. ej. vía {@link Stripe.SubscriptionSchedule}).
   * Si no es `null`, en `effectiveAtIso` pasará el tope de usuarios a `nextMaxUsers`.
   */
  scheduledLicensedQuotaReduction: {
    nextMaxUsers: number;
    effectiveAtIso: string;
  } | null;
}
