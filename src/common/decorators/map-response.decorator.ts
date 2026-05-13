import { SetMetadata } from '@nestjs/common';

/**
 * Clave de metadata para almacenar el DTO de respuesta asociado a un handler HTTP.
 */
export const MAP_RESPONSE_KEY = 'map_response_dto';

/**
 * Decorador que indica qué clase DTO debe usar el interceptor global para transformar la salida.
 * Solo establece metadata; la transformación la ejecuta `MapResponseInterceptor`.
 *
 * @param dto - Clase del DTO con propiedades marcadas con `@Expose()`
 * @returns Decorador de método compatible con NestJS
 *
 * @example
 * ```typescript
 * @MapResponse(EnterpriseResponseDto)
 * @Get(':id')
 * findById() { ... }
 * ```
 */
export const MapResponse = (dto: new (...args: unknown[]) => unknown) =>
  SetMetadata(MAP_RESPONSE_KEY, dto);
