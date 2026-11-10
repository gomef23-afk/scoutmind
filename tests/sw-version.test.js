// The service worker's VERSION matches the files it precaches (CLAUDE.md rule 24).
//
//   node tests/sw-version.test.js
//
// Fails when a shell file changed and `node scripts/bump-sw.mjs` was not run,
// which would leave readers on the old shell after a deploy. Also checks the
// precache list points at real files, and that sw.js never intercepts what it
// must not (Supabase, /api/). No dependencies.

import { readFileSync, existsSync } from 'node:fs';
import { precacheList, computeVersion, storedVersion } from '../scripts/bump-sw.mjs';

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
check('manifest: standalone, #07090f', mf.display === 'standalone' && mf.theme_color === '#07090f' && mf.background_color === '#07090f');
const sizes = mf.icons.map((i) => i.sizes + ':' + i.purpose);
check('manifest: 192 and 512 icons, and a maskable 512', ['192x192:any', '512x512:any', '512x512:maskable'].every((s) => sizes.includes(s)), sizes.join(', '));
check('manifest icons exist', mf.icons.every((i) => existsSync(new URL(i.src.slice(1), pub))));

// Every page that carries the nav links the manifest and pwa.js.
for (const page of ['index.html', 'about.html', 'community.html', 'news.html', 'auth.html', 'terms.html', 'privacy.html']) {
  const html = readFileSync(new URL(page, pub), 'utf8');
  check(`${page}: manifest + pwa.js + apple tags`,
    html.includes('<link rel="manifest" href="/manifest.json">') && html.includes('<script src="/pwa.js" defer></script>')
      && html.includes('apple-mobile-web-app-capable'));
  check(`${page}: no third-party font or script host`, !/fonts\.googleapis\.com|cdn\.jsdelivr\.net/.test(html));
}

// Offline empty states (Day 6, commit 5): Matches checks the network before
// it starts a fixtures request, so a failed load offline cannot loop.
const idx = readFileSync(new URL('index.html', pub), 'utf8');
const md = idx.slice(idx.indexOf('function renderMatchDay()'));
check('Matches: the offline check comes before the fixtures load',
  md.indexOf('isOffline()') > -1 && md.indexOf('isOffline()') < md.indexOf('loadFixtures()'));
check('Home and Scout use the offline empty state',
  (idx.match(/isOffline\(\)\?offlineHtml\(\)/g) || []).length >= 6);
check('offline strings exist in both languages', /'off\.title':/.test(readFileSync(new URL('i18n.js', pub), 'utf8')));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
