// Runs every conversation in test-set.json against the published Agentplace agent and saves the replies.
//
//   node evals/run.mjs --label before            all cases
//   node evals/run.mjs --label after --only stock-in,unknown-order
//
// Each case runs in a fresh browser context, so it's a new conversation with no shared memory.
// Cases run one at a time, so the API calls in the logs can be attributed to a case by time.
// It uses your installed Chrome (playwright-core, channel "chrome"); no browser download is needed.
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const label = args.label ?? 'run';
const only = args.only ? new Set(args.only.split(',')) : null;
const headed = args.headed === 'true';

const set = JSON.parse(readFileSync(join(here, 'test-set.json'), 'utf8'));
const url = args.url ?? set.agent_url;
const repeat = Math.max(1, Number(args.repeat ?? 1));
// With --repeat N each selected case runs N times (ids get a "#k" suffix), to measure flaky behaviour.
const cases = set.cases
  .filter((c) => !only || only.has(c.id))
  .flatMap((c) => Array.from({ length: repeat }, (_, k) => (repeat > 1 ? { ...c, runId: `${c.id}#${k + 1}` } : c)));

/** Waits until the welcome message has rendered and stopped changing, so it is never mistaken for a reply. */
async function waitForWelcome(page) {
  const surface = page.locator('.stage-surface').first();
  const started = Date.now();
  let last = '';
  let stableSince = Date.now();
  while (Date.now() - started < 45_000) {
    await sleep(500);
    const now = (await surface.innerText().catch(() => '')).trim();
    const busy = (await surface.getAttribute('aria-busy').catch(() => 'true')) === 'true';
    if (now !== last) {
      last = now;
      stableSince = Date.now();
    } else if (now && !busy && Date.now() - stableSince > 3000) {
      return;
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Sends one message and waits until the agent has finished and its reply has stopped changing. */
async function ask(page, text) {
  const surface = page.locator('.stage-surface').first();
  const before = (await surface.innerText().catch(() => '')).trim();
  const input = page.locator('textarea').first();
  await input.fill(text);
  await input.press('Enter');

  const started = Date.now();
  let last = '';
  let stableSince = 0;
  while (Date.now() - started < 120_000) {
    await sleep(500);
    const busy = (await surface.getAttribute('aria-busy').catch(() => 'true')) === 'true';
    const working = await page.getByText(/^Working/).first().isVisible().catch(() => false);
    const now = (await surface.innerText().catch(() => '')).trim();
    if (now && now !== before && now === last && stableSince && Date.now() - stableSince > 6000) {
      return { reply: now, ms: Date.now() - started }; // settled, but the page shows an interactive picker
    }
    if (!now || now === before) {
      stableSince = 0;
      last = now;
      continue;
    }
    if (now !== last) {
      last = now;
      stableSince = Date.now();
      continue;
    }
    if (!busy && !working && stableSince && Date.now() - stableSince > 2500) return { reply: now, ms: Date.now() - started };
  }
  return { reply: last, ms: Date.now() - started, timeout: true };
}

const browser = await chromium.launch({ channel: 'chrome', headless: !headed });
const results = { label, url, started_at: new Date().toISOString(), cases: [] };

for (const c of cases) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const record = { id: c.runId ?? c.id, category: c.category, started_at: new Date().toISOString(), turns: [] };
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.locator('textarea').first().waitFor({ timeout: 60_000 });
    await waitForWelcome(page);
    for (const t of c.turns) {
      const r = await ask(page, t.say);
      record.turns.push({ say: t.say, ...r });
      process.stdout.write(`${record.id.padEnd(32)} ${String(r.ms).padStart(6)}ms ${r.timeout ? 'TIMEOUT ' : ''}${r.reply.replace(/\s+/g, ' ').slice(0, 90)}\n`);
    }
  } catch (err) {
    record.error = String(err);
    console.log(`${c.id.padEnd(32)} ERROR ${err}`);
  }
  record.ended_at = new Date().toISOString();
  results.cases.push(record);
  await context.close();
  await sleep(1500); // gap between cases keeps log attribution clean
}

await browser.close();
results.ended_at = new Date().toISOString();
mkdirSync(join(here, 'results'), { recursive: true });
const out = join(here, 'results', `${label}.json`);
writeFileSync(out, JSON.stringify(results, null, 2));
console.log(`\nSaved ${results.cases.length} conversations to ${out}`);
