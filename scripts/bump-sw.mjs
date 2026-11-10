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

/** The VERSION currently written in sw.js. */
export function storedVersion(sw = readFileSync(swPath, 'utf8')) {
  const m = /const VERSION = '([^']+)';/.exec(sw);
  if (!m) throw new Error('const VERSION line not found in public/sw.js');
  return m[1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
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
