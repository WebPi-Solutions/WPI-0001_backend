import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientDocument } from './client-document.entity';
import { ClientDocumentRepository } from './client-document-repository.service';

/** Módulo de persistencia de documentos de cliente. */
@Module({
  imports: [TypeOrmModule.forFeature([ClientDocument])],
  providers: [ClientDocumentRepository],
  exports: [ClientDocumentRepository],
})
export class ClientDocumentModule {}
