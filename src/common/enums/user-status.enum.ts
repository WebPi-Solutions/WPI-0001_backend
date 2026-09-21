/**
 * Estados persistidos en `users.status`.
 * La columna es varchar; estos valores son el contrato de la aplicación.
 */
export enum UserStatusTypes {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PENDING = 'pending',
}
