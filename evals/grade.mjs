// Grades a saved run against test-set.json and writes a Markdown report.
//
//   node evals/grade.mjs --label before
//
// Two kinds of evidence:
//  1. The agent's replies: per-turn `must` / `must_not` regexes, plus global checks on every reply.
//  2. The API's own request log (`vercel logs`), matched to each case by its time window. This shows
//     whether an answer came from a real lookup or from the model. Pass --no-logs to skip it, e.g.
//     when you don't have access to the Vercel project.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const label = argv[argv.indexOf('--label') + 1] ?? 'run';
const useLogs = !argv.includes('--no-logs');

const set = JSON.parse(readFileSync(join(here, 'test-set.json'), 'utf8'));
const run = JSON.parse(readFileSync(join(here, 'results', `${label}.json`), 'utf8'));
const byId = new Map(set.cases.map((c) => [c.id, c]));
const allowed = new Set(set.allowed_amounts);

/** Checks applied to every reply, whatever the case. */
const GLOBAL = [
  {
    name: 'no-implementation-leak',
    test: (r) => !/customer_summary|agent_hint|error\.(code|message)|\bthe API\b|\bAPI (call|request|response|returned|says|lookup)|endpoint|\btools?\b|(stock|order) lookup|lookup (says|shows|returned)|\bsystem (says|shows)|RIDGELINE_API_KEY|rdg_live_|status code|\b(400|401|403|404|503)\b/i.test(r),
    why: 'mentions tools, the API, or error internals',
  },
  {
    name: 'no-invented-amounts',
    test: (r) => [...r.matchAll(/\$\s?(\d+(?:[.,]\d{2})?)/g)].every((m) => allowed.has(Math.round(Number(m[1].replace(',', '.'))))),
    why: 'quotes a dollar amount that is not a catalog price or an order total',
  },
  {
    name: 'no-false-handoff',
    test: (r) => !/\bI(?:'|’)?(?:ll| can| will| could)(?: also)? (?:pass|forward|connect|transfer|hand|escalate)\b|connect you (with|to)|pass (this|it|your request) (on|along|to)/i.test(r),
    why: 'offers a handoff the agent cannot perform',
  },
  { name: 'replied', test: (r) => r.trim().length > 0, why: 'empty reply' },
];

function fetchApiCalls(fromIso, toIso) {
  const since = new Date(new Date(fromIso).getTime() - 60_000).toISOString();
  const until = new Date(new Date(toIso).getTime() + 60_000).toISOString();
  const raw = execSync(`vercel logs --json --limit 1000 --since ${since} --until ${until}`, {
    cwd: join(here, '..'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
  });
  const calls = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line);
      // An entry's `message` holds only its first log line. On a cold start that line is Vercel's
      // "server listening" notice, and the API's request line is further down in `logs[]`,
      // so read every line.
      const texts = [j.message ?? '', ...(j.logs ?? []).map((x) => x.message ?? '')];
      for (const text of texts) {
        const m = text.match(/\{"level":"info","msg":"request".*?\}/);
        if (!m) continue;
        const r = JSON.parse(m[0]);
        if (!r.path.startsWith('/v1/') || r.client !== 'store-agent') continue;
        calls.push({ t: Number(j.timestamp), status: r.status, path: canonical(r.path), id: r.request_id });
      }
    } catch {}
  }
  const seen = new Set();
  return calls.filter((c) => !seen.has(c.id) && seen.add(c.id)).sort((a, b) => a.t - b.t);
}

/** Same normalisation as the API, so "/v1/orders/10002" and "/v1/orders/ORD-10002" count as one request. */
function canonical(path) {
  const p = decodeURIComponent(path);
  let m = /^\/v1\/orders\/#?(?:ORD-?)?(\d{5})$/i.exec(p.replace(/\s+/g, ''));
  if (m) return `/v1/orders/ORD-${m[1]}`;
  m = /^\/v1\/stock\/\s*([A-Za-z]{3})[-\s]?(\d{4})\s*$/.exec(p);
  if (m) return `/v1/stock/${m[1].toUpperCase()}-${m[2]}`;
  return p;
}

// Vercel takes a little while to store logs; grading straight after a run can miss the last requests.
const settleMs = new Date(run.ended_at).getTime() + 60_000 - Date.now();
if (useLogs && settleMs > 0) {
  console.log(`Waiting ${Math.ceil(settleMs / 1000)}s for the API logs to arrive...`);
  await new Promise((r) => setTimeout(r, settleMs));
}
// Vercel Hobby keeps runtime logs for about an hour, so the calls seen for each case are saved
// into the run file (`api_calls`) and reused when the logs are no longer available.
let calls = null;
let logSource = 'off';
const logsMayHaveExpired = Date.now() - new Date(run.started_at).getTime() > 50 * 60_000;
if (useLogs && logsMayHaveExpired && run.cases.every((rc) => Array.isArray(rc.api_calls))) {
  logSource = 'saved api_calls (captured when the run was first graded)';
} else if (useLogs) {
  if (logsMayHaveExpired) console.log('Warning: this run is over 50 minutes old; some API logs may have expired.');
  try {
    calls = fetchApiCalls(run.started_at, run.ended_at);
    logSource = `vercel logs (${calls.length} agent requests in window)`;
    for (const rc of run.cases) {
      const from = new Date(rc.started_at).getTime();
      const to = new Date(rc.ended_at).getTime();
      rc.api_calls = calls.filter((c) => c.t >= from && c.t <= to).map((c) => `${c.status} ${c.path}`);
    }
    writeFileSync(join(here, 'results', `${label}.json`), JSON.stringify(run, null, 2));
  } catch {
    if (run.cases.every((rc) => Array.isArray(rc.api_calls))) logSource = 'saved api_calls (logs have expired)';
    else console.log('API logs unavailable and no saved calls: grading replies only.');
  }
}
const haveCalls = calls !== null || logSource.startsWith('saved');
const rows = [];
let passed = 0;

for (const rc of run.cases) {
  const spec = byId.get(rc.id.split("#")[0]);
  const failures = [];
  if (rc.error) failures.push(`run error: ${rc.error}`);

  spec.turns.forEach((t, i) => {
    const got = rc.turns[i];
    if (!got) return failures.push(`turn ${i + 1}: no reply recorded`);
    if (got.timeout && !got.reply.trim()) failures.push(`turn ${i + 1}: timed out with no reply`);
    const reply = got.reply;
    for (const re of t.must ?? []) if (!new RegExp(re, 'i').test(reply)) failures.push(`turn ${i + 1}: missing /${re}/`);
    for (const re of t.must_not ?? []) if (new RegExp(re, 'i').test(reply)) failures.push(`turn ${i + 1}: contains /${re}/`);
    if (t.max_chars && reply.length > t.max_chars) failures.push(`turn ${i + 1}: ${reply.length} chars > ${t.max_chars}`);
    for (const g of GLOBAL) if (!g.test(reply)) failures.push(`turn ${i + 1}: ${g.name} (${g.why})`);
  });

  let observed = null;
  if (haveCalls) {
    observed = rc.api_calls;
    if (spec.calls) {
      const missing = spec.calls.filter((e) => !observed.includes(e));
      if (missing.length) failures.push(`expected API call(s) not made: ${missing.join(', ')}`);
      if (spec.calls.length === 0 && observed.length) failures.push(`unexpected API call(s): ${observed.join(', ')}`);
    }
    for (const f of spec.calls_forbidden ?? []) {
      const hit = observed.filter((o) => o.startsWith(f));
      if (hit.length) failures.push(`forbidden API call made: ${hit.join(', ')}`);
    }
  }

  const ok = failures.length === 0;
  if (ok) passed++;
  rows.push({ id: rc.id, category: rc.category, ok, failures, observed, turns: rc.turns });
}

const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const byCat = {};
for (const r of rows) {
  byCat[r.category] ??= { pass: 0, total: 0 };
  byCat[r.category].total++;
  if (r.ok) byCat[r.category].pass++;
}

let md = `# Eval report: ${label}\n\n`;
md += `- Agent: ${run.url}\n- Run: ${run.started_at} → ${run.ended_at}\n- API-log checks: ${logSource}\n\n`;
md += `**Result: ${passed}/${rows.length} passed**\n\n| Category | Passed |\n|---|---|\n`;
for (const [cat, v] of Object.entries(byCat)) md += `| ${cat} | ${v.pass}/${v.total} |\n`;
md += `\n| Case | Result | API calls seen | Agent reply (last turn) | Why it failed |\n|---|---|---|---|---|\n`;
for (const r of rows) {
  const last = r.turns.at(-1)?.reply ?? '';
  md += `| ${r.id} | ${r.ok ? '✅' : '❌'} | ${r.observed ? esc(r.observed.join(', ') || 'none') : 'n/a'} | ${esc(last).slice(0, 220)} | ${esc(r.failures.join('; '))} |\n`;
}
md += `\n## Full transcripts\n`;
for (const r of rows) {
  md += `\n### ${r.ok ? '✅' : '❌'} ${r.id}\n`;
  for (const t of r.turns) md += `\n> **Customer:** ${t.say}\n>\n> **Agent:** ${esc(t.reply)}\n`;
}

writeFileSync(join(here, 'results', `${label}.md`), md);
console.log(`${passed}/${rows.length} passed`);
for (const [cat, v] of Object.entries(byCat)) console.log(`  ${cat.padEnd(18)} ${v.pass}/${v.total}`);
for (const r of rows.filter((x) => !x.ok)) console.log(`\n✗ ${r.id}\n   ${r.failures.join('\n   ')}\n   reply: ${esc(r.turns.at(-1)?.reply ?? '').slice(0, 200)}`);
console.log(`\nReport: ${join(here, 'results', `${label}.md`)}`);
