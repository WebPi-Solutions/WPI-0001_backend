import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MAP_RESPONSE_KEY } from '../decorators/map-response.decorator';

/**
 * Interceptor global que transforma la respuesta al DTO indicado por `@MapResponse()`.
 * Usa `excludeExtraneousValues: true` para que solo se serialicen propiedades con `@Expose()`.
 *
 * Soporta:
 * - Objetos simples
 * - Arrays
 * - Respuestas paginadas con forma `{ items: [...], ... }`
 */
@Injectable()
export class MapResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  /**
   * Intercepta la respuesta y la convierte al DTO configurado en metadata del handler.
   *
   * @param context - Contexto de ejecución NestJS
   * @param next - Siguiente manejador en la cadena
   * @returns Observable con el cuerpo ya transformado cuando aplique
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const dto = this.reflector.get<new (...args: unknown[]) => unknown>(
      MAP_RESPONSE_KEY,
      context.getHandler(),
    );

    if (!dto) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data: unknown) => {
        if (
          typeof data === 'string' ||
          typeof data === 'number' ||
          typeof data === 'boolean'
        ) {
          return data;
        }

        if (data === null || data === undefined) {
          return data;
        }

        const options = { excludeExtraneousValues: true };

        if (
          data &&
          typeof data === 'object' &&
          'items' in (data as Record<string, unknown>) &&
          Array.isArray((data as { items: unknown }).items)
        ) {
          const paginated = data as { items: unknown[] };
          return {
            ...data,
            items: plainToInstance(dto, paginated.items, options),
          };
        }

        if (Array.isArray(data)) {
          return plainToInstance(dto, data, options);
        }

        return plainToInstance(dto, data, options);
      }),
    );
  }
}
