/**
 * Transformador TypeORM para columnas `numeric` de líneas de factura.
 * PostgreSQL suele devolver `numeric` como string; la API trabaja con `number`.
 */
export const invoiceConceptNumericAmountTransformer = {
  /**
   * Convierte el importe de la aplicación al valor que se persiste.
   * @param applicationValue - Importe en la entidad
   * @returns El mismo número, o null si no hay valor
   */
  to(applicationValue: number | null | undefined): number | null {
    if (applicationValue === null || applicationValue === undefined) {
      return null;
    }
    return applicationValue;
  },

  /**
   * Convierte el valor leído de PostgreSQL a número.
   * @param databaseValue - Valor de la columna (`numeric` puede llegar como string)
   * @returns Número o null
   */
  from(databaseValue: string | number | null): number | null {
    if (databaseValue === null || databaseValue === undefined) {
      return null;
    }
    return Number(databaseValue);
  },
};
