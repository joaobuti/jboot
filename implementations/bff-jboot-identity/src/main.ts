import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { OAuthProviderService } from './oauth/oauth-provider.service';
import { buildOAuthRouter } from './oauth/oauth.router';

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
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(AppConfigService);
  // Atras de proxy reverso, sem isto `request.ip` e o IP do proxy: o limite por IP do "esqueci minha
  // senha" valeria para todos juntos e a auditoria gravaria o proxy. Valor = saltos de proxy (ex.: 1).
  if (config.trustProxy !== undefined) {
    app.set('trust proxy', config.trustProxy);
  }

  app.use(helmet());
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true
  });
  // Conector Claude do Flow: endpoints do protocolo OAuth (handlers do SDK MCP).
  app.use(buildOAuthRouter(app.get(OAuthProviderService), config));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('JBoot Identity API')
    .setDescription('Identity hub authentication API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(config.port, '0.0.0.0');
}

void bootstrap();

