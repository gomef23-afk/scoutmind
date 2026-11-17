// The service worker's VERSION matches the files it precaches (CLAUDE.md rule 24).
//
//   node tests/sw-version.test.js
//
// Fails when a shell file changed and `node scripts/bump-sw.mjs` was not run,
// which would leave readers on the old shell after a deploy. Also checks the
// precache list points at real files, and that sw.js never intercepts what it
// must not (Supabase, /api/). No dependencies.

import { readFileSync, existsSync } from 'node:fs';
import { precacheList, computeVersion, storedVersion, staleStamps, VERSIONED } from '../scripts/bump-sw.mjs';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };

const pub = new URL('../public/', import.meta.url);
const sw = readFileSync(new URL('sw.js', pub), 'utf8');
const list = precacheList(sw);

const missing = list.filter((p) => !existsSync(new URL(p === '/' ? 'index.html' : p.slice(1), pub)));
check('every precached file exists', missing.length === 0, missing.join(', '));
check('the precache holds the app itself', list.includes('/') && list.includes('/offline.html'));

const want = computeVersion(list);
const got = storedVersion(sw);
check('sw.js VERSION matches its files (run: node scripts/bump-sw.mjs)', got === want, `stored ${got}, files say ${want}`);

// The never-cache rules, as code: no Supabase host, no /api/ in the precache,
// and the fetch handler returns early for both.
check('nothing under /api/ is precached', !list.some((p) => p.startsWith('/api/')));
check('the fetch handler leaves other origins alone (only the image host is cached)',
  /if \(url\.origin !== self\.location\.origin\) \{\s*if \(IMAGE_HOSTS\.includes/.test(sw));
check('the fetch handler skips /api/, /rest/ and /auth/v1/',
  /pathname\.startsWith\('\/api\/'\)[\s\S]{0,80}pathname\.startsWith\('\/rest\/'\)[\s\S]{0,80}pathname\.startsWith\('\/auth\/v1\/'\)/.test(sw));
check('writes are never intercepted', /if \(req\.method !== 'GET'\) return;/.test(sw));

// The manifest the installability check reads.
const mf = JSON.parse(readFileSync(new URL('manifest.json', pub), 'utf8'));
check('manifest: start_url and scope are /', mf.start_url === '/' && mf.scope === '/');
check('manifest: standalone, navy theme and splash (commit 5)', mf.display === 'standalone' && mf.theme_color === '#12304F' && mf.background_color === '#12304F');
const sizes = mf.icons.map((i) => i.sizes + ':' + i.purpose);
check('manifest: 192 and 512 icons, any and maskable', ['192x192:any', '512x512:any', '192x192:maskable', '512x512:maskable'].every((s) => sizes.includes(s)), sizes.join(', '));
check('manifest: maskable icons are their own files (safe-zone monogram), not the "any" ones',
  mf.icons.filter((i) => i.purpose === 'maskable').every((i) => /icon-maskable-\d+\.png$/.test(i.src)));
check('manifest icons exist', mf.icons.every((i) => existsSync(new URL(i.src.slice(1), pub))));

// Every page that carries the nav links the manifest and pwa.js.
for (const page of ['index.html', 'about.html', 'community.html', 'auth.html', 'terms.html', 'privacy.html']) {
  const html = readFileSync(new URL(page, pub), 'utf8');
  check(`${page}: manifest + pwa.js + apple tags`,
    html.includes('<link rel="manifest" href="/manifest.json">') && /<script src="\/pwa\.js(\?v=[0-9a-f]+)?" defer><\/script>/.test(html)
      && html.includes('apple-mobile-web-app-capable'));
  check(`${page}: no third-party font or script host`, !/fonts\.googleapis\.com|cdn\.jsdelivr\.net/.test(html));
}

// news.html is gone (4b-7): no file, no link to it, a redirect for old links.
check('news.html is deleted and nothing links to it', !existsSync(new URL('news.html', pub))
  && ['index.html', 'about.html', 'community.html', 'auth.html', 'terms.html', 'privacy.html', 'offline.html', 'sw.js', 'pwa.js']
    .every((p) => !readFileSync(new URL(p, pub), 'utf8').includes('news.html')));
check('vercel.json sends an old /news.html link to the app', (() => { try { const v = JSON.parse(readFileSync(new URL('../vercel.json', pub), 'utf8')); return (v.redirects || []).some((r) => r.source === '/news.html' && r.destination === '/'); } catch (e) { return false; } })());

// Offline empty states (Day 6, commit 5): Matches checks the network before
// it starts a fixtures request, so a failed load offline cannot loop.
const idx = readFileSync(new URL('index.html', pub), 'utf8');
// Since 4b-2 the Matches tab loads in mxStart() (fixtures by week, mxFetch).
const md = idx.slice(idx.indexOf('async function mxStart()'));
check('Matches: the offline check comes before the fixtures load',
  md.indexOf('isOffline()') > -1 && md.indexOf('isOffline()') < md.indexOf('mxFetch('));
const sb = idx.slice(idx.indexOf('function loadSidebarFixtures('));
check('Home sidebar: the offline check comes before its fixtures load',
  sb.indexOf('isOffline()') > -1 && sb.indexOf('isOffline()') < sb.indexOf('loadFixtures()'));
check('Home and Scout use the offline empty state',
  (idx.match(/isOffline\(\)\?offlineHtml\(\)/g) || []).length >= 6);
check('offline strings exist in both languages', /'off\.title':/.test(readFileSync(new URL('i18n.js', pub), 'utf8')));

// ── Versioned assets (17 Nov 2026): a page and its scripts update together ──
const stale = staleStamps();
check('every page asks for the shared scripts and styles with their current ?v= hash (run: node scripts/bump-sw.mjs)',
  stale.length === 0, stale.slice(0, 5).map((x) => `${x.page} ${x.name} ${x.found}`).join('; '));
check('i18n.js is one of the versioned assets', VERSIONED.includes('i18n.js'));
const swText = readFileSync(new URL('sw.js', pub), 'utf8');
check('sw.js answers a ?v= request only from an exact cache match, else the network',
  /if \(new URL\(req\.url\)\.searchParams\.has\('v'\)\) \{\s*const exact = await cache\.match\(req\);\s*if \(exact\) return exact;\s*try \{\s*const res = await fetch\(req\);/.test(swText));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
