import './tracing';
import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';

// A Configr (hospedagem de producao) nao expoe UI de variaveis de ambiente
// por Website -- so painel de banco, versao do Node e arquivo principal.
// Como alternativa, o pacote de deploy (tools/deploy.sh) inclui um `.env`
// na raiz do bundle (fora do git); carregado aqui via API nativa do Node
// (>=20.12/21.7), antes de qualquer leitura de process.env pelo Nest.
const envPath = join(__dirname, '..', '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));
  const config = app.get(AppConfigService);

  app.use(helmet());
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true
  });
  app.useWebSocketAdapter(new IoAdapter(app));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('JBoot PDV API')
    .setDescription('PDV administrative and operational API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(config.port, '0.0.0.0');
}

void bootstrap();
