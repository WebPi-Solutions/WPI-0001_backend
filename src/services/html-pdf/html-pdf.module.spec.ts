import { Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DropboxService } from '../dropbox/dropbox.service';
import { EnterpriseSettingsRepository } from 'src/entities/enterprise-settings/enterprise-settings-repository.service';
import { EnterpriseSettingsModule } from 'src/entities/enterprise-settings/enterprise-settings.module';
import { HtmlTemplateDataService } from './html-template-data.service';
import { HtmlPdfModule } from './html-pdf.module';
import { HtmlPdfService } from './html-pdf.service';

@Module({
  providers: [{ provide: EnterpriseSettingsRepository, useValue: {} }],
  exports: [EnterpriseSettingsRepository],
})
class TestEnterpriseSettingsModule {}

describe('HtmlPdfModule', () => {
  it('registra el servicio de generación de PDFs HTML', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [HtmlPdfModule],
    })
      .overrideModule(EnterpriseSettingsModule)
      .useModule(TestEnterpriseSettingsModule)
      .overrideProvider(DropboxService)
      .useValue({})
      .overrideProvider(HtmlTemplateDataService)
      .useValue({})
      .compile();

    expect(module.get(HtmlPdfService)).toBeDefined();
  });
});
