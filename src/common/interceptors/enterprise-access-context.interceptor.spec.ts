import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import { AccessContext } from 'src/helpers/enterprise-access/access-context';
import { getEnterpriseAccessContext } from 'src/helpers/enterprise-access/enterprise-access.storage';
import { EnterpriseAccessContextInterceptor } from './enterprise-access-context.interceptor';

/**
 * Construye un ExecutionContext HTTP mínimo con o sin `accessContext`.
 *
 * @param requestOverrides - Campos de la petición simulada
 * @returns Contexto Nest para el interceptor
 */
function createExecutionContext(
  requestOverrides: Partial<Request> = {},
): ExecutionContext {
  const request = {
    query: {},
    params: {},
    ...requestOverrides,
  } as Request;

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

/**
 * Pruebas del interceptor que copia `req.accessContext` a AsyncLocalStorage.
 * Si falla, los servicios no pueden autorizar entidades sin recibir `Request`.
 */
describe('EnterpriseAccessContextInterceptor', () => {
  const interceptor = new EnterpriseAccessContextInterceptor();
  const accessContext: AccessContext = {
    userId: 'user-uuid',
    isGlobalAdmin: false,
    allowedEnterpriseIds: ['enterprise-uuid'],
  };

  it('reenvía el handler sin ALS cuando la petición no tiene accessContext', async () => {
    const callHandler: CallHandler = {
      handle: () => {
        expect(getEnterpriseAccessContext()).toBeUndefined();
        return of('sin-contexto');
      },
    };

    await expect(
      firstValueFrom(interceptor.intercept(createExecutionContext(), callHandler)),
    ).resolves.toBe('sin-contexto');
    expect(getEnterpriseAccessContext()).toBeUndefined();
  });

  it('hace visible el accessContext dentro del handler HTTP', async () => {
    let contextInsideHandler: AccessContext | undefined;

    const callHandler: CallHandler = {
      handle: () => {
        contextInsideHandler = getEnterpriseAccessContext();
        return of('con-contexto');
      },
    };

    await expect(
      firstValueFrom(
        interceptor.intercept(createExecutionContext({ accessContext }), callHandler),
      ),
    ).resolves.toBe('con-contexto');
    expect(contextInsideHandler).toEqual(accessContext);
    expect(getEnterpriseAccessContext()).toBeUndefined();
  });

  it('propaga el error del handler al suscriptor', async () => {
    const callHandler: CallHandler = {
      handle: () => throwError(() => new Error('fallo-handler')),
    };

    await expect(
      firstValueFrom(
        interceptor.intercept(createExecutionContext({ accessContext }), callHandler),
      ),
    ).rejects.toThrow('fallo-handler');
  });

  it('completa el observable cuando el handler termina', (done) => {
    const callHandler: CallHandler = {
      handle: () => of('ok'),
    };

    interceptor.intercept(createExecutionContext({ accessContext }), callHandler).subscribe({
      next: (value) => expect(value).toBe('ok'),
      complete: () => done(),
      error: (error) => done(error),
    });
  });

  it('cancela la suscripción interna al darse de baja el observable envolvente', () => {
    let innerUnsubscribed = false;
    const callHandler: CallHandler = {
      handle: () =>
        new Observable((subscriber) => {
          subscriber.next('parcial');
          return () => {
            innerUnsubscribed = true;
          };
        }),
    };

    const wrapper: Observable<unknown> = interceptor.intercept(
      createExecutionContext({ accessContext }),
      callHandler,
    );
    const subscription = wrapper.subscribe();
    subscription.unsubscribe();
    expect(innerUnsubscribed).toBe(true);
  });
});
