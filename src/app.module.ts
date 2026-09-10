import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiModule } from './api/api.module';

// Environment Configuration (los e2e fijan `E2E_TEST` y la URL de Testcontainers antes de importar)
import * as dotenv from 'dotenv';
if (process.env.E2E_TEST !== 'true') {
  dotenv.config();
}

//MiddleWares
import { FirebaseMiddleware } from './middleware/firebase/firebase.middleware';
import { UserModule } from './entities/user/user.module';
import { FirebaseModule } from './middleware/firebase/firebase.module';

@Module({
  imports: [
    /**
     * `forRootAsync` lee `process.env` al inicializar el módulo, no al importar el archivo.
     * Así los e2e pueden fijar el Postgres de Testcontainers antes de conectar.
     */
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres' as const,
        host: process.env.DATABASE_HOST,
        port: parseInt(process.env.DATABASE_PORT, 10),
        username: process.env.DATABASE_USERNAME,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        ...buildTypeOrmRuntimeFlags(),
      }),
    }),
    ApiModule.register(),
    
    // Para el middleware de firebase importamos el módulo de firebase y el módulo de usuarios
    FirebaseModule,
    UserModule
  ],
  controllers: [AppController],
  providers: [AppService],
})


export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(FirebaseMiddleware)
    .exclude('')
    .forRoutes('*')
  }
}

/**
 * Flags de TypeORM leídos de entorno: sincronización, dropSchema y logging.
 * Extraído para poder cubrir todas las combinaciones de `TYPEORM_*` / `E2E_TEST` en tests.
 *
 * @returns Opciones de runtime a fusionar en `TypeOrmModule.forRootAsync`
 */
export function buildTypeOrmRuntimeFlags(): {
  synchronize: boolean;
  dropSchema: boolean;
  logging: boolean;
} {
  return {
    /**
     * Solo los e2e (`E2E_TEST`) recrean el esquema en el Postgres de Testcontainers.
     * `dropSchema` evita residuos de una ejecución anterior (emails duplicados, etc.).
     * En desarrollo y producción el esquema lo gestionan migraciones / el entorno real.
     */
    synchronize:
      process.env.TYPEORM_SYNCHRONIZE === 'true' || process.env.E2E_TEST === 'true',
    dropSchema: process.env.E2E_TEST === 'true',
    logging: process.env.TYPEORM_LOGGING === 'true',
  };
}
