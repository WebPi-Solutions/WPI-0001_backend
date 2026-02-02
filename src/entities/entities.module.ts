// src/entities/entities.module.ts
import { Module, DynamicModule, Type } from '@nestjs/common';
import { glob } from 'glob';
import { join, basename } from 'path';

/**
 * Función auxiliar para cargar dinámicamente todos los módulos de características (feature modules)
 * desde los subdirectorios de /entities/.
 * @returns Un array de clases de módulos de NestJS.
 */
async function loadFeatureModules(): Promise<Type<any>[]> {
  const modulesPath = join(__dirname, '**/*.module.{ts,js}');
  const moduleFiles = glob.sync(modulesPath);

  const featureModulesPromises = moduleFiles
    // Excluimos el propio EntitiesModule para evitar un bucle de importación infinito.
    .filter(file => basename(file) !== 'entities.module.js' && basename(file) !== 'entities.module.ts')
    .map(async (file) => {
      const relativePath = file.replace(/\.(js|ts)$/, '');
      try {
        const module = await import(relativePath);
        // Suponemos que la exportación principal de un archivo .module.ts es la clase del módulo.
        return Object.values(module).find(
          (exported): exported is Type<any> =>
            typeof exported === 'function' && /Module$/i.test(exported.name)
        );
      } catch (error) {
        console.error(`Error al importar el módulo desde ${file}:`, error);
        return null;
      }
    });

  const resolvedModules = await Promise.all(featureModulesPromises);
  
  // Filtramos cualquier módulo que no se haya podido cargar.
  return resolvedModules.filter((mod): mod is Type<any> => mod !== null);
}


@Module({
  imports: []
})
export class EntitiesModule {
  /**
   * Registra dinámicamente todos los módulos de características encontrados
   * en los subdirectorios de /entities/.
   * @returns Un DynamicModule que importa y exporta todos los módulos de características.
   */
  static async register(): Promise<DynamicModule> {
    const featureModules = await loadFeatureModules();
    
    return {
      module: EntitiesModule,
      imports: featureModules,
      exports: featureModules, // Re-exportamos los módulos para que sus servicios estén disponibles.
    };
  }
}