import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UserRepository } from './user-repository.service';
import { UserEnterprise } from './user-enterprise.entity';
import { FirebaseModule } from 'src/services/firebase/firebase.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserEnterprise
    ]),
    FirebaseModule
  ],
  providers: [UserRepository],
  exports: [UserRepository]
})
export class UserModule {}
