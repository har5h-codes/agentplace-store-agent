export type Scope = 'stock:read' | 'orders:read';

export interface ApiClient {
  id: string;
  name: string;
  scopes: Scope[];
}

export interface Product {
  sku: string;
  name: string;
  variant: string | null;
  category: string;
  priceCents: number;
  currency: string;
  quantityAvailable: number;
  /** ISO date (YYYY-MM-DD) of the next expected delivery, or null if none is scheduled. */
  restockDate: string | null;
}

export type OrderStatus =
  | 'processing'
  | 'on_hold'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export interface OrderItem {
  sku: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
}

export interface Order {
  orderId: string;
  customerEmail: string;
  status: OrderStatus;
  placedAt: string;
  currency: string;
  items: OrderItem[];
  carrier: string | null;
  trackingNumber: string | null;
  shippedAt: string | null;
  estimatedDelivery: string | null;
  deliveredAt: string | null;
}

/** Everything the API reads from storage. Postgres in production, in-memory for tests and local runs. */
export interface StoreRepository {
  findApiClientByKeyHash(keyHash: string): Promise<ApiClient | null>;
  findProductBySku(sku: string): Promise<Product | null>;
  findOrderById(orderId: string): Promise<Order | null>;
}

export const STORE_REPOSITORY = Symbol('STORE_REPOSITORY');
