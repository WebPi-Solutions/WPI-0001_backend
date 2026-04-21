import { Module } from '@nestjs/common';
import { ClientRepository } from './client-repository.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from './client.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Client])],
  providers: [ClientRepository],
  exports: [ClientRepository]
})
export class ClientModule {}
