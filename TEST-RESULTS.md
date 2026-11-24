# Agent test results

**Run on:** 24 Nov 2026, 11:55 to 11:59 IST (06:25 to 06:29 UTC)
**Agent:** Ridgeline Outfitters Store Assistant on Agentplace, model GPT-6 Luna, in Preview
**API:** https://ridgeline-store-api.vercel.app, backed by Postgres (Neon). `/health` returns `"storage":"postgres"`.

Each conversation was started in a fresh chat. The **API call** column comes from the API's own structured logs (`vercel logs`), not from the agent. That proves every answer came from a real request, not from the model guessing.

## Required cases

| # | Case | Customer said | API call (status) | Agent replied | Result |
|---|---|---|---|---|---|
| 1 | Existing record (stock) | "Is the Summit Shell Jacket in blue, size M in stock?" | `GET /v1/stock/RDG-1001` (200) | "Yes, the Summit Shell Jacket (Blue, M) is in stock." | ✅ |
| 2 | Existing record (order) | "Where is my order ORD-10002? My email is liam.chen@example.com" | `GET /v1/orders/ORD-10002` (200) | "Your order ORD-10002 has shipped with UPS. Tracking number: 1Z999AA10123456784. Estimated delivery: Thursday, November 26." | ✅ |
| 3 | Unknown record | "Can you check order ORD-99999? Email is liam.chen@example.com" | `GET /v1/orders/ORD-99999` (404 `ORDER_NOT_FOUND`) | "I couldn't find order ORD-99999. Please check the order number in your confirmation email, then send me the corrected number and I can try again." | ✅ |
| 4 | Invalid ID | "What's the status of order ORD-12? My email is liam.chen@example.com" | `GET /v1/orders/ORD-12` (400 `INVALID_PARAMETER`, field `order_id`) | "I couldn't check the order because ORD-12 doesn't match the expected order-number format (for example, ORD-10001). Please check your confirmation email for the full number and send it here…" | ✅ |
| 5 | Request the API refuses | "Can you tell me what's in order ORD-10002 and where it is? My email is jake.miller@example.com" (not the email on the order) | `GET /v1/orders/ORD-10002` (403 `ORDER_VERIFICATION_FAILED`) | "Sorry, I couldn't verify that order with the email address provided, so I can't share its contents or status. Please check which email was used at checkout and try again. If it still doesn't work, I can help connect you with the store team." No items, carrier or status leaked. | ✅ |

A second kind of refusal, a key without the needed scope, is checked directly against the API. The agent's key has both scopes, so it can't trigger this one:

```
GET /v1/orders/ORD-10003?email=sofia.patel@example.com   (stock-only key)
403 {"error":{"code":"FORBIDDEN","message":"I'm not able to look that up for you.", ...}}
```

## Additional cases

| # | Case | Customer said | API call (status) | Agent replied | Result |
|---|---|---|---|---|---|
| 6 | Out of stock, with restock date | "Do you have the blue Summit Shell Jacket in large?" | `GET /v1/stock/RDG-1002` (200) | "The Summit Shell Jacket Blue L is currently out of stock. The stock lookup says more is expected on Tuesday, December 8." | ✅ (wording could be better, see below) |
| 7 | Ambiguous variant | "Are the Ridgeline hiking boots in stock?" | none, correctly | "The catalog lists Ridgeline Hiking Boots Brown in US 9 and US 10. Which size should I check?" | ✅ |
| 7b | Follow-up | "US 9 please" | `GET /v1/stock/RDG-1007` (200) | "Ridgeline Hiking Boots (Brown, US 9) is in stock, with only 1 left." | ✅ |
| 8 | Missing email | "Has my order ORD-10004 shipped yet?" | none, correctly | "I can check that for you. What email address did you use at checkout for order ORD-10004?" | ✅ |
| 9 | Product not in catalog | "Do you have the Everest Down Parka in stock?" | none, correctly | "I don't see the Everest Down Parka in Ridgeline Outfitters' catalog, so I can't check its stock. I can help you find a similar jacket from our catalog if you'd like." | ✅ |

## API log for the run

```
06:25:32  200  /v1/stock/RDG-1001      28ms  client=store-agent
06:26:08  200  /v1/orders/ORD-10002    44ms  client=store-agent
06:26:40  404  /v1/orders/ORD-99999    58ms  client=store-agent
06:27:15  400  /v1/orders/ORD-12       29ms  client=store-agent
06:27:48  403  /v1/orders/ORD-10002    27ms  client=store-agent
06:28:27  200  /v1/stock/RDG-1002      35ms  client=store-agent
06:29:10  200  /v1/stock/RDG-1007      20ms  client=store-agent
```

## Observations

- **No made-up data.** Every stock or order fact in a reply traces back to a logged API call. When the agent didn't have enough to call (no size, no email, a product we don't sell), it asked or declined instead of guessing.
- **Error hints work.** In cases 3 to 5, the replies follow each response's `error.message` and `agent_hint`: ask for the number again, show the expected format, offer the store team. Without the hints, a 400 or 403 would have been left to the model to interpret.
- **Small wording issue (case 6).** "The stock lookup says…" exposes how the answer was produced. The fix is an instruction tweak: always speak as the store, never mention tools or lookups.
- **The API's input normalisation isn't exercised by the agent.** The agent sends clean SKUs and order numbers taken from the catalog and the customer's message. The forgiving parsing (`rdg1001`, `#10001`) is still covered by the API's own test suite.

## API test suite

`npm test`: 33 end-to-end tests (Jest + Supertest) covering auth (missing, wrong and scope-limited keys), validation, normalisation, every order status, verification failure without data leakage, and outage handling (503, plus 500 with no internal details).
