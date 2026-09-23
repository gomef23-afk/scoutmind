// Shared API-Football v3 client.
//
// Direct host (v3.football.api-sports.io), NOT RapidAPI — the header name and
// the quota headers differ between the two.
//
// The key lives only in process.env.API_FOOTBALL_KEY on Vercel. It is never
// logged, never returned in a response body, and never sent to the browser.

const BASE = 'https://v3.football.api-sports.io';

export class QuotaExhausted extends Error {}

export function createClient() {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY is not set');

  // Per-invocation counters so each job can report what it spent.
  const state = { used: 0, remaining: null, limit: null };

  async function get(path, params = {}) {
    // Refuse to start a call we already know we cannot afford. `remaining` is
    // only known after the first response, so this guards calls 2..n.
    if (state.remaining !== null && state.remaining <= 0) {
      throw new QuotaExhausted('Daily API-Football quota exhausted');
    }

    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
    ).toString();
    const url = `${BASE}/${path}${qs ? `?${qs}` : ''}`;

    let res;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(url, { headers: { 'x-apisports-key': key } });
      // 429 = rate limited (per-minute ceiling). Back off and retry.
      if (res.status !== 429) break;
      await sleep(1500 * (attempt + 1));
    }

    state.used++;
    const rem = res.headers.get('x-ratelimit-requests-remaining');
    const lim = res.headers.get('x-ratelimit-requests-limit');
    if (rem !== null) state.remaining = Number(rem);
    if (lim !== null) state.limit = Number(lim);

    if (!res.ok) {
      throw new Error(`API-Football ${res.status} on /${path}`);
    }

    const json = await res.json();

    // API-Football answers 200 even when the request was wrong; real problems
    // land in `errors` as either an array (empty = fine) or an object.
    if (json.errors && !Array.isArray(json.errors) && Object.keys(json.errors).length) {
      throw new Error(`API-Football error on /${path}: ${JSON.stringify(json.errors)}`);
    }

    return json;
  }

  return {
    get,
    stats: () => ({ ...state }),
    // True when fewer than `n` calls remain — lets a job stop cleanly and
    // resume on the next run instead of dying mid-write.
    lowQuota: (n = 5) => state.remaining !== null && state.remaining < n,
  };
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// "56%" -> 56, "" -> null, null -> null
export function pctToNumber(v) {
  if (v === null || v === undefined) return null;
  const n = parseFloat(String(v).replace('%', '').trim());
  return Number.isFinite(n) ? n : null;
}

// "187 cm" -> 187
export function cmToNumber(v) {
  if (!v) return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

// Turns the /fixtures/statistics array-of-{type,value} into a flat object.
export function statsArrayToObject(arr) {
  const out = {};
  for (const s of arr || []) out[s.type] = s.value;
  return out;
}
