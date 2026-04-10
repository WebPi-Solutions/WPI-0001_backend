import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UserRepository } from './user-repository.service';
import { UserEnterprise } from './user-enterprise.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserEnterprise
    ])
  ],
  providers: [UserRepository],
  exports: [UserRepository]
})
export class UserModule {}
