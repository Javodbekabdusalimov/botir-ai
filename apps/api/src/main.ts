import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/http';

// apps/api/.env (secrets live only there). Already-exported variables win.
if (existsSync('.env')) process.loadEnvFile('.env');

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true }); // rawBody: webhook signature checks
  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim());
  app.enableCors({ origin: origins });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  new Logger('Bootstrap').log(`Botir API on http://localhost:${port}`);
}

void bootstrap();
