import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Quote } from './quote.entity';
import { QuoteRepository } from './quote-repository.service';

@Module({
  imports: [TypeOrmModule.forFeature([Quote])],
  providers: [QuoteRepository],
  exports: [QuoteRepository]
})
export class QuoteModule {}
