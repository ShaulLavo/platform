#!/usr/bin/env node
// namecheck.mjs — screen candidate product names for claimability.
//
// Node 20+ only. Built-in `fetch`, no external deps.
// Reads `candidates.txt` (one "Platform / Unit" per line; bare "Platform" ok)
// and prints a ranked claimability report + writes results.csv.
//
// Domain model: this is for naming a developer platform. Only the *Platform*
// word must be ownable; the Unit is doc vocabulary, carried through to output
// but never registered. Registry checks can prove a name is TAKEN but can
// never prove it is SAFE — a live competitor in the AI/dev-tooling lane is the
// real disqualifier, so we emit a manual search URL per name and never claim
// safety from registry data alone.
//
// Checks per platform: npm (registry), domains (authoritative RDAP per TLD via
// IANA's bootstrap — see checkDomain for why not rdap.org), github handle, and
// an emitted manual lane-search URL.
//
// Optional: set GITHUB_TOKEN (or GH_TOKEN) to lift GitHub's 60-req/hr
// unauthenticated cap; without it, GitHub checks degrade to UNKNOWN.

import { readFile, writeFile } from 'node:fs/promises';

// ----------------------------------------------------------------------------
// config
// ----------------------------------------------------------------------------

const TLDS = ['dev', 'com', 'io', 'sh', 'app']; // .dev/.com weighted x2 in scoring
const CONCURRENCY = 8; // global in-flight HTTP cap — polite, deterministic
const REQ_TIMEOUT_MS = 8000;
const MAX_RETRIES = 1;
const DOMAIN_RETRIES = 3; // RDAP servers throttle in bursts; give them a few tries
const RETRY_AFTER_CAP_MS = 6000; // honor Retry-After but never block longer than this
const TWO_YEARS_MS = 1000 * 60 * 60 * 24 * 365 * 2;
const UA = 'namecheck.mjs name-availability-checker';
const GH_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

// Some authoritative RDAP hosts (notably Google's, shared by .dev + .app) 429
// on bursts. Cap our concurrency *per host* so we never trip them in the first
// place; everything else rides the global limiter.
const HOST_CAPS = { 'pubapi.registry.google': 3 };

// ccTLDs missing from IANA's RDAP bootstrap. rdap.org can't route these and
// returns a misleading 404 for every name (registered or not), so we point at
// the registry's own RDAP instead. May be unreachable from some IPs -> UNKNOWN.
const RDAP_FALLBACK = {
  io: 'https://rdap.identitydigital.services/rdap/',
  sh: 'https://rdap.identitydigital.services/rdap/',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ----------------------------------------------------------------------------
// concurrency limiter — caps *requests* in flight, so firing every candidate's
// checks at once still only runs CONCURRENCY at a time.
// ----------------------------------------------------------------------------

function createLimiter(max) {
  let active = 0;
  const queue = [];
  const pump = () => {
    if (active >= max) return;
    const job = queue.shift();
    if (!job) return;
    active++;
    job
      .run()
      .then(job.resolve, job.reject)
      .finally(() => {
        active--;
        pump();
      });
  };
  return (run) =>
    new Promise((resolve, reject) => {
      queue.push({ run, resolve, reject });
      pump();
    });
}

const limit = createLimiter(CONCURRENCY);

// Per-host sub-limiters layered under the global one, for hosts that throttle.
const hostLimiters = new Map();
function hostLimit(url, run) {
  let host = '';
  try {
    host = new URL(url).host;
  } catch {
    return run();
  }
  const cap = HOST_CAPS[host];
  if (!cap) return run();
  let lim = hostLimiters.get(host);
  if (!lim) {
    lim = createLimiter(cap);
    hostLimiters.set(host, lim);
  }
  return lim(run);
}

// ----------------------------------------------------------------------------
// HTTP — never throws. Returns { status, ok, bodyText, retryAfter, error }.
// Per-request timeout, retries with polite backoff on 403/429/5xx/network,
// honoring Retry-After (capped).
// ----------------------------------------------------------------------------

async function rawGet(url, headers, timeoutMs, needBody) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, redirect: 'follow', signal: controller.signal });
    const retryAfter = res.headers.get('retry-after');
    const rlRemaining = res.headers.get('x-ratelimit-remaining');
    // Domain/GitHub checks are status-only — don't download bodies we never read.
    if (!needBody) {
      await res.body?.cancel().catch(() => {});
      return { status: res.status, ok: res.ok, bodyText: '', retryAfter, rlRemaining, error: null };
    }
    const bodyText = await res.text().catch(() => '');
    return { status: res.status, ok: res.ok, bodyText, retryAfter, rlRemaining, error: null };
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'timeout' : err.message;
    return { status: 0, ok: false, bodyText: '', retryAfter: null, rlRemaining: null, error: reason };
  } finally {
    clearTimeout(timer);
  }
}

function isRetryable(res) {
  if (res.error) return true;
  if (res.status === 403 || res.status === 429) return true;
  return res.status >= 500;
}

function backoffMs(res, attempt) {
  const ra = Number(res.retryAfter);
  if (Number.isFinite(ra) && ra > 0) return Math.min(ra * 1000, RETRY_AFTER_CAP_MS);
  const throttled = res.status === 403 || res.status === 429;
  return (throttled ? 500 : 300) * attempt;
}

// Per-host circuit breaker — opens ONLY on a definitive "stop" signal, never on
// a transient throttle. Two triggers: a 429 with an absurd Retry-After (a hard
// ban, e.g. Identity Digital's ~13h) or an exhausted rate-limit window
// (x-ratelimit-remaining: 0, GitHub's unauthenticated wall). Once open, further
// requests to that host fail fast to UNKNOWN. Plain 429s with no such signal
// (Google's burst throttle) are left to ordinary retries instead.
const BLOCK_RETRY_AFTER_S = 60;
const hostBreaker = new Map();
const circuitOpen = () => ({ status: 0, ok: false, bodyText: '', retryAfter: null, rlRemaining: null, error: 'circuit-open' });

function hostState(host) {
  let s = hostBreaker.get(host);
  if (!s) {
    s = { open: false };
    hostBreaker.set(host, s);
  }
  return s;
}

function noteHost(host, res) {
  if (res.status !== 403 && res.status !== 429) return;
  const ra = Number(res.retryAfter);
  const hardBan = Number.isFinite(ra) && ra > BLOCK_RETRY_AFTER_S;
  const exhausted = res.rlRemaining === '0';
  if (hardBan || exhausted) hostState(host).open = true;
}

async function get(url, opts = {}) {
  const { headers = {}, timeoutMs = REQ_TIMEOUT_MS, needBody = false, retries = MAX_RETRIES } = opts;
  let host = '';
  try {
    host = new URL(url).host;
  } catch {
    host = '';
  }
  return limit(() =>
    hostLimit(url, async () => {
      if (host && hostState(host).open) return circuitOpen();
      let attempt = 0;
      while (true) {
        const res = await rawGet(url, { 'User-Agent': UA, ...headers }, timeoutMs, needBody);
        if (host) noteHost(host, res);
        const open = host && hostState(host).open;
        if (!isRetryable(res) || attempt >= retries || open) return res;
        attempt++;
        await sleep(backoffMs(res, attempt));
      }
    }),
  );
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// input parsing — robust to messy lists.
// ----------------------------------------------------------------------------

function cleanLine(raw) {
  let s = raw.replace(/\r$/, '');
  s = s.replace(/^\s*[-•>]+\s+/, ''); // leading bullet markers
  s = s.replace(/^\s*\d+[.):]\s*/, ''); // leading "12." / "12)" / "12:" numbering
  s = s.replace(/[*_`~]+/g, ''); // markdown bold/italic/strike/code
  s = s.replace(/\([^)]*\)/g, ' '); // parenthetical notes e.g. "(verified)"
  s = s.replace(/\p{Extended_Pictographic}/gu, ' '); // emoji
  s = s.replace(/[\u{1F1E6}-\u{1F1FF}\u{FE00}-\u{FE0F}\u{200D}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function parseCandidate(raw) {
  const cleaned = cleanLine(raw);
  if (!cleaned || cleaned.startsWith('#')) return null;
  const [left, ...right] = cleaned.split('/');
  const platform = left.trim();
  const unit = right.join('/').trim();
  const name = platform.toLowerCase().replace(/[^a-z0-9._-]+/g, '');
  if (!name) return null;
  return { platform, unit, name };
}

// ----------------------------------------------------------------------------
// checks
// ----------------------------------------------------------------------------

const laneUrl = (name) =>
  `https://www.google.com/search?q=${encodeURIComponent(`${name} developer platform cli`).replace(/%20/g, '+')}`;

function fmtAge(ms) {
  const years = ms / (365 * 24 * 3600 * 1000);
  return `${years.toFixed(1)}y`;
}

// npm: 404 = FREE. 200 + stale (>~2y) + 0.x latest = DEAD-SQUAT (claimable via
// scope/variant). 200 + recent = TAKEN-LIVE. Uses the abbreviated packument
// (smaller payload) which still carries `modified` + `dist-tags`.
async function checkNpm(name) {
  const res = await get(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
    headers: { Accept: 'application/vnd.npm.install-v1+json' },
    needBody: true,
  });
  if (res.error) return { code: 'UNKNOWN', detail: res.error };
  if (res.status === 404) return { code: 'FREE', detail: '' };
  if (res.status !== 200) return { code: 'UNKNOWN', detail: `http ${res.status}` };

  const data = safeJson(res.bodyText);
  if (!data) return { code: 'UNKNOWN', detail: 'bad json' };

  const latest = data['dist-tags']?.latest || '';
  const modified = data.modified || data.time?.modified || null;
  if (!latest) return { code: 'DEAD-SQUAT', detail: 'unpublished/empty' };

  const ageMs = modified ? Date.now() - Date.parse(modified) : 0;
  const stale = Boolean(modified) && ageMs > TWO_YEARS_MS;
  const zeroMajor = /^0\./.test(latest);
  if (stale && zeroMajor) return { code: 'DEAD-SQUAT', detail: `v${latest}, ${fmtAge(ageMs)} idle` };

  const when = modified ? `, upd ${modified.slice(0, 10)}` : '';
  return { code: 'TAKEN-LIVE', detail: `v${latest}${when}` };
}

// Domains via RDAP (not whois). We route each TLD to its *authoritative* RDAP
// server from IANA's official bootstrap, rather than the public rdap.org
// aggregator the brief suggested: rdap.org rate-limits hard (Retry-After 10s)
// AND, worse, returns a misleading 404 for TLDs it can't route (.io/.sh),
// which would read as a false "available". Authoritative servers are fast and
// correct. `rdapBase` is the resolved tld -> base-URL map; missing TLDs that we
// can't reach reliably are reported UNKNOWN instead of guessed.
let rdapBase = {};

async function loadRdapMap() {
  const map = {};
  const res = await get('https://data.iana.org/rdap/dns.json', { needBody: true, timeoutMs: 10000 });
  const data = res.status === 200 ? safeJson(res.bodyText) : null;
  for (const [tlds, urls] of data?.services ?? []) {
    const base = urls.find((u) => u.startsWith('https://')) || urls[0];
    for (const tld of tlds) {
      if (TLDS.includes(tld)) map[tld] = base;
    }
  }
  for (const [tld, base] of Object.entries(RDAP_FALLBACK)) {
    if (!map[tld]) map[tld] = base;
  }
  rdapBase = map;
}

// 404 = available, 200 = taken, no reachable server / throttled = unknown.
async function checkDomain(name, tld) {
  const base = rdapBase[tld];
  if (!base) return 'unknown';
  const url = `${base.replace(/\/+$/, '')}/domain/${name}.${tld}`;
  const res = await get(url, { headers: { Accept: 'application/rdap+json' }, retries: DOMAIN_RETRIES });
  if (res.status === 404) return 'free';
  if (res.status === 200) return 'taken';
  return 'unknown';
}

// Both /users/<name> and /orgs/<name> must 404 for the handle to be free.
// GitHub caps unauthenticated traffic at 60 req/hr; once the api.github.com
// host breaker opens, remaining checks short-circuit fast to UNKNOWN. A token
// lifts the cap and resolves them for real.
async function checkGithub(name) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (GH_TOKEN) headers.Authorization = `Bearer ${GH_TOKEN}`;
  const handle = encodeURIComponent(name);
  const opts = { headers };
  const [user, org] = await Promise.all([
    get(`https://api.github.com/users/${handle}`, opts),
    get(`https://api.github.com/orgs/${handle}`, opts),
  ]);
  const blocked = (r) => r.error || r.status === 403 || r.status === 429;
  if (blocked(user) || blocked(org)) return 'UNKNOWN';
  if (user.status === 404 && org.status === 404) return 'FREE';
  if (user.status === 200 || org.status === 200) return 'TAKEN';
  return 'UNKNOWN';
}

// ----------------------------------------------------------------------------
// scoring + screening
// ----------------------------------------------------------------------------

function scoreRow(npmCode, domains, gh) {
  let score = 0;
  if (npmCode === 'FREE') score += 3;
  else if (npmCode === 'DEAD-SQUAT') score += 1;
  for (const tld of TLDS) {
    if (domains[tld] !== 'free') continue;
    score += tld === 'dev' || tld === 'com' ? 2 : 1;
  }
  if (gh === 'FREE') score += 2;
  return score;
}

const emptyDomains = () => Object.fromEntries(TLDS.map((t) => [t, 'unknown']));

async function screen(cand) {
  try {
    const [npm, gh, ...domainStates] = await Promise.all([
      checkNpm(cand.name),
      checkGithub(cand.name),
      ...TLDS.map((tld) => checkDomain(cand.name, tld)),
    ]);
    const domains = Object.fromEntries(TLDS.map((tld, i) => [tld, domainStates[i]]));
    const score = scoreRow(npm.code, domains, gh);
    return { ...cand, npm, domains, gh, score, lane: laneUrl(cand.name) };
  } catch (err) {
    // a single failed lookup must never sink the run.
    return {
      ...cand,
      npm: { code: 'UNKNOWN', detail: err.message },
      domains: emptyDomains(),
      gh: 'UNKNOWN',
      score: 0,
      lane: laneUrl(cand.name),
    };
  }
}

// ----------------------------------------------------------------------------
// output
// ----------------------------------------------------------------------------

const DOM_LABEL = { free: 'free', taken: 'taken', unknown: '?' };
const GH_LABEL = { FREE: 'free', TAKEN: 'taken', UNKNOWN: '?' };

function renderTable(rows) {
  const header = ['name', 'npm', '.dev', '.com', '.io', 'gh', 'score', 'lane_url'];
  const body = rows.map((r) => [
    r.name,
    r.npm.code,
    DOM_LABEL[r.domains.dev],
    DOM_LABEL[r.domains.com],
    DOM_LABEL[r.domains.io],
    GH_LABEL[r.gh],
    String(r.score),
    r.lane,
  ]);
  const grid = [header, ...body];
  const widths = header.map((_, c) => Math.max(...grid.map((row) => row[c].length)));
  const last = header.length - 1;
  const line = (row) => row.map((cell, c) => (c === last ? cell : cell.padEnd(widths[c]))).join('  ');
  const rule = widths.map((w, c) => (c === last ? '--------' : '-'.repeat(w))).join('  ');
  return [line(header), rule, ...body.map(line)].join('\n');
}

function csvCell(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows) {
  const headers = [
    'name', 'unit', 'npm', 'npm_detail',
    'dev', 'com', 'io', 'sh', 'app',
    'github', 'score', 'lane_url',
  ];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.name, r.unit, r.npm.code, r.npm.detail,
        r.domains.dev, r.domains.com, r.domains.io, r.domains.sh, r.domains.app,
        r.gh, r.score, r.lane,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

// Shortlist gate: the name must be ownable on npm and reachable on a primary
// domain. GitHub is a soft signal (it still feeds the score and is shown per
// row), not a gate — the npm name + domain are what actually must be claimable.
function qualifies(r) {
  const npmOk = r.npm.code === 'FREE' || r.npm.code === 'DEAD-SQUAT';
  const domainOk = r.domains.dev === 'free' || r.domains.com === 'free';
  return npmOk && domainOk;
}

function printShortlist(rows) {
  const list = rows.filter(qualifies);
  console.log('\nSHORTLIST — npm free/dead-squat + (.dev or .com free):');
  if (list.length === 0) {
    console.log('  (none qualified)');
    return;
  }
  for (const r of list) {
    const freeDomains = TLDS.filter((t) => r.domains[t] === 'free').map((t) => `.${t}`).join(' ') || '(none)';
    console.log(`  ${r.platform} / ${r.unit}  —  npm ${r.npm.code}, domains ${freeDomains}, gh ${GH_LABEL[r.gh]}, score ${r.score}`);
    console.log(`      eyeball the lane: ${r.lane}`);
  }
}

// ----------------------------------------------------------------------------
// main
// ----------------------------------------------------------------------------

async function readCandidates(file) {
  const text = await readFile(file, 'utf8');
  const seen = new Set();
  const candidates = [];
  for (const raw of text.split('\n')) {
    const c = parseCandidate(raw);
    if (!c || seen.has(c.name)) continue;
    seen.add(c.name);
    candidates.push(c);
  }
  return candidates;
}

async function main() {
  const file = process.argv[2] || 'candidates.txt';
  let candidates;
  try {
    candidates = await readCandidates(file);
  } catch (err) {
    console.error(`Cannot read ${file}: ${err.message}`);
    process.exit(1);
  }
  if (candidates.length === 0) {
    console.error(`No candidates parsed from ${file}.`);
    process.exit(1);
  }

  const ghMode = GH_TOKEN ? 'github: authenticated' : 'github: unauthenticated (may rate-limit to UNKNOWN)';
  console.error(`Screening ${candidates.length} platform names @ concurrency ${CONCURRENCY} — ${ghMode}`);

  const t0 = Date.now();
  await loadRdapMap();
  const noRdap = TLDS.filter((t) => !rdapBase[t]);
  if (noRdap.length > 0) {
    console.error(`RDAP: no reachable server for ${noRdap.map((t) => `.${t}`).join(', ')} — those will report UNKNOWN.`);
  }
  const rows = await Promise.all(candidates.map(screen));
  rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  console.log(`\n${renderTable(rows)}`);

  await writeFile('results.csv', toCsv(rows), 'utf8');
  console.log(`\nWrote results.csv (${rows.length} rows).`);

  printShortlist(rows);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const ghUnknown = rows.filter((r) => r.gh === 'UNKNOWN').length;
  console.error(`\nDone in ${elapsed}s.`);
  if (ghUnknown > 0 && !GH_TOKEN) {
    console.error(`${ghUnknown}/${rows.length} github checks were UNKNOWN (unauthenticated 403). Set GITHUB_TOKEN to resolve them.`);
  }
}

main().catch((err) => {
  console.error(`Fatal: ${err.stack || err.message}`);
  process.exit(1);
});
