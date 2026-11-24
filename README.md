# Ridgeline Outfitters Store API and Agent

A small store API that an [Agentplace](https://agentplace.io) agent calls for **live stock levels** and **order status**, plus a repeatable evaluation of that agent.

- **Agent (published):** https://zafsrwwwrbwu.run.agentplace.io/
- **Live API:** https://ridgeline-store-api.vercel.app (OpenAPI: [`/openapi.json`](https://ridgeline-store-api.vercel.app/openapi.json))
- **Backend Engineer task:** this README, plus [`TEST-RESULTS.md`](TEST-RESULTS.md) (the four required edge cases, each traced to its API log line)
- **AI Engineer task:** [`AI-ENGINEER-RESULTS.md`](AI-ENGINEER-RESULTS.md): a 30-conversation test set, before 25/30 → after 29/30, the fixes, and what the repeated runs showed
- **Stack:** NestJS 11 · TypeScript · PostgreSQL (Neon) · Zod · Jest + Supertest · Vercel

```
Customer ──chat──▶ Agentplace agent (GPT-6 Luna)
                        │  server-side tools, key from env var RIDGELINE_API_KEY
                        ▼
                  Store API (this repo, Vercel)
                  GET /v1/stock/{sku}
                  GET /v1/orders/{orderId}?email=
                        │
                        ▼
                  Postgres (Neon): products, orders, order_items, api_clients
```

## Endpoints

| Method | Path | Scope | What it returns |
|---|---|---|---|
| GET | `/v1/stock/{sku}` | `stock:read` | Availability (`in_stock` / `low_stock` / `out_of_stock`), quantity, price, restock date |
| GET | `/v1/orders/{orderId}?email=` | `orders:read` | Status, items, total, carrier and tracking, delivery dates |
| GET | `/health`, `/openapi.json` | none | Health check and the OpenAPI 3.1 document |

Auth: `Authorization: Bearer <key>` or `X-API-Key: <key>`.

### Example

```bash
curl https://ridgeline-store-api.vercel.app/v1/stock/RDG-1002 -H "Authorization: Bearer $KEY"
```
```json
{
  "sku": "RDG-1002", "name": "Summit Shell Jacket", "variant": "Blue, L",
  "price": { "amount": "189.00", "currency": "USD", "display": "$189.00" },
  "availability": "out_of_stock", "quantity_available": 0, "restock_date": "2026-12-08",
  "customer_summary": "Summit Shell Jacket (Blue, L) is out of stock. We expect more on Tuesday, December 8."
}
```

## Design decisions

**Built for an agent to read, not just for a program.** Each success includes a `customer_summary` sentence, and each error has the same shape:

```json
{ "error": { "code": "ORDER_VERIFICATION_FAILED",
             "message": "I couldn't verify that order with the email address provided.",
             "agent_hint": "Do not reveal anything about this order. Ask the customer to check the email used at checkout...",
             "field": "email" },
  "request_id": "..." }
```

`message` is safe to say to the customer word for word. `agent_hint` tells the model what to do next: ask again, offer a handoff, or don't guess. `code` stays stable so the agent can branch on it. The API does the computing and the model only phrases the answer, so a small model like Luna doesn't have to interpret raw fields or invent wording for failures.

**Authorization at two levels.**
1. **API keys with scopes.** Keys are stored only as SHA-256 hashes (`api_clients.key_hash`). The agent's key has `stock:read` and `orders:read`. A second `stock-only` key exists to show a scope refusal (403 `FORBIDDEN`).
2. **Customer verification for orders.** An order number alone never reveals an order, because order numbers are easy to guess or read off a receipt. The checkout email must match, or the API refuses with 403 `ORDER_VERIFICATION_FAILED` and returns no order data.
   *Trade-off:* returning 404 for unknown orders and 403 for a wrong email does reveal whether an order number exists. I kept the two apart because the agent's next step differs ("check the number" vs. "check the email"). With real customer data I'd merge them into one 404 and add rate limiting per key.

**Validation that forgives formatting but rejects nonsense.** Zod schemas normalise what customers actually type: `rdg1001`, `RDG 1001`, `#10001`, `10001`, and emails in mixed case with stray spaces. Anything else gets a 400 `INVALID_PARAMETER` naming the `field`. Every query is parameterised, and the database's own CHECK constraints repeat the same formats.

**Failures are explained, never leaked.** Database errors become 503 `SERVICE_UNAVAILABLE` ("don't guess stock levels"). Unexpected errors become 500 `INTERNAL_ERROR` with no stack trace or driver message. Every response carries an `x-request-id`, and each request writes one structured JSON log line. Query strings are left out of the logs, so customer emails are never logged.

**Serverless-friendly data access.** The Neon HTTP driver makes one round trip per query, with no connection pool to keep warm. The order lookup is a single query (`orders` ⟕ `order_items` ⟕ `products` with `json_agg`).

## Sample data

The 10 products and 10 orders are picked so each answer path can be tested. They're in [`src/store/seed-data.ts`](src/store/seed-data.ts).

| SKU | Product | Stock |
|---|---|---|
| RDG-1001 | Summit Shell Jacket (Blue, M) | 12 |
| RDG-1002 | Summit Shell Jacket (Blue, L) | 0, restock Dec 8 |
| RDG-1003 | Summit Shell Jacket (Black, M) | 3 (low) |
| RDG-1004 | Trailhead 2-Person Tent | 7 |
| RDG-1005 | Basecamp 4-Person Tent | 0, no restock date |
| RDG-1006 | Ridgeline Hiking Boots (Brown, US 10) | 5 |
| RDG-1007 | Ridgeline Hiking Boots (Brown, US 9) | 1 (low) |
| RDG-1008 | Alpine 30L Daypack (Green) | 20 |
| RDG-1009 | Merino Base Layer Top (Grey, S) | 15 |
| RDG-1010 | Insulated Water Bottle 1L (Silver) | 40 |

Orders `ORD-10001` to `ORD-10010` cover every status: processing, on hold, shipped, out for delivery, delivered, cancelled and refunded.

## Run it locally

```bash
npm install
cp .env.example .env          # set AGENT_API_KEY and STOCK_ONLY_API_KEY
npm test                      # 33 end-to-end tests, in-memory data
npm run dev                   # http://localhost:3000, in-memory data when DATABASE_URL is empty

# With Postgres:
DATABASE_URL=postgres://... npm run db:seed   # creates the schema and loads the sample data
DATABASE_URL=postgres://... npm run dev
```

## Agent test results

All 4 required cases plus 5 extra ones pass, and each one is matched to its API log line. See [`TEST-RESULTS.md`](TEST-RESULTS.md).

## What I'd change for production

- Per-key rate limiting (e.g. Upstash Redis) plus a lockout after repeated `ORDER_VERIFICATION_FAILED`.
- Key rotation: give keys an id prefix and support two active keys during a rotation.
- Short-lived caching of stock reads, and webhooks or CDC from the store's real inventory system, instead of seeded tables.
- Alerts on the 5xx rate and p95 latency, built from the structured logs.
