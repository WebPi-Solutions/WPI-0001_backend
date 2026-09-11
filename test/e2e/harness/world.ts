jest.mock('../../../src/common/middleware/firebase/firebase.service', () => ({
  firebaseAdmin: {
    auth: () => ({
      verifyIdToken: async (token: string) => {
        if (!token || token === 'invalid-token') {
          throw new Error('Token de Firebase inválido');
        }
        return { email: token };
      },
      createUser: async ({ email }: { email: string }) => ({
        uid: `uid-${email}`,
        email,
      }),
      getUserByEmail: async () => {
        throw new Error('Usuario no encontrado en Firebase');
      },
      deleteUser: async () => undefined,
      updateUser: async () => ({}),
    }),
  },
}));

import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../../../src/app.module';
import { MapResponseInterceptor } from '../../../src/common/interceptors/map-response.interceptor';
import { DropboxService } from '../../../src/services/dropbox/dropbox.service';
import { OpenaiService } from '../../../src/services/openai/openai.service';
import { StripeService } from '../../../src/services/stripe/stripe.service';
import { FileService } from '../../../src/services/file/file.service';
import { seedE2eDatabase, E2eSeed } from './seed';

let nestApplication: INestApplication | undefined;
let e2eSeed: E2eSeed | undefined;
let startPromise: Promise<void> | undefined;

/**
 * Arranca la aplicación Nest contra el Postgres de Testcontainers y siembra el juego de datos.
 * Es idempotente: todos los specs e2e comparten la misma instancia.
 */
export async function startE2eWorld(): Promise<void> {
  if (e2eSeed && nestApplication) {
    return;
  }
  if (!startPromise) {
    startPromise = bootstrapE2eWorld();
  }
  await startPromise;
}

/**
 * Devuelve la app HTTP lista para supertest.
 *
 * @returns Aplicación Nest inicializada
 */
export function getE2eApp(): INestApplication {
  if (!nestApplication) {
    throw new Error('Llama a startE2eWorld() en beforeAll antes de usar getE2eApp().');
  }
  return nestApplication;
}

/**
 * DataSource TypeORM de la app e2e (Postgres de Testcontainers).
 *
 * @returns Conexión activa
 */
export function getE2eDataSource(): DataSource {
  return getE2eApp().get(DataSource);
}

/**
 * Datos sembrados (empresas A/B, usuarios y recursos de cada tenant).
 *
 * @returns Semilla e2e
 */
export function getE2eSeed(): E2eSeed {
  if (!e2eSeed) {
    throw new Error('Llama a startE2eWorld() en beforeAll antes de usar getE2eSeed().');
  }
  return e2eSeed;
}

/**
 * Compila AppModule, sustituye integraciones externas y carga el dataset de acceso.
 */
async function bootstrapE2eWorld(): Promise<void> {
  applyE2eDatabaseEnvironment();
  assertE2eUsesEphemeralPostgres();

  const testingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(DropboxService)
    .useValue({
      uploadFile: jest.fn().mockResolvedValue({ path: '/e2e/mock' }),
      downloadFile: jest.fn().mockResolvedValue(Buffer.from('logo-e2e')),
      deleteFile: jest.fn().mockResolvedValue(undefined),
      moveFile: jest.fn().mockResolvedValue(undefined),
      sanitizeFileName: (fileName: string) => fileName,
      checkFolderExists: jest.fn().mockResolvedValue(true),
    })
    .overrideProvider(StripeService)
    .useValue({
      isStripeConfigured: () => true,
      createSubscriptionCheckoutSessionUrl: jest
        .fn()
        .mockResolvedValue('https://checkout.stripe.test/session'),
      getSubscriptionsByAccountId: jest.fn().mockImplementation(async (customerId: string) => {
        if (customerId !== 'cus_e2e_a') {
          return [];
        }
        return [
          {
            id: 'sub_e2e_a',
            status: 'active',
            cancel_at_period_end: false,
            current_period_start: 1_700_000_000,
            current_period_end: 1_702_000_000,
            items: {
              data: [
                {
                  id: 'si_e2e',
                  quantity: 5,
                  price: {
                    id: 'price_e2e',
                    product: 'prod_e2e',
                    recurring: { interval: 'month', interval_count: 1 },
                  },
                },
              ],
            },
          },
        ];
      }),
      getAllProducts: jest.fn().mockResolvedValue([
        {
          id: 'prod_sign',
          active: true,
          name: 'Fichajes',
          metadata: { type: 'signings' },
          default_price: 'price_sign',
        },
        {
          id: 'prod_mgmt',
          active: true,
          name: 'Gestión',
          metadata: { type: 'management' },
          default_price: {
            id: 'price_mgmt',
            unit_amount: 1500,
            recurring: { interval: 'month', interval_count: 1 },
          },
        },
      ]),
      getProductWithDefaultPriceExpanded: jest.fn().mockResolvedValue({
        id: 'prod_sign',
        name: 'Fichajes',
        default_price: {
          id: 'price_sign',
          unit_amount: 900,
          recurring: { interval: 'month', interval_count: 1 },
        },
      }),
      listActivePricesForProduct: jest.fn().mockResolvedValue([
        {
          id: 'price_sign',
          unit_amount: 900,
          recurring: { interval: 'month', interval_count: 1 },
        },
      ]),
      getProductNamesByIds: jest.fn().mockResolvedValue(new Map([['prod_e2e', 'Plan E2E']])),
      getProductNamesAndMetadataByIds: jest.fn().mockResolvedValue(
        new Map([
          [
            'prod_e2e',
            {
              name: 'Plan E2E',
              metadataEntries: [{ key: 'type', value: 'signings' }],
            },
          ],
        ]),
      ),
      updateSubscriptionPrimaryItemPrice: jest.fn().mockResolvedValue(undefined),
      cancelSubscriptionAtPeriodEnd: jest.fn().mockResolvedValue(undefined),
      revokeCancelSubscriptionAtPeriodEnd: jest.fn().mockResolvedValue(undefined),
      retrieveSubscriptionSchedule: jest.fn().mockResolvedValue(null),
    })
    .overrideProvider(OpenaiService)
    .useValue({
      extractSpentIssuerFromText: jest.fn().mockResolvedValue({
        name: 'Proveedor E2E',
        nifWithoutCountryPrefix: 'B00000000',
        nifWithCountryPrefix: '',
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        requestMessage: 'ocr',
      }),
      extractSpentConceptsFromText: jest.fn().mockResolvedValue({
        name: 'Concepto',
        issuedDate: '2026-01-01',
        concepts: [],
        totalSubtotal: 0,
        totalVAT: 0,
        totalIRPF: 0,
        total: 0,
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        requestMessage: 'ocr',
      }),
    })
    .overrideProvider(FileService)
    .useValue({
      processAiSpentPdf: jest.fn().mockResolvedValue({
        originalName: 'gasto.pdf',
        sizeInMegabytes: 0.1,
        extractedText: 'texto',
        message: 'ok',
      }),
      validatePdfFile: jest.fn(),
    })
    .compile();

  nestApplication = testingModule.createNestApplication();
  nestApplication.useGlobalInterceptors(
    new MapResponseInterceptor(nestApplication.get(Reflector)),
  );
  await nestApplication.init();

  const dataSource = nestApplication.get(DataSource);
  assertDataSourceUsesTestcontainers(dataSource);
  e2eSeed = await seedE2eDatabase(dataSource);
}

/**
 * Reescribe `DATABASE_*` desde `.postgres.json` por si algún `dotenv` posterior las hubiera tocado.
 */
function applyE2eDatabaseEnvironment(): void {
  const connectionFilePath = path.join(__dirname, '.postgres.json');
  if (!fs.existsSync(connectionFilePath)) {
    throw new Error(
      'Falta test/e2e/harness/.postgres.json. Ejecuta la suite con npm run test:e2e.',
    );
  }
  const connection = JSON.parse(fs.readFileSync(connectionFilePath, 'utf8')) as {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
  process.env.E2E_TEST = 'true';
  process.env.DATABASE_HOST = String(connection.host);
  process.env.DATABASE_PORT = String(connection.port);
  process.env.DATABASE_USERNAME = String(connection.username);
  process.env.DATABASE_PASSWORD = String(connection.password);
  process.env.DATABASE_NAME = String(connection.database);
  process.env.TYPEORM_SYNCHRONIZE = 'true';
  process.env.TYPEORM_LOGGING = 'false';
}

/**
 * Impide inicializar Nest si la URL no es la del contenedor de Testcontainers.
 * Evita `dropSchema` contra develop/cloud.
 */
function assertE2eUsesEphemeralPostgres(): void {
  const connection = JSON.parse(
    fs.readFileSync(path.join(__dirname, '.postgres.json'), 'utf8'),
  ) as { host: string; port: number; database: string };
  if (
    process.env.DATABASE_HOST !== String(connection.host) ||
    process.env.DATABASE_PORT !== String(connection.port) ||
    process.env.DATABASE_NAME !== String(connection.database)
  ) {
    throw new Error(
      `Los e2e no usarán esta conexión: ${process.env.DATABASE_HOST}:${process.env.DATABASE_PORT}/${process.env.DATABASE_NAME}`,
    );
  }
}

/**
 * Aborta si TypeORM no está apuntando al Postgres efímero de Testcontainers.
 *
 * @param dataSource - Conexión real de la app e2e
 */
function assertDataSourceUsesTestcontainers(dataSource: DataSource): void {
  const connectionFilePath = path.join(__dirname, '.postgres.json');
  const connection = JSON.parse(fs.readFileSync(connectionFilePath, 'utf8')) as {
    host: string;
    port: number;
    database: string;
  };
  const options = dataSource.options as {
    host?: string;
    port?: number;
    database?: string;
  };
  if (
    options.host !== connection.host ||
    Number(options.port) !== Number(connection.port) ||
    options.database !== connection.database
  ) {
    throw new Error(
      `Los e2e deben usar Testcontainers, no la base de develop. ` +
        `Conexión actual: ${options.host}:${options.port}/${options.database}`,
    );
  }
}
