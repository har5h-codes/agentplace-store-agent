import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { ApiError } from '../common/api-error';
import { ApiClient, Order, OrderStatus, Product, Scope, StoreRepository } from './store.types';

/**
 * Postgres repository over Neon's HTTP driver: one round trip per query and no connection
 * pool to keep warm, which suits serverless functions.
 */
export class PgStoreRepository implements StoreRepository {
  private readonly sql: NeonQueryFunction<false, false>;

  constructor(databaseUrl: string) {
    this.sql = neon(databaseUrl);
  }

  async findApiClientByKeyHash(keyHash: string): Promise<ApiClient | null> {
    const rows = await this.query(
      `SELECT id, name, scopes FROM api_clients WHERE key_hash = $1 AND revoked_at IS NULL`,
      [keyHash],
    );
    if (!rows[0]) return null;
    return { id: String(rows[0].id), name: rows[0].name, scopes: rows[0].scopes as Scope[] };
  }

  async findProductBySku(sku: string): Promise<Product | null> {
    const rows = await this.query(
      `SELECT sku, name, variant, category, price_cents, currency, quantity_available,
              to_char(restock_date, 'YYYY-MM-DD') AS restock_date
         FROM products WHERE sku = $1`,
      [sku],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      sku: r.sku,
      name: r.name,
      variant: r.variant,
      category: r.category,
      priceCents: r.price_cents,
      currency: r.currency,
      quantityAvailable: r.quantity_available,
      restockDate: r.restock_date,
    };
  }

  async findOrderById(orderId: string): Promise<Order | null> {
    const rows = await this.query(
      `SELECT o.order_id, o.customer_email, o.status, o.placed_at, o.currency, o.carrier,
              o.tracking_number, o.shipped_at, to_char(o.estimated_delivery, 'YYYY-MM-DD') AS estimated_delivery,
              o.delivered_at,
              COALESCE(json_agg(json_build_object(
                'sku', i.sku,
                'name', CASE WHEN p.variant IS NULL THEN p.name ELSE p.name || ' (' || p.variant || ')' END,
                'quantity', i.quantity,
                'unitPriceCents', i.unit_price_cents
              ) ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
         FROM orders o
         LEFT JOIN order_items i ON i.order_id = o.order_id
         LEFT JOIN products p ON p.sku = i.sku
        WHERE o.order_id = $1
        GROUP BY o.order_id`,
      [orderId],
    );
    const r = rows[0];
    if (!r) return null;
    const iso = (v: unknown) => (v == null ? null : new Date(v as string).toISOString());
    return {
      orderId: r.order_id,
      customerEmail: r.customer_email,
      status: r.status as OrderStatus,
      placedAt: iso(r.placed_at)!,
      currency: r.currency,
      items: r.items,
      carrier: r.carrier,
      trackingNumber: r.tracking_number,
      shippedAt: iso(r.shipped_at),
      estimatedDelivery: r.estimated_delivery,
      deliveredAt: iso(r.delivered_at),
    };
  }

  /** Any database failure becomes a 503 the agent can explain, never a raw driver error. */
  private async query(text: string, params: unknown[]): Promise<Record<string, any>[]> {
    try {
      return (await this.sql.query(text, params)) as Record<string, any>[];
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', msg: 'database query failed', error: String(err) }));
      throw ApiError.serviceUnavailable();
    }
  }
}
