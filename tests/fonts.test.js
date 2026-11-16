// The scoreboard number face (Barlow Condensed, spec §2) really has tabular
// figures, so every countdown, score and points column lines up.
//
//   node tests/fonts.test.js [file.woff2 ...]
//
// Reads each vendored .woff2 with no dependencies: the WOFF2 table directory,
// one Brotli stream (node:zlib), then the GSUB table's FeatureList, looking for
// the 'tnum' feature. Also confirms fonts.css serves the files and that the
// service worker precaches them. With file arguments it only reports on those
// (used to vet a font before it is vendored).

import { readFileSync, existsSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };

const KNOWN = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG',
  'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF',
  'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx',
  'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

/** { tables: Map(tag -> Buffer) } from a .woff2 file. */
export function readWoff2(buf) {
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('not a WOFF2 file');
  const numTables = buf.readUInt16BE(12);
  const compressed = buf.readUInt32BE(20);
  let p = 48;
  const base128 = () => { let v = 0; for (let i = 0; i < 5; i++) { const b = buf[p++]; v = (v << 7) | (b & 0x7f); if (!(b & 0x80)) return v >>> 0; } throw new Error('bad UIntBase128'); };
  const dir = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[p++];
    let tag = KNOWN[flags & 0x3f];
    if ((flags & 0x3f) === 63) { tag = buf.toString('latin1', p, p + 4); p += 4; }
    const version = (flags >> 6) & 3;
    const origLength = base128();
    // glyf/loca are transformed at version 0; every other table at version != 0.
    const transformed = (tag === 'glyf' || tag === 'loca') ? version === 0 : version !== 0;
    const length = transformed ? base128() : origLength;
    dir.push({ tag, length });
  }
  const data = brotliDecompressSync(buf.subarray(p, p + compressed));
  const tables = new Map();
  let off = 0;
  for (const t of dir) { tables.set(t.tag, data.subarray(off, off + t.length)); off += t.length; }
  return { tables };
}

/** The OpenType feature tags in a GSUB table. */
export function gsubFeatures(gsub) {
  if (!gsub) return [];
  const featureList = gsub.readUInt16BE(6);
  const n = gsub.readUInt16BE(featureList);
  const tags = [];
  for (let i = 0; i < n; i++) tags.push(gsub.toString('latin1', featureList + 2 + i * 6, featureList + 6 + i * 6));
  return [...new Set(tags)];
}

const pub = new URL('../public/', import.meta.url);
const args = process.argv.slice(2);

if (args.length) {
  for (const f of args) {
    const { tables } = readWoff2(readFileSync(f));
    const feats = gsubFeatures(tables.get('GSUB'));
    console.log(`${f}\n  tables: ${[...tables.keys()].join(' ')}\n  GSUB features: ${feats.join(' ') || '(no GSUB)'}\n  tnum: ${feats.includes('tnum') ? 'YES' : 'NO'}`);
  }
  process.exit(0);
}

// ── The vendored Barlow Condensed files ──
const css = readFileSync(new URL('vendor/fonts/fonts.css', pub), 'utf8');
const sw = readFileSync(new URL('sw.js', pub), 'utf8');
for (const w of ['600', '700']) {
  for (const sub of ['latin', 'latin-ext']) {
    const name = `barlow-condensed-normal-${w}-${sub}.woff2`;
    const path = new URL('vendor/fonts/' + name, pub);
    check(`${name} is vendored`, existsSync(path));
    if (!existsSync(path)) continue;
    let feats = [];
    try { feats = gsubFeatures(readWoff2(readFileSync(path)).tables.get('GSUB')); } catch (e) { check(`${name} parses`, false, e.message); continue; }
    // The digits 0-9 (U+0030-0039) live in the latin subset only, so that is
    // the file that must carry 'tnum'; latin-ext holds no figures at all.
    if (sub === 'latin') check(`${name} has tabular figures (GSUB 'tnum')`, feats.includes('tnum'), feats.join(' '));
    else check(`${name} parses (no figures in this subset)`, true);
    check(`${name} is served by fonts.css`, css.includes(`/vendor/fonts/${name}`));
    check(`${name} is precached by the service worker`, sw.includes(`'/vendor/fonts/${name}'`));
  }
}
check('fonts.css declares Barlow Condensed 600 and 700',
  /font-family:'Barlow Condensed';font-style:normal;font-weight:600/.test(css) && /font-family:'Barlow Condensed';font-style:normal;font-weight:700/.test(css));

// ── The number face is set with tabular figures where it is used ──
const theme = readFileSync(new URL('theme.css', pub), 'utf8');
check("theme.css names the number face: --font-num is 'Barlow Condensed'", /--font-num:\s*'Barlow Condensed'/.test(theme));
check('theme.css turns tabular figures on for the number face (.num)', /\.num\{[^}]*font-variant-numeric:\s*tabular-nums/.test(theme.replace(/\s+(?=\{)/g, '')));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
