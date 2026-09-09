import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiRequest } from './ai-request.entity';
import { AiRequestRepository } from './ai-request-repository.service';

/**
 * Módulo de persistencia de peticiones a la API de IA.
 * Expone el repositorio para su uso desde la capa API y otros servicios.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AiRequest])],
  providers: [AiRequestRepository],
  exports: [AiRequestRepository],
})
export class AiRequestModule {}
