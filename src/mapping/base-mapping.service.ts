import { Injectable } from '@nestjs/common';

/**
 * Clase base abstracta para servicios de mapeo.
 * Contiene funcionalidad común para los servicios de mapeo específicos.
 */
@Injectable()
export abstract class BaseMappingService {
  /**
   * Método de utilidad para filtrar propiedades sensibles de cualquier objeto
   * @param entity Entidad a procesar
   * @param fieldsToRemove Array de nombres de campos a eliminar
   * @returns Una nueva instancia del objeto sin los campos sensibles
   */
  protected removeSensitiveFields<T>(entity: T, fieldsToRemove: string[]): Partial<T> {
    if (!entity) return null;
    
    const result = { ...entity };
    
    for (const field of fieldsToRemove) {
      delete result[field];
    }
    
    return result;
  }
  
  /**
   * Método para ordenar un array de objetos por un campo numérico (descendente)
   * @param items Array de objetos a ordenar
   * @param field Nombre del campo numérico por el que ordenar
   * @returns Array ordenado
   */
  protected sortByNumericField<T>(items: T[], field: keyof T): T[] {
    if (!items || items.length === 0) return [];
    
    return [...items].sort((a, b) => {
      const aValue = a[field] as unknown as number;
      const bValue = b[field] as unknown as number;
      return bValue - aValue;
    });
  }
} 