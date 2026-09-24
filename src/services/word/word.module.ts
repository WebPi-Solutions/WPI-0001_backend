import { Module } from '@nestjs/common';
import { DropboxModule } from '../dropbox/dropbox.module';
import { WordService } from './word.service';

/** Registra la generación de documentos Word basada en plantillas de Dropbox. */
@Module({
  imports: [DropboxModule],
  providers: [WordService],
  exports: [WordService],
})
export class WordModule {}
