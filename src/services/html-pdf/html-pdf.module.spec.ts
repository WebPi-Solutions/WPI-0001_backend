import { Test, TestingModule } from '@nestjs/testing';
import { DropboxService } from '../dropbox/dropbox.service';
import { HtmlTemplateDataService } from './html-template-data.service';
import { HtmlPdfModule } from './html-pdf.module';
import { HtmlPdfService } from './html-pdf.service';

describe('HtmlPdfModule', () => {
  it('registra el servicio de generación de PDFs HTML', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [HtmlPdfModule],
    })
      .overrideProvider(DropboxService)
      .useValue({})
      .overrideProvider(HtmlTemplateDataService)
      .useValue({})
      .compile();

    expect(module.get(HtmlPdfService)).toBeDefined();
  });
});
