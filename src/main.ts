import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { configureApp, createAppModule, NEST_OPTIONS, repositoryFromEnv } from './create-app';

async function bootstrap() {
  const app = configureApp(await NestFactory.create(createAppModule(repositoryFromEnv()), NEST_OPTIONS));
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(JSON.stringify({ level: 'info', msg: 'listening', port, storage: process.env.DATABASE_URL ? 'postgres' : 'memory' }));
}

bootstrap();
