import { Controller, Get } from '@nestjs/common';
import { SkipEnterpriseAccess } from './common/decorators/enterprise-access.decorator';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * Ruta raíz de comprobación (sin autenticación Firebase ni aislamiento de empresa).
   *
   * @returns Mensaje de saludo
   */
  @SkipEnterpriseAccess()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
