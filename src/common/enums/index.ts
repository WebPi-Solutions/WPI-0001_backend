/**
 * Enumerados de la aplicación.
 * Incluye tipos PostgreSQL (`CREATE TYPE` en `databases/scheme.sql`) y contratos varchar de dominio.
 */
export { AiMode, isPremiumAiMode, normalizeAiMode } from './ai-mode.enum';
export { AiRequestType } from './ai-request-type.enum';
export { ClientType } from './client-type.enum';
export { InvoiceStatus } from './invoice-status.enum';
export {
  DEFAULT_ITEM_SERIAL_STATUS,
  isValidItemSerialStatus,
  ItemSerialStatus,
} from './item-serial-status.enum';
export {
  DEFAULT_ORDER_STATUS,
  isValidOrderStatus,
  OrderStatus,
} from './order-status.enum';
export {
  DEFAULT_PAYMENT_METHOD,
  isValidPaymentMethod,
  PaymentMethod,
} from './payment-method.enum';
export { QuoteStatus } from './quote-status.enum';
export { RecurrentEarningType } from './recurrent-earning-type.enum';
export { SigningAction } from './signing-action.enum';
export { SpentStatus } from './spent-status.enum';
export { isValidStockDirection, StockDirection } from './stock-direction.enum';
export { isValidStockType, StockType } from './stock-type.enum';
export { SupplierType } from './supplier-type.enum';
export { UserRoleTypes } from './user-role.enum';
export { UserStatusTypes } from './user-status.enum';
