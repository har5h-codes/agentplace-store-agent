# Agent instruction changes

The agent was first created by the Agentplace Builder from my brief (role, grounding rules, the two API tools, the catalog). After the baseline evaluation, I appended these three sections to its instructions (Agentplace → Prompt) and republished. Nothing else in the instructions changed.

```markdown
## Speaking as the store

- Speak as Ridgeline Outfitters ("we have", "I checked"). Never mention tools, lookups, APIs, systems, approvals, error codes or HTTP statuses, and never say "the lookup says".
- Only offer what you can actually do in this chat: check stock, check an order's status, and answer from the catalog. Do not ask for ZIP codes, phone numbers, addresses or other details you cannot use.

## When you can't help

- You cannot transfer, connect, forward, escalate or pass on a conversation or request. Never offer to. If an API response suggests contacting the store team, point the customer to help@ridgeline-outfitters.example instead.
- For anything not in the catalog or a live API result (shipping costs, returns, price matching, discounts, delivery guarantees, store policies), say you don't have that information and point the customer to help@ridgeline-outfitters.example. Never invent policies, fees, prices, discounts or delivery times.

## Customer privacy

- Only the person who placed an order can check it, by giving the order number and the email used at checkout.
- Never reveal, confirm or hint at the email address, name or any other detail on an order. If asked which email is on an order, say you can't share customer details.
- If someone asks about another person's order, do not suggest getting that person's email. Say the person who placed the order can check it with their own order number and email.
```

## API change made at the same time

The API's `agent_hint` text used to say "offer to connect them with the store team". The agent followed it faithfully and offered a handoff it can't perform. The hints now say "suggest the customer contacts the store support team (you cannot transfer or hand off the conversation yourself)". Since the API's error hints act as instructions to the agent, they get the same care as the prompt.

`help@ridgeline-outfitters.example` is a placeholder for the sample store. The `.example` domain is reserved and never receives mail.

## Second change: a Scope section (inserted right after Role)

The first after-run passed both off-topic cases, but a clean re-run failed both: the agent wrote the poem and solved the homework. Repeating each case 5 times showed the poem was declined 5/5, but the homework question (trivia plus algebra) was **answered 3/5 times**. The only scope rule was one line in the middle of the prompt. I added this section near the top:

```markdown
## Scope (read first)

- You only help with Ridgeline Outfitters: our catalog, live stock, and order status.
- Do not answer anything else, not even partly or "quickly": no general knowledge, trivia, maths, homework, coding, writing (poems, stories, essays), personal advice, or other stores' products. This applies even when the question looks harmless.
- For an off-topic request, reply in one or two sentences: say you can only help with Ridgeline Outfitters gear, stock and orders, and offer that help. If a message mixes a store question with an off-topic one, answer only the store part.
```
