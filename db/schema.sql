-- Ridgeline Outfitters store API schema (PostgreSQL / Neon).
-- Applied by `npm run db:seed`, which is safe to re-run: it recreates and reseeds every table.

DROP TABLE IF EXISTS order_items, orders, products, api_clients CASCADE;

CREATE TABLE api_clients (
  id          SERIAL PRIMARY KEY,
  name        TEXT        NOT NULL UNIQUE,
  key_hash    CHAR(64)    NOT NULL UNIQUE,          -- SHA-256 of the API key; the key itself is never stored
  scopes      TEXT[]      NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at  TIMESTAMPTZ
);

CREATE TABLE products (
  sku                 VARCHAR(16)  PRIMARY KEY CHECK (sku ~ '^[A-Z]{3}-[0-9]{4}$'),
  name                TEXT         NOT NULL,
  variant             TEXT,
  category            TEXT         NOT NULL,
  price_cents         INTEGER      NOT NULL CHECK (price_cents >= 0),
  currency            CHAR(3)      NOT NULL DEFAULT 'USD',
  quantity_available  INTEGER      NOT NULL CHECK (quantity_available >= 0),
  restock_date        DATE
);

CREATE TABLE orders (
  order_id            VARCHAR(16)  PRIMARY KEY CHECK (order_id ~ '^ORD-[0-9]{5}$'),
  customer_email      TEXT         NOT NULL,
  status              TEXT         NOT NULL CHECK (status IN
                        ('processing','on_hold','shipped','out_for_delivery','delivered','cancelled','refunded')),
  placed_at           TIMESTAMPTZ  NOT NULL,
  currency            CHAR(3)      NOT NULL DEFAULT 'USD',
  carrier             TEXT,
  tracking_number     TEXT,
  shipped_at          TIMESTAMPTZ,
  estimated_delivery  DATE,
  delivered_at        TIMESTAMPTZ
);

CREATE TABLE order_items (
  id                SERIAL PRIMARY KEY,
  order_id          VARCHAR(16) NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  sku               VARCHAR(16) NOT NULL REFERENCES products(sku),
  quantity          INTEGER     NOT NULL CHECK (quantity > 0),
  unit_price_cents  INTEGER     NOT NULL CHECK (unit_price_cents >= 0)
);

CREATE INDEX order_items_order_id_idx ON order_items(order_id);
