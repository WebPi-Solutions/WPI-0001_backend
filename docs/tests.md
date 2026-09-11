# Tests del backend

Este documento describe cómo ejecutar la batería de pruebas del backend NestJS, qué resultado es normal y qué cubre (y qué no) la suite.

Los tests unitarios viven junto al código en `src/**/*.spec.ts`. Jest está configurado en `package.json` con `rootDir: src` y el alias `src/*`, el mismo que usa la aplicación.

## Cómo ejecutarlos

Desde el directorio `backend/`, con las dependencias instaladas (`npm install`):

```bash
# Suite unitaria completa (la habitual en desarrollo y CI)
npm test

# Reejecutar al guardar
npm run test:watch

# E2E (también genera HTML en coverage-e2e/; requiere Docker)
npm run test:e2e

# Un archivo o un patrón
npm test -- src/api/invoice/invoice.service.spec.ts
npm test -- src/entities/client

# Depurar con inspector de Node (un proceso, sin workers)
npm run test:debug
```

La suite e2e (`npm run test:e2e`) es independiente: usa `test/jest-e2e.json`, Testcontainers (PostgreSQL en Docker) y no forma parte de `npm test`. Ver [Pruebas e2e](#pruebas-e2e).

## Qué esperar

Una ejecución correcta de `npm test` termina con **todas las suites en verde**. A modo de referencia, la última pasada de la suite unitaria reportó:

- **104** suites
- **1328** tests
- **0** fallos

Tiempos típicos: unos **25–35 segundos** en un portátil reciente.

### Logs que no indican fallo

Muchos tests comprueban ramas de error. Nest y los servicios escriben `ERROR` / `WARN` en consola cuando se fuerza un 404, un JSON inválido, un fallo de OpenAI, OCR, Dropbox, etc. **Eso es esperado**: el test pasa si la excepción o el código HTTP coinciden con lo que se afirma.

Ejemplos habituales:

- `HttpException` / `BadRequestException` en controladores y servicios
- `OpenaiService` sin API key o con JSON inválido
- `OcrService` cuando Tesseract no está disponible (el test lo simula)
- `DropboxService` ante un 409 de carpeta inexistente

Un fallo real se ve como `FAIL` en una suite, un `Expected ... Received ...` o un error de TypeScript al cargar el spec (por ejemplo, un import que ya no existe).

### Cobertura

`npm test` genera `coverage/` (fuera de `src/`, está en `.gitignore`). El HTML está en `coverage/lcov-report/index.html`.

La recolección incluye todo `src/**` salvo `*.spec.ts` y `src/test-utils/**`. El objetivo de la suite **unitaria** es **100%** en statements, branches, functions y lines sobre ese conjunto (producción).

Los e2e tienen un informe **aparte**, para no pisar el de unitarios: `npm run test:e2e` escribe `coverage-e2e/lcov-report/index.html` (y `coverage-e2e/index.html`). El umbral es el mismo que en unitarios: **100%** de statements, branches, functions y lines sobre `src/**` (salvo `*.spec.ts` y `test-utils`).

Para conseguirlo, `test/jest-e2e.json` ejecuta:

1. Los `*.e2e-spec.ts` de `test/e2e/` (contrato HTTP real contra Postgres de Testcontainers: 401 sin Bearer, 400 sin `enterpriseId`, 403 de otra empresa, 404 IDOR, 200 propio).
2. Los `*.spec.ts` de `src/` (mismos casos unitarios que ya cubren cada función de servicios, repositorios, SDKs mockeados y ramas de error).

Así el HTML de `coverage-e2e` refleja el 100% del código de producción, no solo las líneas que pasa un `supertest`.

## Alcance de la suite unitaria

Los tests unitarios **no levantan Postgres, Stripe, Firebase, OpenAI ni Dropbox**. Las dependencias se sustituyen por mocks (`jest.fn()`, `getRepositoryToken`, módulos `jest.mock`).

### Qué sí se prueba

| Área | Qué se verifica |
|---|---|
| **Controllers** (`src/api/**`) | Validación de query (`enterpriseId`, `cardId`, filtros JSON), delegación al servicio y códigos HTTP de error |
| **Services de API** | Reglas de negocio: duplicados, estados (borrador vs emitido), borrado con relaciones, persistencia de datos de cliente/emisor, etc. |
| **Repositorios** | CRUD, conteos de listado, `createQueryBuilder`, SQL de subtotales (SQL y parámetros, no la base real) |
| **Servicios de infraestructura** | Stripe, OpenAI, OCR, ficheros, Dropbox, Firebase; siempre con el SDK o HTTP mockeados |
| **Helpers** | `QueryBuilderService` (filtros, paginación, joins) y `EnterpriseAccessService` (contexto, 403, 404 IDOR, bypass admin) |
| **Guards / interceptors** | `EnterpriseAccessGuard` (skip, require, 403, admin) y serialización `@MapResponse` |
| **Middlewares** | Firebase (Bearer, token, usuario conocido/desconocido) y Basic Auth de Swagger |
| **Módulos** | Metadata de `@Module` y, en `ApiModule` / `EntitiesModule`, el `register()` dinámico **sin** conectar TypeORM |
| **Transversal** | Decorador `@MapResponse`, interceptor de serialización, `AppService`, `AppModule.configure` (middleware Firebase) |

Convenciones:

- Un spec por unidad: `invoice.service.ts` → `invoice.service.spec.ts`
- Descripciones de casos en **español**; nombres de código en **inglés**
- Los controllers se montan con `Test.createTestingModule` y el servicio correspondiente mockeado
- Los repositorios reciben `getRepositoryToken(Entidad)` y, si aplica, un mock de `QueryBuilderService`

La autorización multi-empresa se documenta en [Acceso por empresa](./enterprise-access.md). El RBAC de rol, en [Permisos de rol de empresa](./enterprise-permissions.md). Specs de referencia: `enterprise-access.service.spec.ts`, `enterprise-access.guard.spec.ts`, `enterprise-permission.guard.spec.ts` y `test/e2e/access/permissions.e2e-spec.ts`.

### Qué no cubre (a propósito)

- **DTOs y entidades TypeORM**: son formas de datos, no comportamiento.
- **Prompts y schemas de OpenAI**: texto y JSON estáticos.
- **`main.ts`**: arranque del proceso HTTP.
- **Integración real en la suite unitaria**: no hay transacciones contra Postgres, ni webhooks de Stripe, ni verificación de tokens Firebase de verdad. Eso lo cubren los e2e con Testcontainers y mocks de terceros.
- **Contrato HTTP completo**: no se usa `supertest` en la suite unitaria; se invocan métodos del controller.
- **UI / frontend**: fuera de este proyecto.

Si un módulo Nest usa `TypeOrmModule.forRoot` o `forFeature`, los tests **no compilán ese grafo** (evitaría exigir una base). Se comprueba la clase, la metadata o `register()`.

## Cómo añadir un test nuevo

1. Colocar `*.spec.ts` al lado del fichero de producción.
2. Mockear repositorios e integraciones; no instanciar TypeORM real.
3. Cubrir el camino feliz **y** los errores que el código lanza (`HttpException`, validaciones).
4. Si el servicio inyecta `EnterpriseAccessService`, incluirlo en `providers` (ver [Acceso por empresa](./enterprise-access.md#cómo-añadir-un-endpoint-nuevo)).
5. Ejecutar el spec aislado y después `npm test` para no romper la suite.

Plantilla mínima de un servicio:

```typescript
const testingModule = await Test.createTestingModule({
  providers: [
    InvoiceService,
    { provide: InvoiceRepository, useValue: invoiceRepository },
    {
      provide: EnterpriseAccessService,
      useValue: {
        assertCurrentEntityAccessible: jest.fn(),
        mergeRelationNames: (relations?: string[], required: string[] = []) =>
          [...new Set([...(relations ?? []), ...required])],
      },
    },
  ],
}).compile();
```

Para un repositorio:

```typescript
{
  provide: getRepositoryToken(Invoice),
  useValue: { save: jest.fn(), findOne: jest.fn(), manager: { query: jest.fn() } },
}
```

## Pruebas e2e

Los e2e viven bajo `test/e2e/` y se ejecutan **en un solo proceso** contra un PostgreSQL **efímero en Docker** (Testcontainers). No usan la base de develop/cloud.

```
test/e2e/
  harness/                         # Arranque, seed, cliente HTTP. No contiene specs.
  access/                          # Autenticación y aislamiento transversal (usuario sin empresas).
  modules/<mismo-nombre-que-src/api>/   # Un spec por controlador HTTP.
```

El alias `@e2e/*` apunta a `test/e2e/harness/` (Jest + `tsconfig.json`). Los specs importan `auth`, `http` y `world` desde ahí.

```bash
# Requiere Docker en marcha. Al terminar escribe coverage-e2e/lcov-report/index.html
npm run test:e2e

# Un módulo o carpeta (también regenera el informe HTML)
npm run test:e2e -- modules/client
npm run test:e2e -- access
```

Qué ocurre al lanzarlos:

1. `test/e2e/harness/global-setup.js` arranca `postgres:16-alpine` y escribe la conexión en `test/e2e/harness/.postgres.json` (está en `.gitignore`).
2. `test/e2e/harness/jest-env.js` fija `DATABASE_*`, `E2E_TEST=true` y `TYPEORM_SYNCHRONIZE=true` **antes** de importar `AppModule`, para que `dotenv` no apunte a develop.
3. Se compila la app real y TypeORM recrea el esquema vacío (`synchronize` + `dropSchema` solo con `E2E_TEST`). El contenedor **no** carga `databases/develop.sql` ni `production.sql`.
4. `startE2eWorld()` en `test/e2e/harness/world.ts` llama a `seedE2eDatabase()` y puebla la base. Ver [Dataset e2e](#dataset-e2e-cómo-se-puebla-la-base).
5. Firebase, Stripe, Dropbox, OpenAI y el procesado de PDF se sustituyen por mocks en el harness HTTP. El Bearer token **es el email** del usuario sembrado (ver `test/e2e/harness/auth.ts`).
6. Jest también corre los `src/**/*.spec.ts` en el mismo proceso para completar el 100% de cobertura (servicios de infraestructura, `catch` con repositorio mockeado, `main.ts`, etc.).
7. Al terminar, `test/e2e/harness/global-teardown.js` detiene el contenedor.

### Dataset e2e: cómo se puebla la base

No hay dump SQL ni fixtures `.sql`. Los datos se insertan en código con `repository.save(...)` de TypeORM.

| Pieza | Dónde |
|---|---|
| Contenedor vacío (`postgres:16-alpine`, base `wpi_e2e`) | `test/e2e/harness/global-setup.js` |
| Esquema (tablas desde las entidades) | TypeORM al arrancar Nest (`E2E_TEST=true`) |
| Filas de prueba | `seedE2eDatabase()` en [`test/e2e/harness/seed.ts`](../test/e2e/harness/seed.ts) |
| Quién llama a la semilla | `startE2eWorld()` → `bootstrapE2eWorld()` en `test/e2e/harness/world.ts` |
| Lectura en los specs | `getE2eSeed()` (misma instancia para toda la suite) |
| Correos / Bearer | `E2E_EMAIL` en `test/e2e/harness/auth.ts` |

`seedE2eDatabase()` persiste un juego determinista de **dos tenants aislados**:

- **Empresa A** y **Empresa B** (`stripeId` `cus_e2e_a` / `cus_e2e_b`)
- **Usuario A** (`a@e2e.test`) — rol Administrador de A (`*`)
- **Usuario B** (`b@e2e.test`) — rol Administrador de B
- **Admin global** (`admin@e2e.test`) — `users.role === administrator`
- **Outsider** (`outsider@e2e.test`) — sin empresas
- **Empleado A** (`empleado-a@e2e.test`) — rol Empleado de A (`permissions: {}`, deny by default)
- Roles Administrador / Empleado en cada empresa
- Un recurso de cada tipo en A y en B (cliente, proveedor, serie, factura, presupuesto, gasto, recurrente, festivo, horario, fichaje, vacación, turno, solicitud de IA)

Los tests HTTP usan esos ids (`seed.invoiceA.id`, `seed.holidayB.id`, …). Algunos specs (p. ej. el ciclo CRUD) crean filas extra por la API durante el caso; el dataset base no se vuelve a insertar.

Enfoque HTTP: **control de acceso multi-empresa** y ciclo de vida CRUD. La cobertura al 100% de cada función de servicio se obtiene reejecutando los specs de `src/`. Un spec nuevo de API se coloca en `test/e2e/modules/<recurso>/`; un caso que cruce varios módulos va en `test/e2e/access/`.

| Qué se comprueba | Código esperado |
|---|---|
| Sin `Authorization` | 401 |
| Token inválido o email desconocido | 401/403 |
| `enterpriseId` de otra empresa en query/body | 403 |
| Recurso de otra empresa por UUID (IDOR) | **404** (no se revela que existe) |
| Recurso propio / admin global | 200 o 201 |
| Usuario de la empresa **sin** concesión de rol (deny by default) | **403** (no 404) |
| Usuario sin empresas en rutas de tenant | 403; listado de empresas vacío; catálogo Stripe sí (skip) |
| Alta de usuario con query de A y vínculo a B | 403 |
| Crear empresa si no eres administrador global | 403 |

Requisitos: Node.js, `npm install --legacy-peer-deps` en `backend/`, **Docker**. No hace falta `.env` ni Postgres en la nube.

Si Docker no está arrancado, el `globalSetup` falla con un mensaje pidiendo comprobar el daemon.

## Requisitos de entorno

La suite unitaria **no exige** un `.env` válido ni servicios externos. Algunos specs fijan variables (`FIREBASE_PRIVATE_KEY`, rutas de Dropbox) en el propio test.

Sí hace falta:

- Node.js compatible con el proyecto
- `npm install` en `backend/`

Tesseract, credenciales Stripe/OpenAI/Dropbox o Postgres **no** son necesarios para `npm test`.
