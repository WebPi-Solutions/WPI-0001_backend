// src/api/api.module.ts
import { Module, DynamicModule, Type } from '@nestjs/common';
import { glob } from 'glob';
import { join } from 'path';
import { EntitiesModule } from 'src/entities/entities.module';
import { EnterpriseAccessService } from 'src/helpers/enterprise-access/enterprise-access.service';
import { StripeService } from 'src/services/stripe/stripe.service';
import { DropboxModule } from 'src/services/dropbox/dropbox.module';
import { FirebaseModule } from 'src/services/firebase/firebase.module';
import { FileModule } from 'src/services/file/file.module';
import { OpenaiModule } from 'src/services/openai/openai.module';
import { MulterModule } from '@nestjs/platform-express';

/**
 * Funcion auxiliar para cargar todos los controladores de la carpeta /api/
 * @returns Un array de clases de controladores
 */
async function loadControllers(): Promise<Type<any>[]> {
  const controllersPath = join(__dirname, '**/*.controller.{ts,js}');
  const controllerFiles = glob.sync(controllersPath);
  
  const controllersArrays = await Promise.all(
    controllerFiles.map(async (file) => {
      // Convertir la ruta del archivo a la ruta del módulo de importación
      const relativePath = file.replace(/\.(js|ts)$/, '');
      
      try {
        const module = await import(relativePath);
        // Obtener todas las clases exportadas del archivo que son controladores
        return Object.values(module).filter(
          (item): item is Type<any> => 
            typeof item === 'function' && 
            /Controller$/i.test(item.name)
        );
      } catch (error) {
        console.error(`Failed to import controller from ${file}:`, error);
        return [];
      }
    })
  );
  
  // Aplanar el array de arrays de controladores
  return controllersArrays.flat() as Type<any>[];
}

/**
 * Funcion auxiliar para cargar todos los servicios de la carpeta /api/
 * @returns Un array de clases de servicios
 */
async function loadServices(): Promise<Type<any>[]> {
  const servicesPath = join(__dirname, '**/*.service.{ts,js}');
  const serviceFiles = glob.sync(servicesPath);
  
  const servicesArrays = await Promise.all(
    serviceFiles.map(async (file) => {
      // Convertir la ruta del archivo a la ruta del módulo de importación
      const relativePath = file.replace(/\.(js|ts)$/, '');
      
      try {
        const module = await import(relativePath);
        // Obtener todas las clases exportadas del archivo que son servicios
        return Object.values(module).filter(
          (item): item is Type<any> => 
            typeof item === 'function' && 
            /Service$/i.test(item.name)
        );
      } catch (error) {
        console.error(`Failed to import service from ${file}:`, error);
        return [];
      }
    })
  );
  
  // Aplanar el array de arrays de servicios
  return servicesArrays.flat() as Type<any>[];
}

@Module({
  imports: [],
})
export class ApiModule {
  /**
   * Registrar dinámicamente todos los controladores y servicios en el módulo API
   * @returns DynamicModule con controladores y servicios descubiertos automáticamente
   */
  static async register(): Promise<DynamicModule> {
    const controllers = await loadControllers();
    const services = await loadServices();
    /**
     * Servicios fuera de `src/api/**` no entran en el glob de descubrimiento;
     * se registran aquí de forma explícita.
     */
    const auxiliaryProviders: Type<any>[] = [
      EnterpriseAccessService,
      StripeService,
    ];

    return {
      imports: [
        EntitiesModule.register(),
        DropboxModule,
        FirebaseModule,
        FileModule,
        OpenaiModule,
        MulterModule.register({
          limits: {
            fileSize: parseInt(process.env.MAX_FILE_SIZE, 10) * 1024 * 1024, // 10MB max file size
          },
          fileFilter: (req, file, cb) => {
            // Aceptar solo archivos PDF
            if (file.mimetype === 'application/pdf' || file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg' || file.mimetype === 'image/png') {
              return cb(null, true);
            }
            cb(new Error('Solo se permiten archivos PDF'), false);
          }
        })
      ],
      module: ApiModule,
      controllers,
      providers: [...services, ...auxiliaryProviders],
    };
  }
}