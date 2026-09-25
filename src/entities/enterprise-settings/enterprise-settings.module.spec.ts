import { MODULE_METADATA } from '@nestjs/common/constants';
import { EnterpriseSettingsRepository } from './enterprise-settings-repository.service';
import { EnterpriseSettingsModule } from './enterprise-settings.module';

describe('EnterpriseSettingsModule', () => {
  it('registra y exporta el repositorio', () => {
    expect(EnterpriseSettingsModule).toBeDefined();
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, EnterpriseSettingsModule),
    ).toContain(EnterpriseSettingsRepository);
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, EnterpriseSettingsModule),
    ).toContain(EnterpriseSettingsRepository);
  });
});
