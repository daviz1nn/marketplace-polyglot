import './load-env'; // precisa ser o 1º import
// DNS customizado OPCIONAL, aplicado ANTES de qualquer import que abra conexão.
// Útil em redes que não resolvem os registros SRV do MongoDB Atlas
// (mongodb+srv://). Ex.: DNS_SERVERS=8.8.8.8,1.1.1.1. Sem a variável, usa o
// DNS do sistema (o que funciona no Docker e em redes que bloqueiam 8.8.8.8).
import * as dns from 'node:dns';
if (process.env.DNS_SERVERS) {
  dns.setServers(process.env.DNS_SERVERS.split(',').map((s) => s.trim()).filter(Boolean));
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id', 'Idempotency-Key'],
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const config = new DocumentBuilder()
    .setTitle('products-service')
    .setDescription('CRUD de produtos — MongoDB via Mongoose')
    .setVersion('0.1.0')
    .addTag('products')
    .addTag('health')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  const port = Number(process.env.PORT ?? 3002);
  await app.listen(port, '0.0.0.0');
  console.log(`✔ products-service listening on :${port}  (Swagger em /docs)`);
}

bootstrap();
