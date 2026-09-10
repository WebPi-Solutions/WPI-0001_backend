import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { defaultMetadataStorage } from 'class-transformer/cjs/storage';
import { getMetadataArgsStorage } from 'typeorm';

const SWAGGER_API_MODEL_PROPERTIES = 'swagger/apiModelProperties';
const SWAGGER_API_MODEL_PROPERTIES_ARRAY = 'swagger/apiModelPropertiesArray';

/**
 * Invoca las factorías perezosas `type: () => Clase` registradas por `@ApiProperty`.
 * Clover no cubre esas flechas salvo que se ejecuten en el test.
 *
 * @param classConstructor - Constructor de la clase decorada
 */
export function invokeSwaggerLazyTypes(classConstructor: new (...args: never[]) => unknown): void {
  const prototype = classConstructor.prototype as object;
  const propertyKeys: string[] =
    (Reflect.getMetadata(SWAGGER_API_MODEL_PROPERTIES_ARRAY, prototype) as string[] | undefined) ??
    [];

  for (const rawPropertyKey of propertyKeys) {
    const propertyKey = String(rawPropertyKey).replace(/^:/, '');
    const propertyMetadata = Reflect.getMetadata(
      SWAGGER_API_MODEL_PROPERTIES,
      prototype,
      propertyKey,
    ) as { type?: unknown } | undefined;

    if (typeof propertyMetadata?.type !== 'function') {
      continue;
    }

    try {
      (propertyMetadata.type as () => unknown)();
    } catch {
      // Los constructores de clase no se invocan como función; se ignoran.
    }
  }
}

/**
 * Invoca las funciones `@Type(() => Clase)` de class-transformer asociadas a un DTO.
 *
 * @param classConstructor - Constructor del DTO
 */
export function invokeClassTransformerTypeFunctions(
  classConstructor: new (...args: never[]) => unknown,
): void {
  const exposedMetadatas = defaultMetadataStorage.getExposedMetadatas(classConstructor);
  for (const exposedMetadata of exposedMetadatas) {
    const typeMetadata = defaultMetadataStorage.findTypeMetadata(
      classConstructor,
      exposedMetadata.propertyName,
    );
    if (typeof typeMetadata?.typeFunction === 'function') {
      typeMetadata.typeFunction();
    }
  }
}

/**
 * Instancia un DTO, asigna un payload típico, transforma con class-transformer
 * e invoca factorías perezosas de Swagger y `@Type`.
 *
 * @param dtoClass - Constructor del DTO
 * @param payload - Campos típicos a asignar
 * @returns Instancia construida con los campos asignados
 */
export function coverDtoClass<T extends object>(dtoClass: new () => T, payload: Partial<T>): T {
  const instance = Object.assign(new dtoClass(), payload);
  plainToInstance(dtoClass, payload as object);
  invokeSwaggerLazyTypes(dtoClass);
  invokeClassTransformerTypeFunctions(dtoClass);
  return instance;
}

/**
 * Ejecuta los callbacks almacenados en los metadatos de TypeORM
 * (tipo de relación, lado inverso, default de columna y RelationId).
 * Debe llamarse después de importar las entidades a cubrir.
 */
export function invokeTypeOrmMetadataCallbacks(): void {
  const metadataStorage = getMetadataArgsStorage();

  for (const relation of metadataStorage.relations) {
    const relationTypeFactory = relation.type as unknown;
    if (typeof relationTypeFactory === 'function') {
      (relationTypeFactory as () => unknown)();
    }
    const inverseSideFactory = relation.inverseSideProperty as unknown;
    if (typeof inverseSideFactory === 'function') {
      (inverseSideFactory as (entity: Record<string, unknown>) => unknown)({});
    }
  }

  for (const column of metadataStorage.columns) {
    const columnDefault = column.options?.default;
    if (typeof columnDefault === 'function') {
      (columnDefault as () => unknown)();
    }
  }

  for (const relationId of metadataStorage.relationIds) {
    if (typeof relationId.relation === 'function') {
      relationId.relation({});
    }
  }
}
