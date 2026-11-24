import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiResponseInterceptor } from './common/api-response.interceptor';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

const DEFAULT_PORT = 4000;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { cors: true });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalInterceptors(new ApiResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  await app.listen(port);
  new Logger('Bootstrap').log(`Botir AI API listening on http://localhost:${port}`);
}

void bootstrap();
