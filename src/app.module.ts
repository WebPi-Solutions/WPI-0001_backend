import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiModule } from './api/api.module';

//Environment Configuration
import * as dotenv from 'dotenv';
dotenv.config();

//MiddleWares
import { FirebaseMiddleware } from './middleware/firebase/firebase.middleware';
import { UserModule } from './entities/user/user.module';
import { FirebaseModule } from './middleware/firebase/firebase.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST,
      port: parseInt(process.env.DATABASE_PORT, 10),
      username: process.env.DATABASE_USERNAME,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
    }),
    ApiModule.register(),
    
    // Para el middleware de firebase importamos el módulo de firebase y el módulo de usuarios
    FirebaseModule,
    UserModule
  ],
  controllers: [AppController],
  providers: [AppService],
})


export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(FirebaseMiddleware)
    .exclude('')
    .forRoutes('*')
  }
}
