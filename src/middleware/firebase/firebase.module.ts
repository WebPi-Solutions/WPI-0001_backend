import { Module } from '@nestjs/common';
import { FirebaseMiddleware } from './firebase.middleware';
import { UserModule } from 'src/entities/user/user.module';

@Module({
  imports: [UserModule],
  providers: [FirebaseMiddleware], // Registra el middleware como proveedor
  exports: [FirebaseMiddleware], // Exporta el middleware si otros módulos lo necesitan
})
export class FirebaseModule {}
