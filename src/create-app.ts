import 'reflect-metadata';
import { INestApplication, Module } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { ApiKeyGuard, hashApiKey } from './auth/api-key.guard';
import { ErrorFilter } from './common/error.filter';
import { requestContext } from './common/request-context';
import { MetaController } from './meta.controller';
import { OrdersController } from './orders/orders.controller';
import { StockController } from './stock/stock.controller';
import { MemoryStoreRepository } from './store/memory-store.repository';
import { PgStoreRepository } from './store/pg-store.repository';
import { ApiClient, STORE_REPOSITORY, StoreRepository } from './store/store.types';

/** Postgres when DATABASE_URL is set; otherwise the in-memory sample data with keys from the environment. */
export function repositoryFromEnv(env: NodeJS.ProcessEnv = process.env): StoreRepository {
  if (env.DATABASE_URL) return new PgStoreRepository(env.DATABASE_URL);

  const clients: Record<string, ApiClient> = {};
  if (env.AGENT_API_KEY) {
    clients[hashApiKey(env.AGENT_API_KEY)] = { id: '1', name: 'store-agent', scopes: ['stock:read', 'orders:read'] };
  }
  if (env.STOCK_ONLY_API_KEY) {
    clients[hashApiKey(env.STOCK_ONLY_API_KEY)] = { id: '2', name: 'stock-only', scopes: ['stock:read'] };
  }
  return new MemoryStoreRepository(clients);
}

/** Root module, built around whichever repository the caller supplies. */
export function createAppModule(repo: StoreRepository) {
  @Module({
    controllers: [MetaController, StockController, OrdersController],
    providers: [
      { provide: STORE_REPOSITORY, useValue: repo },
      { provide: APP_GUARD, useClass: ApiKeyGuard },
    ],
  })
  class AppModule {}
  return AppModule;
}

export const NEST_OPTIONS = { logger: ['error', 'warn'] as ('error' | 'warn')[] };

/** Middleware, error format, CORS. Shared by the server entrypoint and the tests. */
export function configureApp(app: INestApplication): INestApplication {
  app.use(requestContext);
  app.useGlobalFilters(new ErrorFilter());
  app.enableCors({ origin: '*', methods: ['GET'], allowedHeaders: ['Authorization', 'X-API-Key', 'Content-Type', 'X-Request-Id'] });
  (app.getHttpAdapter().getInstance() as { disable(s: string): void }).disable('x-powered-by');
  return app;
}

export async function createApp(repo: StoreRepository = repositoryFromEnv()): Promise<INestApplication> {
  return configureApp(await NestFactory.create(createAppModule(repo), NEST_OPTIONS));
}
