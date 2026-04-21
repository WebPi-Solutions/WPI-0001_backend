import { SelectQueryBuilder, Repository, ObjectLiteral } from 'typeorm';
import { PaginationOptions, PaginatedResponse } from './Pagination';

/**
 * Relación a aplicar en la consulta
 */
export interface QueryRelation {
  /**
   * Propiedad de la relación
   */
  property: string;
  /**
   * Alias para la relación
   */
  alias: string;
  /**
   * Si es true, se usará leftJoinAndSelect, si es false, se usará leftJoin, por defecto es true
   */
  isLeftJoinAndSelect?: boolean;
  /**
   * Campos a seleccionar de la relación, si no se proporciona, se seleccionarán todos los campos
   */
  selectFields?: string[];
}

export interface QueryFilterOptions extends PaginationOptions {
  relations?: QueryRelation[];
  filter?: Record<string, any>;
}

/**
 * Servicio genérico para construir consultas con filtrado, ordenación y paginación
 */
export class QueryBuilderService {
  /**
   * Cuenta los registros que coinciden con los filtros y relaciones especificados
   * @param repository Repositorio de TypeORM
   * @param entityAlias Alias para la entidad principal
   * @param filter Filtros a aplicar
   * @param relations Relaciones a incluir para aplicar filtros con relaciones
   * @returns Número de registros que coinciden
   */
  static async getCount<T extends ObjectLiteral>(
    repository: Repository<T>,
    entityAlias: string,
    filter: Record<string, any> = {},
    relations?: QueryRelation[]
  ): Promise<number> {
    // Crear el query builder
    const queryBuilder = repository.createQueryBuilder(entityAlias);

    // Aplicar relaciones (joins) si se proporcionan
    if (relations && relations.length > 0) {
      // Convertir relaciones para que solo hagan join (no select) para el count
      const countRelations = relations.map(relation => ({
        ...relation,
        isLeftJoinAndSelect: false // Solo necesitamos el join para filtrar, no seleccionar
      }));
      this.applyRelations(queryBuilder, countRelations, entityAlias);
    }

    // Aplicar filtros
    if (filter && Object.keys(filter).length > 0) {
      this.applyFilters(queryBuilder, filter, entityAlias);
    }

    // Retornar el count
    return await queryBuilder.getCount();
  }

  /**
   * Construye una consulta paginada con filtros y ordenación
   * @param repository Repositorio de TypeORM
   * @param entityAlias Alias para la entidad principal
   * @param options Opciones de consulta (paginación, filtros, ordenación)
   * @returns Resultados paginados
   */
  static async getPaginatedResults<T extends ObjectLiteral>(
    repository: Repository<T>,
    entityAlias: string,
    options: QueryFilterOptions
  ): Promise<PaginatedResponse<T>> {
    // Crear el query builder
    const queryBuilder = repository.createQueryBuilder(entityAlias);

    // Aplicar relaciones (joins)
    this.applyRelations(queryBuilder, options.relations || [], entityAlias);

    // Aplicar filtros
    if (options.filter && Object.keys(options.filter).length > 0) {
      this.applyFilters(queryBuilder, options.filter, entityAlias);
    }

    // Aplicar ordenación
    this.applySort(queryBuilder, options.sort, options.order || 'ASC', entityAlias);

    // Obtener total de registros para paginación
    const total = await queryBuilder.getCount();
    const totalPages = Math.ceil(total / options.pageSize);

    // Aplicar paginación
    const skip = (options.page - 1) * options.pageSize;
    queryBuilder.skip(skip).take(options.pageSize);

    // Ejecutar la consulta
    const items = await queryBuilder.getMany();

    // Devolver respuesta paginada
    return {
      items,
      total,
      currentPage: options.page,
      totalPages
    };
  }

  /**
   * Aplica relaciones al query builder
   * @param queryBuilder Query builder de TypeORM
   * @param relations Relaciones a aplicar
   * @param entityAlias Alias de la entidad principal
   */
  private static applyRelations<T>(
    queryBuilder: SelectQueryBuilder<T>,
    relations: QueryRelation[],
    entityAlias: string
  ): void {
    // Primero ordenamos las relaciones por profundidad (las más simples primero)
    const sortedRelations = [...relations].sort((a, b) => {
      return (a.property.split('.').length - b.property.split('.').length);
    });
    
    // Rastrea las relaciones que ya se han añadido para evitar duplicados
    const addedRelations = new Set<string>();
    
    sortedRelations.forEach(relation => {
      // Comprobamos si es una relación anidada (con notación de punto)
      const pathParts = relation.property.split('.');
      
      if (pathParts.length === 1) {
        // Relación simple
        const relationPath = `${entityAlias}.${relation.property}`;
        const relationAlias = relation.alias;
        
        // Evitar duplicados
        if (addedRelations.has(relationPath)) return;
        addedRelations.add(relationPath);
      
      // Aplicar join
        if (relation.isLeftJoinAndSelect !== false) {
          queryBuilder.leftJoinAndSelect(relationPath, relationAlias);
      } else {
          queryBuilder.leftJoin(relationPath, relationAlias);
      }
      
      // Seleccionar campos específicos si se proporciona
      if (relation.selectFields && relation.selectFields.length > 0) {
          const selections = relation.selectFields.map(field => `${relationAlias}.${field}`);
          queryBuilder.addSelect(selections);
        }
      } else {
        // Relación anidada
        // Primero aseguramos que la relación padre existe
        const parentRelation = pathParts[0];
        const parentAlias = pathParts[0];
        const parentPath = `${entityAlias}.${parentRelation}`;
        
        // Si la relación padre no se ha añadido, añadirla primero
        if (!addedRelations.has(parentPath)) {
          addedRelations.add(parentPath);
          queryBuilder.leftJoinAndSelect(parentPath, parentAlias);
        }
        
        // Ahora añadir la relación anidada usando el alias del padre
        const childRelation = pathParts[1];
        const childPath = `${parentAlias}.${childRelation}`;
        const childAlias = relation.alias.includes('.') 
          ? relation.alias.split('.')[1] 
          : `${parentAlias}_${childRelation}`;
        
        // Evitar duplicados en relaciones anidadas
        const fullChildPath = `${parentAlias}.${childRelation}`;
        if (addedRelations.has(fullChildPath)) return;
        addedRelations.add(fullChildPath);
        
        // Aplicar join para la relación anidada
        if (relation.isLeftJoinAndSelect !== false) {
          queryBuilder.leftJoinAndSelect(childPath, childAlias);
        } else {
          queryBuilder.leftJoin(childPath, childAlias);
        }
        
        // Seleccionar campos específicos para la relación anidada
        if (relation.selectFields && relation.selectFields.length > 0) {
          const selections = relation.selectFields.map(field => `${childAlias}.${field}`);
        queryBuilder.addSelect(selections);
        }
      }
    });
  }

  /**
   * Aplica filtros al query builder
   * @param queryBuilder Query builder de TypeORM
   * @param filter Filtros a aplicar
   * @param entityAlias Alias de la entidad principal
   */
  private static applyFilters<T>(
    queryBuilder: SelectQueryBuilder<T>,
    filter: Record<string, any>,
    entityAlias: string
  ): void {
    // Procesar filtros OR primero si existen
    if (filter.$or && Array.isArray(filter.$or)) {
      const orConditions: string[] = [];
      const orParams: Record<string, any> = {};
      let paramCounter = 0;
      
      filter.$or.forEach((orFilter: Record<string, any>) => {
        // Construir condiciones AND dentro de cada grupo OR
        const andConditions: string[] = [];
        
        Object.entries(orFilter).forEach(([key, value]) => {
          const paramKey = `or_param_${paramCounter++}`;
          const condition = this.buildFilterCondition(key, value, entityAlias, paramKey, orParams);
          if (condition) {
            andConditions.push(condition);
          }
        });
        
        if (andConditions.length > 0) {
          orConditions.push(`(${andConditions.join(' AND ')})`);
        }
      });
      
      if (orConditions.length > 0) {
        // Combinar todas las condiciones OR
        const orQuery = orConditions.join(' OR ');
        queryBuilder.andWhere(`(${orQuery})`, orParams);
      }
      
      // Eliminar $or del filtro para que no se procese nuevamente
      delete filter.$or;
    }
    
    // Procesar filtros AND si existen
    if (filter.$and && Array.isArray(filter.$and)) {
      filter.$and.forEach((andFilter: Record<string, any>) => {
        // Aplicar cada filtro AND como una condición adicional
        Object.entries(andFilter).forEach(([key, value]) => {
          this.applySingleFilter(queryBuilder, key, value, entityAlias);
        });
      });
      
      // Eliminar $and del filtro para que no se procese nuevamente
      delete filter.$and;
    }
    
    // Primero procesamos los filtros de fecha especiales (_from y _to)
    const dateRangeFilters = new Set<string>();
    // Procesamos los filtros LIKE especiales (_like y _ilike)
    const likeFilters = new Set<string>();
    
    // Identificar pares de filtros de rango de fechas
    Object.keys(filter).forEach(key => {
      if (key.endsWith('_from') || key.endsWith('_to')) {
        const baseKey = key.replace(/_from$|_to$/, '');
        dateRangeFilters.add(baseKey);
      } else if (key.endsWith('_like') || key.endsWith('_ilike')) {
        const baseKey = key.replace(/_like$|_ilike$/, '');
        likeFilters.add(baseKey);
      }
    });
    
    // Procesar los filtros de rango de fechas
    dateRangeFilters.forEach(baseKey => {
      const fromKey = `${baseKey}_from`;
      const toKey = `${baseKey}_to`;
      
      if (filter[fromKey] && filter[toKey]) {
        // Aplicar filtro BETWEEN para el rango de fechas
        queryBuilder.andWhere(`${entityAlias}.${baseKey} BETWEEN :${fromKey} AND :${toKey}`, {
          [fromKey]: filter[fromKey],
          [toKey]: filter[toKey]
        });
        
        // Eliminar estos filtros para que no se procesen nuevamente
        delete filter[fromKey];
        delete filter[toKey];
      } else if (filter[fromKey]) {
        // Solo tenemos fecha de inicio
        queryBuilder.andWhere(`${entityAlias}.${baseKey} >= :${fromKey}`, {
          [fromKey]: filter[fromKey]
        });
        delete filter[fromKey];
      } else if (filter[toKey]) {
        // Solo tenemos fecha de fin
        queryBuilder.andWhere(`${entityAlias}.${baseKey} <= :${toKey}`, {
          [toKey]: filter[toKey]
        });
        delete filter[toKey];
      }
    });
    
    // Procesar los filtros LIKE
    likeFilters.forEach(baseKey => {
      const likeKey = `${baseKey}_like`;
      const iLikeKey = `${baseKey}_ilike`;
      
      // Verificar si es un filtro para una propiedad anidada (con notación de punto)
      const isNestedProperty = baseKey.includes('.');
      
      if (filter[likeKey]) {
        // Aplicar filtro LIKE case-sensitive
        const paramKey = `${baseKey.replace('.', '_')}_like_param`;
        const searchValue = `%${filter[likeKey]}%`;
        
        if (isNestedProperty) {
          const [parentKey, childKey] = baseKey.split('.');
          
          // Verificar si es una relación o una propiedad JSON
          const isRelationFilter = queryBuilder.expressionMap.aliases.some(
            alias => alias.name === parentKey
          );
          
          if (isRelationFilter) {
            // Filtro LIKE por relación (ej: users.name_like)
            queryBuilder.andWhere(`${parentKey}.${childKey} LIKE :${paramKey}`, {
              [paramKey]: searchValue
            });
          } else {
            // Filtro LIKE por propiedad JSON (ej: address.province_like)
            queryBuilder.andWhere(`(${entityAlias}.${parentKey}).${childKey} LIKE :${paramKey}`, {
              [paramKey]: searchValue
            });
          }
        } else {
          // Filtro LIKE para propiedades simples
          queryBuilder.andWhere(`${entityAlias}.${baseKey} LIKE :${paramKey}`, {
            [paramKey]: searchValue
          });
        }
        
        // Eliminar el filtro procesado
        delete filter[likeKey];
      }
      
      if (filter[iLikeKey]) {
        // Aplicar filtro ILIKE case-insensitive (funciona en PostgreSQL)
        const paramKey = `${baseKey.replace('.', '_')}_ilike_param`;
        const searchValue = `%${filter[iLikeKey]}%`;
        
        if (isNestedProperty) {
          const [parentKey, childKey] = baseKey.split('.');
          
          // Verificar si es una relación o una propiedad JSON
          const isRelationFilter = queryBuilder.expressionMap.aliases.some(
            alias => alias.name === parentKey
          );
          
          if (isRelationFilter) {
            // Filtro ILIKE por relación (ej: users.name_ilike)
            queryBuilder.andWhere(`LOWER(${parentKey}.${childKey}) LIKE LOWER(:${paramKey})`, {
              [paramKey]: searchValue
            });
          } else {
            // Filtro ILIKE por propiedad JSON (ej: address.province_ilike)
            queryBuilder.andWhere(`LOWER((${entityAlias}.${parentKey}).${childKey}) LIKE LOWER(:${paramKey})`, {
              [paramKey]: searchValue
            });
          }
        } else {
          // Filtro ILIKE para propiedades simples (usando LOWER para compatibilidad con diferentes DB)
          queryBuilder.andWhere(`LOWER(${entityAlias}.${baseKey}) LIKE LOWER(:${paramKey})`, {
            [paramKey]: searchValue
          });
        }
        
        // Eliminar el filtro procesado
        delete filter[iLikeKey];
      }
    });
    
    // Procesar el resto de filtros normales
    Object.entries(filter).forEach(([key, value]) => {
      // Ignorar operadores especiales que ya fueron procesados
      if (key === '$or' || key === '$and') {
        return;
      }
      
      this.applySingleFilter(queryBuilder, key, value, entityAlias);
    });
  }

  /**
   * Aplica un filtro individual al query builder
   * @param queryBuilder Query builder de TypeORM
   * @param key Clave del filtro
   * @param value Valor del filtro
   * @param entityAlias Alias de la entidad principal
   */
  private static applySingleFilter<T>(
    queryBuilder: SelectQueryBuilder<T>,
    key: string,
    value: any,
    entityAlias: string
  ): void {
      // Verificar si es un filtro para una propiedad anidada (con notación de punto)
      const isNestedProperty = key.includes('.');
      
      if (isNestedProperty) {
        const [parentKey, childKey] = key.split('.');
        const paramKey = `${parentKey}_${childKey}`;
        
        // Determinar si el valor es un array o un valor único
        if (Array.isArray(value)) {
          // Verificar si es una relación o una propiedad JSON
          const isRelationFilter = queryBuilder.expressionMap.aliases.some(
            alias => alias.name === parentKey
          );
          
          if (isRelationFilter) {
            // Filtro por relación (ej: enterprise.name)
            queryBuilder.andWhere(`${parentKey}.${childKey} IN (:...${paramKey})`, {
              [paramKey]: value
            });
          } else {
            // Filtro por propiedad JSON (ej: address.province)
            queryBuilder.andWhere(`(${entityAlias}.${parentKey}).${childKey} IN (:...${paramKey})`, {
              [paramKey]: value
            });
          }
        } else {
          // Si es un valor único (no array)
          // Manejar valores null explícitamente
          if (value === null || value === undefined) {
            const isRelationFilter = queryBuilder.expressionMap.aliases.some(
              alias => alias.name === parentKey
            );
            
            if (isRelationFilter) {
              // Filtro IS NULL por relación
              queryBuilder.andWhere(`${parentKey}.${childKey} IS NULL`);
            } else {
              // Filtro IS NULL por propiedad JSON
              queryBuilder.andWhere(`(${entityAlias}.${parentKey}).${childKey} IS NULL`);
            }
          } else {
            const isRelationFilter = queryBuilder.expressionMap.aliases.some(
              alias => alias.name === parentKey
            );
            
            if (isRelationFilter) {
              // Filtro por relación (ej: enterprise.name)
              queryBuilder.andWhere(`${parentKey}.${childKey} = :${paramKey}`, {
                [paramKey]: value
              });
            } else {
              // Filtro por propiedad JSON (ej: address.province)
              queryBuilder.andWhere(`(${entityAlias}.${parentKey}).${childKey} = :${paramKey}`, {
                [paramKey]: value
              });
            }
          }
        }
      } else {
        // Filtro para propiedades simples (no anidadas)
        if (Array.isArray(value)) {
          queryBuilder.andWhere(`${entityAlias}.${key} IN (:...${key})`, { [key]: value });
        } else if (value === null || value === undefined) {
          // Manejar valores null explícitamente usando IS NULL
          queryBuilder.andWhere(`${entityAlias}.${key} IS NULL`);
        } else {
          queryBuilder.andWhere(`${entityAlias}.${key} = :${key}`, { [key]: value });
        }
      }
  }

  /**
   * Construye una condición de filtro para usar en consultas OR
   * @param key Clave del filtro
   * @param value Valor del filtro
   * @param entityAlias Alias de la entidad principal
   * @param paramKey Clave del parámetro para usar en la consulta
   * @param params Objeto para almacenar parámetros
   * @returns Condición SQL como string o null
   */
  private static buildFilterCondition(
    key: string,
    value: any,
    entityAlias: string,
    paramKey: string,
    params: Record<string, any>
  ): string | null {
    const isNestedProperty = key.includes('.');
    
    if (isNestedProperty) {
      const [parentKey, childKey] = key.split('.');
      
      if (Array.isArray(value)) {
        params[paramKey] = value;
        return `${entityAlias}.${key} IN (:...${paramKey})`;
      } else if (value === null || value === undefined) {
        return `${entityAlias}.${key} IS NULL`;
      } else {
        params[paramKey] = value;
        return `${entityAlias}.${key} = :${paramKey}`;
      }
    } else {
      if (Array.isArray(value)) {
        params[paramKey] = value;
        return `${entityAlias}.${key} IN (:...${paramKey})`;
      } else if (value === null || value === undefined) {
        return `${entityAlias}.${key} IS NULL`;
      } else {
        params[paramKey] = value;
        return `${entityAlias}.${key} = :${paramKey}`;
      }
    }
  }

  /**
   * Aplica ordenación al query builder
   * @param queryBuilder Query builder de TypeORM
   * @param sortField Campo por el que ordenar
   * @param sortOrder Dirección de ordenación (ASC/DESC)
   * @param entityAlias Alias de la entidad principal
   */
  private static applySort<T>(
    queryBuilder: SelectQueryBuilder<T>,
    sortField: string | undefined,
    sortOrder: 'ASC' | 'DESC',
    entityAlias: string
  ): void {
    if (!sortField) return;
    
    // Verificar si es una propiedad anidada (con notación de punto)
    if (sortField.includes('.')) {
      const [parentKey, childKey] = sortField.split('.');
      
      // Verificar si es una relación o una propiedad JSON
      const isRelationSort = queryBuilder.expressionMap.aliases.some(
        alias => alias.name === parentKey
      );
      
      if (isRelationSort) {
        // Ordenar por campo de relación (ej: enterprise.name)
        queryBuilder.orderBy(`${parentKey}.${childKey}`, sortOrder);
        
        // Añadir ordenación secundaria para facturas por serie y número
        if (entityAlias === 'invoice') {
          // Verificar si hay relación con series cargada
          const hasSeriesRelation = queryBuilder.expressionMap.aliases.some(
            alias => alias.name === 'series'
          );
          
          if (hasSeriesRelation) {
            // Ordenar secundariamente por serie (ascendente) y luego por número de serie (descendente)
            queryBuilder.addOrderBy('series.series', 'ASC');
            queryBuilder.addOrderBy(`${entityAlias}.seriesNumber`, 'DESC');
          }
        }
      } else {
        // Ordenar por propiedad JSON (ej: address.province)
        queryBuilder.orderBy(`(${entityAlias}.${parentKey}).${childKey}`, sortOrder);
      }
    } else {
      // Ordenar por propiedad simple
      queryBuilder.orderBy(`${entityAlias}.${sortField}`, sortOrder);
      
      // Añadir ordenación secundaria para facturas por serie y número
      if (entityAlias === 'invoice') {
        // Verificar si hay relación con series cargada
        const hasSeriesRelation = queryBuilder.expressionMap.aliases.some(
          alias => alias.name === 'series'
        );
        
        if (hasSeriesRelation) {
          // Ordenar secundariamente por serie (ascendente) y luego por número de serie (descendente)
          queryBuilder.addOrderBy('series.series', 'ASC');
          queryBuilder.addOrderBy(`${entityAlias}.seriesNumber`, 'DESC');
        }
      }
    }
  }
} 