import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Signing } from './signing.entity';
import { SigningRepository } from './signing-repository.service';

@Module({
  imports: [TypeOrmModule.forFeature([Signing])],
  providers: [SigningRepository],
  exports: [SigningRepository],
})
export class SigningModule {}
