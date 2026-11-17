// The design tokens (public/theme.css, design spec v1.2) and how pages use them.
//
//   node tests/theme.test.js
//
// - light (:root) and dark ([data-theme="dark"]) define exactly the same tokens;
// - every text-on-background pair the app uses is >= 4.5:1 in both modes,
//   recomputed from the values in theme.css (spec §1, acceptance §9);
// - the converted pages load theme.css after the no-flash script, which sets
//   data-theme from localStorage sm_theme before the first paint;
// - no literal colour is left in a converted page outside theme.css.
// Prints the contrast table. No dependencies.

import { readFileSync } from 'node:fs';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const css = read('public/theme.css');

/** { name: value } from one CSS block. */
function block(selector) {
  const i = css.indexOf(selector + '{');
  if (i < 0) return {};
  const body = css.slice(i + selector.length + 1, css.indexOf('}', i));
  const out = {};
  for (const m of body.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const light = block(':root');
const dark = { ...light, ...block('[data-theme="dark"]') };
const darkOnly = block('[data-theme="dark"]');

// ── Same tokens in both modes ──
const colourKeys = Object.keys(light).filter((k) => !k.startsWith('font-'));
const missingInDark = colourKeys.filter((k) => !(k in darkOnly));
check('dark redefines every colour token light defines', missingInDark.length === 0, missingInDark.join(', '));
const extraInDark = Object.keys(darkOnly).filter((k) => !(k in light));
check('dark defines no token light lacks', extraInDark.length === 0, extraInDark.join(', '));

// ── The spec v1.2 values ──
const SPEC = {
  light: { navy: '#12304F', ground: '#F6F7F9', card: '#FFFFFF', border: '#E6E9EF', ink: '#13203A', muted: '#677082', tint: '#E6EEF8', gold: '#FFD166',
    win: '#1A8548', loss: '#D7263D', draw: '#6C7689', 'live-on-band': '#E77B89', 'cat-transfer': '#1D4ED8', 'cat-injury': '#D7263D', 'cat-interview': '#0B7C7A', 'cat-match': '#1A8548' },
  dark: { navy: '#16365A', ground: '#0F141B', card: '#1A2029', border: '#2A323E', ink: '#EEF1F5', muted: '#9AA5B5', tint: '#1F2E42', gold: '#FFD166',
    win: '#2FA865', loss: '#E5485D', draw: '#6C7689', 'navy-ink': '#A9C7EA', 'loss-ink': '#E85C6F', 'live-on-band': '#ED8391',
    'chip-win': '#1A8548', 'chip-loss': '#D7263D', 'cat-transfer': '#6A8AE5', 'cat-injury': '#E26373', 'cat-interview': '#419997', 'cat-match': '#489D6D' },
};
for (const mode of ['light', 'dark']) {
  const got = mode === 'light' ? light : dark;
  const off = Object.entries(SPEC[mode]).filter(([k, v]) => String(got[k] || '').toUpperCase() !== v.toUpperCase()).map(([k, v]) => `${k}: ${got[k]} (spec ${v})`);
  check(`${mode} values match the spec's token table (v1.2)`, off.length === 0, off.join('; '));
}

// ── Contrast ──
const hex = (v) => /^#[0-9a-f]{6}$/i.test(v) ? v : null;
const L = (h) => { const c = h.slice(1).match(/../g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// [text token, background token, where it is used]
const PAIRS = [
  ['ink', 'card', 'body text on cards'], ['ink', 'ground', 'body text on the page'], ['ink', 'tint', 'text on an active chip'], ['ink', 'field', 'text in a field'],
  ['muted', 'card', 'secondary text on cards'], ['muted', 'ground', 'secondary text on the page'], ['muted', 'field', 'placeholder in a field'],
  // Not a pair: muted on --tint is 4.26:1 in light. --tint never carries muted
  // text (the club picker's chosen row moved to --card for this reason).
  ['navy-ink', 'card', 'navy text, links, active tab'], ['navy-ink', 'ground', 'navy text on the page'], ['navy-ink', 'tint', 'active chip text'],
  ['navy-ink', 'field', 'the chosen club in the club list'], ['ink', 'border-strong', 'a primary button while it works'],
  ['on-navy', 'navy', 'white on the band / primary button'], ['gold', 'navy', 'countdown, captain C'], ['live-on-band', 'navy', 'LIVE on the band'],
  ['navy', 'on-navy', 'avatar and Sign in on the Home band (navy on white)'],
  ['on-chip', 'chip-win', 'W chip'], ['on-chip', 'chip-loss', 'L chip'], ['on-chip', 'chip-draw', 'D chip'],
  ['loss-ink', 'card', 'LIVE / errors on cards'], ['win', 'card', 'positive text'],
  ['cat-transfer', 'card', 'Transfer / Rumour label'], ['cat-injury', 'card', 'Suspension / Injury label'], ['cat-interview', 'card', 'Interview label'], ['cat-match', 'card', 'Match label'],
];
const table = [];
for (const [fg, bg, use] of PAIRS) {
  const row = [fg, bg, use];
  for (const [mode, t] of [['light', light], ['dark', dark]]) {
    const a = hex(t[fg]), b = hex(t[bg]);
    if (!a || !b) { check(`${mode}: ${fg} on ${bg} has hex values`, false, `${t[fg]} / ${t[bg]}`); row.push('?'); continue; }
    const r = ratio(a, b);
    row.push(r.toFixed(2));
    check(`${mode}: ${fg} on ${bg} >= 4.5:1 (${use})`, r >= 4.5, r.toFixed(2));
  }
  table.push(row);
}

// ── Pages: the no-flash script, then theme.css, then the page's own CSS ──
const CONVERTED = ['public/index.html', 'public/community.html'];   // the static pages join in Sequence 2 commit 4b
for (const page of CONVERTED) {
  const html = read(page);
  const s = html.indexOf("localStorage.getItem('sm_theme')");
  const link = html.indexOf('<link rel="stylesheet" href="/theme.css">');
  const style = html.indexOf('<style>');
  check(`${page}: no-flash script reads sm_theme and sets data-theme`, s > -1 && /setAttribute\('data-theme',t\)/.test(html));
  check(`${page}: script, then theme.css, then the page's <style>`, s > -1 && link > s && style > link, `${s} ${link} ${style}`);
  check(`${page}: a saved choice is one of system | light | dark`, /s==='light'\|\|s==='dark'\|\|s==='system'\?s:DEFAULT/.test(html));
  check(`${page}: "system" follows the device, live`, /prefers-color-scheme: dark/.test(html) && /addEventListener\('change'/.test(html));
  const literals = [...html.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)/g)].map((m) => m[0]).filter((c) => !['#0F141B', '#F6F7F9'].includes(c));
  check(`${page}: no literal colour outside theme.css (theme-color meta values excepted)`, literals.length === 0, [...new Set(literals)].join(' '));
  const oldRoot = /:root\{--bg:var\(--ground\);--bg2:var\(--card\);--bg3:var\(--field\);--accent:var\(--navy-ink\)/.test(html);
  check(`${page}: the old variable names are aliases of the new tokens`, oldRoot);
}
const dflt = /var DEFAULT='(\w+)'/.exec(read('public/index.html'));
check('rollout: no saved choice = dark until commit 4b (then system)', !!dflt && ['dark', 'system'].includes(dflt[1]), dflt && dflt[1]);
const dfltC = /var DEFAULT='(\w+)'/.exec(read('public/community.html'));
check('community.html has the same default as index.html', !!dfltC && !!dflt && dfltC[1] === dflt[1], dfltC && dfltC[1]);
const comm = read('public/community.html');
check('community.html: primary buttons are navy with on-navy text', /\.pfbtn\{background:var\(--navy\);color:var\(--on-navy\)/.test(comm) && /\.signin-btn\{background:var\(--navy\);color:var\(--on-navy\)/.test(comm));
check('community.html: numbers use the number face', /\.sv\{font-family:var\(--font-num\)/.test(comm) && /class="wrank num/.test(comm) && /class="pop num"/.test(comm) && /lg avg <span class="num">/.test(comm));
check('community.html: no Bebas Neue or DM Mono left (neither is self-hosted)', !/Bebas|DM Mono/.test(comm));
check('community.html: muted text never sits on --tint (the chosen club row is --field)', /\.ts-team\.active\{background:var\(--field\)/.test(comm));
check('pwa.js banner uses the tokens (old palette only as fallbacks)', /background:var\(--card,#0d1117\)/.test(read('public/pwa.js')) && /background:var\(--navy,/.test(read('public/pwa.js')));
check('the service worker precaches theme.css', /'\/theme\.css'/.test(read('public/sw.js')));

console.log('contrast (text on background)          light   dark');
for (const [fg, bg, , l, d] of table) console.log(`  ${(fg + ' on ' + bg).padEnd(30)} ${String(l).padStart(6)} ${String(d).padStart(6)}`);
for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
