// Writes public/sw.js's VERSION from the contents of every precached file.
//
//   node scripts/bump-sw.mjs
//
// CLAUDE.md rule 24: run this after changing anything sw.js precaches (the
// pages, sm_auth.js, club_names.js, leagues_data.js, pwa.js, icons, vendor
// files). A new VERSION is a new shell cache; the old one is dropped when the
// new worker activates, so no reader is stuck on an old shell after a deploy.
// tests/sw-version.test.js fails while VERSION is stale.
//
// No build step, no dependencies: the version is a hash of the files
// themselves, so it changes exactly when they do. Text files are hashed with
// line endings normalised, so a CRLF and an LF checkout give the same hash.

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = new URL('../public/', import.meta.url);
const swPath = new URL('sw.js', root);
const TEXT = /\.(html|js|mjs|css|json|svg|txt|webmanifest)$/i;

/** The PRECACHE paths, read from between the markers in sw.js. */
export function precacheList(sw = readFileSync(swPath, 'utf8')) {
  const block = /BEGIN PRECACHE[\s\S]*?\[([\s\S]*?)\];[\s\S]*?END PRECACHE/.exec(sw);
  if (!block) throw new Error('PRECACHE markers not found in public/sw.js');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** 'sm-' + the first 12 hex of a SHA-256 over every precached file, in list order. */
export function computeVersion(list = precacheList()) {
  const h = createHash('sha256');
  for (const p of list) {
    const file = p === '/' ? 'index.html' : p.replace(/^\//, '');
    let buf = readFileSync(new URL(file, root));
    if (TEXT.test(file)) buf = Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
    h.update(p).update('\0').update(buf).update('\0');
  }
  return 'sm-' + h.digest('hex').slice(0, 12);
}

// ── Versioned assets (17 Nov 2026) ──
// A page is network-first but its scripts are served from the shell cache, so
// a new index.html could run with the previous i18n.js until the background
// refresh landed (raw keys on screen). Every page now asks for these files as
// /name?v=<hash of the file>, and sw.js answers a ?v= request only from an
// EXACT cache match, else the network: the page and its scripts update
// together. This script writes the hashes; tests/sw-version.test.js checks them.
export const VERSIONED = ['theme.css', 'pwa.js', 'club_names.js', 'i18n.js', 'home-band.js', 'news-card.js', 'sm_auth.js', 'leagues_data.js'];
const PAGES = ['index.html', 'about.html', 'community.html', 'auth.html', 'privacy.html', 'terms.html', 'news.html', 'offline.html'];

/** The first 10 hex of a SHA-256 over the file, line endings normalised. */
export function assetHash(name) {
  const text = readFileSync(new URL(name, root), 'utf8').replace(/\r\n/g, '\n');
  return createHash('sha256').update(text).digest('hex').slice(0, 10);
}
const refRe = (name) => new RegExp('((?:src|href)="/' + name.replace(/\./g, '\\.') + ')(?:\\?v=[0-9a-f]+)?"', 'g');

/** Rewrite every page's references to the versioned assets. Returns the pages changed. */
export function stampAssets() {
  const hashes = Object.fromEntries(VERSIONED.map((n) => [n, assetHash(n)]));
  const changed = [];
  for (const page of PAGES) {
    const url = new URL(page, root);
    let html;
    try { html = readFileSync(url, 'utf8'); } catch (e) { continue; }
    let out = html;
    for (const n of VERSIONED) out = out.replace(refRe(n), `$1?v=${hashes[n]}"`);
    if (out !== html) { writeFileSync(url, out); changed.push(page); }
  }
  return changed;
}

/** Every reference whose ?v= is missing or stale: [{page, name, found}]. */
export function staleStamps() {
  const bad = [];
  for (const page of PAGES) {
    let html;
    try { html = readFileSync(new URL(page, root), 'utf8'); } catch (e) { continue; }
    for (const n of VERSIONED) {
      const want = assetHash(n);
      for (const m of html.matchAll(new RegExp('(?:src|href)="/' + n.replace(/\./g, '\\.') + '(\\?v=([0-9a-f]+))?"', 'g'))) {
        if (m[2] !== want) bad.push({ page, name: n, found: m[1] || '(none)' });
      }
    }
  }
  return bad;
}

/** The VERSION currently written in sw.js. */
export function storedVersion(sw = readFileSync(swPath, 'utf8')) {
  const m = /const VERSION = '([^']+)';/.exec(sw);
  if (!m) throw new Error('const VERSION line not found in public/sw.js');
  return m[1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Stamp the pages first: they are precached, so their new text is part of VERSION.
  const stamped = stampAssets();
  if (stamped.length) console.log(`asset versions stamped in ${stamped.join(', ')}`);
  const sw = readFileSync(swPath, 'utf8');
  const before = storedVersion(sw);
  const after = computeVersion(precacheList(sw));
  if (before === after) {
    console.log(`sw.js VERSION already current: ${after}`);
  } else {
    writeFileSync(swPath, sw.replace(`const VERSION = '${before}';`, `const VERSION = '${after}';`));
    console.log(`sw.js VERSION ${before} -> ${after}`);
  }
}
