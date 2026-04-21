import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Signing } from './signing.entity';
import { SigningRepository } from './signing-repository.service';
import { SigningUpdate } from './signing-update.entity';
import { SigningUpdateRepository } from './signing-update-repository.service';

@Module({
  imports: [TypeOrmModule.forFeature([Signing, SigningUpdate])],
  providers: [SigningRepository, SigningUpdateRepository],
  exports: [SigningRepository, SigningUpdateRepository],
})
export class SigningModule {}
