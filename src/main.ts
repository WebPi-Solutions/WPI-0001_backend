import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { swaggerMiddleware } from './middleware/swagger/swagger.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(express.json({ limit: '50mb' }))
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH')
    res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization')
    next()
  })
  app.enableCors({
    origin: '*'
  });

  /*
    Swagger set up
  */
  const config = new DocumentBuilder()
    .setTitle('Gabriel de Larriva Pérez - Software de gestión')
    .setDescription('API documentation for Gabriel de Larriva Pérez Software de gestión. Developed by Webpi Solutions.')
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      'auth_token', // Este es el nombre del esquema de seguridad
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  
  // La ruta de la documentación
  const swaggerPath = 'documentation';
  
  // Aplicar el middleware de autenticación solo a las rutas de Swagger. Una ruta concreta
  // (ejemplo: /documentation)
  app.use(`/${swaggerPath}`, swaggerMiddleware);
  
  // Proteger también los archivos estáticos de Swagger (js, css, etc.)
  app.use(`/${swaggerPath}-json`, swaggerMiddleware);
  app.use(`/${swaggerPath}-js`, swaggerMiddleware);
  app.use(`/${swaggerPath}-css`, swaggerMiddleware);
  
  SwaggerModule.setup(swaggerPath, app, document);

  await app.listen(3000);
}
bootstrap();