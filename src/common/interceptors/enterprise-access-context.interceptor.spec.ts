import { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import { AccessContext } from 'src/common/helpers/enterprise-access/access-context';
import { getEnterpriseAccessContext } from 'src/common/helpers/enterprise-access/enterprise-access.storage';
import { EnterpriseAccessContextInterceptor } from './enterprise-access-context.interceptor';

/**
 * Construye un ExecutionContext HTTP mínimo con o sin `accessContext`.
 *
 * @param accessContext - Contexto de acceso de la petición, si existe
 * @returns Contexto Nest simulado
 */
function createExecutionContext(accessContext?: AccessContext): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ accessContext }),
    }),
  } as ExecutionContext;
}

/**
 * Pruebas del interceptor que copia `req.accessContext` al AsyncLocalStorage.
 */
describe('EnterpriseAccessContextInterceptor', () => {
  const interceptor = new EnterpriseAccessContextInterceptor();
  const accessContext: AccessContext = {
    userId: 'user-uuid',
    isGlobalAdmin: false,
    allowedEnterpriseIds: ['enterprise-uuid'],
  };

  it('delega al handler si la petición no tiene accessContext', async () => {
    const result = await firstValueFrom(
      interceptor.intercept(createExecutionContext(), {
        handle: () => of('sin-contexto'),
      }),
    );

    expect(result).toBe('sin-contexto');
  });

  it('ejecuta el handler dentro del AsyncLocalStorage', async () => {
    let seenInsideHandler: AccessContext | undefined;

    const result = await firstValueFrom(
      interceptor.intercept(createExecutionContext(accessContext), {
        handle: () => {
          seenInsideHandler = getEnterpriseAccessContext();
          return of('con-contexto');
        },
      }),
    );

    expect(result).toBe('con-contexto');
    expect(seenInsideHandler).toEqual(accessContext);
  });

  it('propaga el error del handler', async () => {
    await expect(
      firstValueFrom(
        interceptor.intercept(createExecutionContext(accessContext), {
          handle: () => throwError(() => new Error('fallo del handler')),
        }),
      ),
    ).rejects.toThrow('fallo del handler');
  });

  it('cancela la suscripción interna al desuscribirse el cliente', () => {
    const unsubscribeInnerSubscription = jest.fn();
    const callHandler = {
      handle: () => ({
        subscribe: () => ({ unsubscribe: unsubscribeInnerSubscription }),
      }),
    } as unknown as CallHandler;

    const subscription = interceptor
      .intercept(createExecutionContext(accessContext), callHandler)
      .subscribe();
    subscription.unsubscribe();

    expect(unsubscribeInnerSubscription).toHaveBeenCalled();
  });
});
