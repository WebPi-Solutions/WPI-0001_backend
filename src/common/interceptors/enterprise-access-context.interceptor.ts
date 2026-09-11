import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { runWithEnterpriseAccessContext } from 'src/common/helpers/enterprise-access/enterprise-access.storage';

/**
 * Copia `req.accessContext` al AsyncLocalStorage para que los servicios
 * puedan autorizar entidades sin recibir `Request`.
 */
@Injectable()
export class EnterpriseAccessContextInterceptor implements NestInterceptor {
  /**
   * Envuelve el handler HTTP con el contexto de acceso de la petición.
   *
   * @param executionContext - Contexto Nest
   * @param next - Continuación de la cadena
   * @returns Observable de la respuesta
   */
  intercept(
    executionContext: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const request = executionContext.switchToHttp().getRequest<Request>();
    const accessContext = request.accessContext;
    if (!accessContext) {
      return next.handle();
    }

    return new Observable((subscriber) => {
      const subscription = runWithEnterpriseAccessContext(accessContext, () =>
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (error) => subscriber.error(error),
          complete: () => subscriber.complete(),
        }),
      );
      return () => subscription.unsubscribe();
    });
  }
}
