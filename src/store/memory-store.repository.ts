import { ApiClient, Order, Product, StoreRepository } from './store.types';
import { ORDERS, PRODUCTS } from './seed-data';

/** Serves the seed data from memory. Used by the tests and when DATABASE_URL is not set. */
export class MemoryStoreRepository implements StoreRepository {
  private readonly clients = new Map<string, ApiClient>();

  constructor(clientsByKeyHash: Record<string, ApiClient>) {
    for (const [hash, client] of Object.entries(clientsByKeyHash)) this.clients.set(hash, client);
  }

  async findApiClientByKeyHash(keyHash: string): Promise<ApiClient | null> {
    return this.clients.get(keyHash) ?? null;
  }

  async findProductBySku(sku: string): Promise<Product | null> {
    return PRODUCTS.find((p) => p.sku === sku) ?? null;
  }

  async findOrderById(orderId: string): Promise<Order | null> {
    return ORDERS.find((o) => o.orderId === orderId) ?? null;
  }
}
