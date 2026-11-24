/**
 * Recreates the schema and loads the sample catalog, orders and API clients into Postgres.
 * Usage: DATABASE_URL=... AGENT_API_KEY=... STOCK_ONLY_API_KEY=... npm run db:seed
 */
import { Pool } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashApiKey } from '../auth/api-key.guard';
import { ORDERS, PRODUCTS } from '../store/seed-data';

async function main() {
  const { DATABASE_URL, AGENT_API_KEY, STOCK_ONLY_API_KEY } = process.env;
  if (!DATABASE_URL || !AGENT_API_KEY || !STOCK_ONLY_API_KEY) {
    throw new Error('Set DATABASE_URL, AGENT_API_KEY and STOCK_ONLY_API_KEY');
  }

  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query(readFileSync(join(__dirname, '..', '..', 'db', 'schema.sql'), 'utf8'));

    await db.query(`INSERT INTO api_clients (name, key_hash, scopes) VALUES ($1, $2, $3), ($4, $5, $6)`, [
      'store-agent', hashApiKey(AGENT_API_KEY), ['stock:read', 'orders:read'],
      'stock-only', hashApiKey(STOCK_ONLY_API_KEY), ['stock:read'],
    ]);

    for (const p of PRODUCTS) {
      await db.query(
        `INSERT INTO products (sku, name, variant, category, price_cents, currency, quantity_available, restock_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [p.sku, p.name, p.variant, p.category, p.priceCents, p.currency, p.quantityAvailable, p.restockDate],
      );
    }

    for (const o of ORDERS) {
      await db.query(
        `INSERT INTO orders (order_id, customer_email, status, placed_at, currency, carrier, tracking_number,
                             shipped_at, estimated_delivery, delivered_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [o.orderId, o.customerEmail, o.status, o.placedAt, o.currency, o.carrier, o.trackingNumber,
         o.shippedAt, o.estimatedDelivery, o.deliveredAt],
      );
      for (const i of o.items) {
        await db.query(
          `INSERT INTO order_items (order_id, sku, quantity, unit_price_cents) VALUES ($1, $2, $3, $4)`,
          [o.orderId, i.sku, i.quantity, i.unitPriceCents],
        );
      }
    }

    await db.query('COMMIT');
    console.log(`Seeded ${PRODUCTS.length} products, ${ORDERS.length} orders and 2 API clients.`);
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
