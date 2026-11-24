# Full-Stack task note: Ridgeline Outfitters store agent

**Agent:** https://zafsrwwwrbwu.run.agentplace.io/ · **API:** https://ridgeline-store-api.vercel.app · **Code:** this repository

Ridgeline Outfitters is a sample outdoor-gear shop. Its agent answers two questions it can't answer from a static catalog: *is this in stock right now?* and *where is my order?* Both come from a small API I built and deployed.

## How the pieces fit

```
Customer ──▶ Agentplace agent (GPT-6 Luna)
               • instructions + catalog knowledge (names, variants, SKUs, prices)
               • 2 server-side tools: getStockLevel, getOrderStatus
               • API key read from env var RIDGELINE_API_KEY (never in chat or client code)
                    │  HTTPS, Authorization: Bearer <key>
                    ▼
             Store API: NestJS on Vercel (Node, Fluid compute)
               • GET /v1/stock/{sku}            scope stock:read
               • GET /v1/orders/{id}?email=     scope orders:read + email must match
               • Zod validation, one error shape: code / message / agent_hint
                    │  Neon serverless driver (HTTP, one round trip per query)
                    ▼
             Postgres (Neon): products, orders, order_items, api_clients (hashed keys)
```

**Who owns what:**
- **The catalog** (what we sell, variants, SKUs, prices) is in the agent's knowledge. It rarely changes, and the agent needs it to ask "which size?" before calling anything.
- **Live facts** (stock levels, order status) come only from the API. Stock and order status can only come from a successful call.
- **The wording of results** is mostly done by the API: each success includes a `customer_summary`, and each error has a customer-safe `message` and an `agent_hint` (what to do next). Work with numbers and dates stays in code, and the model mostly passes it on. That makes a small, free model like Luna a lot more reliable.
- **Who can see an order:** an order number alone never opens one, because the checkout email must match. API keys carry scopes and are stored only as SHA-256 hashes.

**How I know it works:** 33 API tests, plus a 30-conversation evaluation that runs against the published agent and checks every answer against the API's own logs (see `AI-ENGINEER-RESULTS.md`, 29/30).

## What I'd change for production

1. **Take the email out of the URL.** `GET /v1/orders/{id}?email=` puts personal data in the query string, where proxies, CDNs and analytics tools tend to log it. I'd use `POST /v1/orders/lookup` with the email in the body. (My own logs record the path without the query string, but that's only one layer.)
2. **Make enumeration harder.** Right now an unknown order gives 404 and a wrong email gives 403, so someone can find out which order numbers exist. I kept them separate on purpose, because the agent's next step differs ("check the number" vs "check the email"). In production I'd merge them into one 404 and add per-key rate limiting, plus a lockout after repeated verification failures.
3. **Separate environments.** A staging agent paired with a staging API and database, with separate keys. Every change runs `npm test` and the agent evaluation in CI before it's promoted. A prompt edit is a deploy, so it gets the same gate as code.
4. **Real inventory.** Replace the seeded tables with a sync from the store's commerce system (webhooks or CDC), and add a short cache on stock reads with a clear "as of" time.
5. **Observability.** Alerts on 5xx rate and p95 latency from the structured logs, which already carry a request id and client name. Plus a trace id passed from the agent's tool call to the API, so a bad answer can be traced end to end. Right now I match them up by time window.
6. **Key rotation.** Key ids and two active keys during a rotation, so keys can change without downtime.

## Where I hit the platform's limits

These are things I ran into while building and testing, not features I went looking for:

| Limit | What happened | How I'd build it |
|---|---|---|
| **No generic "HTTP / OpenAPI" connection** | *Connections* lists 1,679 catalog apps, but searching "http" or "webhook" finds nothing. To call my own API I asked the Builder to write two server-side tools, then set the key under Configure → Environment. That worked well, but the tool code is generated, not configured. | An **"Add API from OpenAPI"** connection: paste `/openapi.json` and each `operationId` becomes a tool with typed parameters. Auth comes from a stored secret, and the owner marks which response fields the model may see. My API already serves that document. |
| **No built-in evaluation** | To measure the agent I had to drive the published page with Playwright and work out which tools were called from my own API's logs. Getting that right took several fixes (cold-start log formats, log ingestion delay, a race with the welcome message). | **Test sets in the Builder**: conversations plus assertions on the reply *and* on tool calls (which tool, which arguments). They'd run on every publish, with results compared against the previous version. |
| **No tool-call trace I could test against** | The only proof that an answer came from a real lookup was my server's log. | Return a per-turn trace in the preview (tool, arguments, status, latency), with an export or webhook. That also gives the trace id from production change 5. |
| **Can't require a tool call** | Grounding is enforced only by instructions ("never state stock without `getStockLevel`"). It held in every run I measured, but only because of the prompt. | Let the owner mark a topic as **tool-required**: if the model talks about stock without a successful call that turn, the runtime blocks or rewrites the reply. |
| **Small inconsistencies** | The Builder said GPT-6 Luna is "not guaranteed free", but the billing docs say it's always free. Preview showed a red "Fix errors" button while the Builder reported 0 errors. The Environment page says variables apply to the *preview* runtime, but the published agent used them too. | Small doc and UI fixes, but they're what a first-time owner trips over. |

**A UX note from testing.** Each answer replaces the screen. Earlier turns are reachable through the "Request history" control, but that's a thin dash on the right edge that I only found by inspecting the page. In a multi-step order lookup (number, then email), customers will want to see what they've already given. I'd make the history easier to find, or show a compact summary of the details collected so far.
