import { Module } from '@nestjs/common';
import { OpenaiService } from './openai.service';

/**
 * Módulo de integración con la API de OpenAI.
 */
@Module({
  providers: [OpenaiService],
  exports: [OpenaiService],
})
export class OpenaiModule {}
