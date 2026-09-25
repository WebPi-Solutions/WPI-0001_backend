import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnterpriseSettings } from './enterprise-settings.entity';
import { EnterpriseSettingsRepository } from './enterprise-settings-repository.service';

/** Módulo de persistencia de configuraciones de empresa. */
@Module({
  imports: [TypeOrmModule.forFeature([EnterpriseSettings])],
  providers: [EnterpriseSettingsRepository],
  exports: [EnterpriseSettingsRepository],
})
export class EnterpriseSettingsModule {}
