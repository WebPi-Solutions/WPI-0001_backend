import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Spent } from './spent.entity';
import { SpentRepository } from './spent-repository.service';

@Module({
  imports: [TypeOrmModule.forFeature([Spent])],
  providers: [SpentRepository],
  exports: [SpentRepository]
})
export class SpentModule {}
