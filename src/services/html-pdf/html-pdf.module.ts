import { Module } from '@nestjs/common';
import { EnterpriseSettingsModule } from 'src/entities/enterprise-settings/enterprise-settings.module';
import { DropboxModule } from '../dropbox/dropbox.module';
import { HtmlTemplateDataService } from './html-template-data.service';
import { HtmlPdfService } from './html-pdf.service';

/** Registra la generación de PDFs estáticos basada en plantillas HTML de Dropbox. */
@Module({
  imports: [DropboxModule, EnterpriseSettingsModule],
  providers: [HtmlTemplateDataService, HtmlPdfService],
  exports: [HtmlPdfService],
})
export class HtmlPdfModule {}
