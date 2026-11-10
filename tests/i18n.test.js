// public/i18n.js: the English and Portuguese dictionaries, and every key the
// pages ask for.
//
//   node tests/i18n.test.js
//
// Checks: both languages have exactly the same keys, none empty, with the same
// {placeholders}; every t('…') / tn('…') / data-i18n* key used in auth.html and
// index.html exists (tn keys need .one and .other); every Scout Game badge and
// breakdown line and every submit_picks() message has a string; no money words
// in either language; and the helpers behave (plurals, ordinals, fallback).
// No dependencies.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const src = read('public/i18n.js');

/** A fresh i18n.js in a sandbox with the given saved language / browser language. */
function load({ saved = null, nav = 'en-US' } = {}) {
  const store = new Map(saved ? [['sm_lang', saved]] : []);
  const ctx = {
    console: { warn() {} },
    Intl,
    navigator: { language: nav },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx;
}

const w = load();
const en = w.I18N.en, pt = w.I18N['pt-BR'];
const enKeys = Object.keys(en), ptKeys = Object.keys(pt);

// ── The dictionaries ──
const onlyEn = enKeys.filter((k) => !(k in pt)), onlyPt = ptKeys.filter((k) => !(k in en));
check('pt-BR has every English key', onlyEn.length === 0, onlyEn.join(', '));
check('pt-BR has no key English lacks', onlyPt.length === 0, onlyPt.join(', '));
const empty = [...enKeys.filter((k) => !String(en[k]).trim()).map((k) => 'en ' + k), ...ptKeys.filter((k) => !String(pt[k]).trim()).map((k) => 'pt ' + k)];
check('no empty string', empty.length === 0, empty.join(', '));
const ph = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const phDiff = enKeys.filter((k) => k in pt && ph(en[k]) !== ph(pt[k]));
check('the same {placeholders} in both languages', phDiff.length === 0, phDiff.map((k) => `${k}: en {${ph(en[k])}} pt {${ph(pt[k])}}`).join('; '));
const untranslated = enKeys.filter((k) => en[k] === pt[k] && /[a-z]{4,}/i.test(en[k])
  && !/^(sg\.title|sg\.tab\.rankings|badge\.top_ten_percent\.name|auth\.ph\.email|sg\.base|pg\.pts|mo\.rankPts|sg\.dur\.dh)$/.test(k));
check('nothing left in English in pt-BR (beyond names that stay)', untranslated.length === 0, untranslated.join(', '));

// ── Money words (CLAUDE.md: no betting language anywhere) ──
const MONEY_EN = /\b(odds|bets?|betting|wager|stake|win money|cash|prize money|jackpot)\b/i;
const MONEY_PT = /\b(apostas?|apostar|aposte|cota[cç](ão|ões)|ganhar dinheiro|ganhe dinheiro|pr[eê]mio em dinheiro|bolão)\b/i;
const moneyHits = [...enKeys.filter((k) => MONEY_EN.test(en[k])).map((k) => 'en ' + k), ...ptKeys.filter((k) => MONEY_PT.test(pt[k]) || MONEY_EN.test(pt[k])).map((k) => 'pt ' + k)];
check('no money words in either language', moneyHits.length === 0, moneyHits.join(', '));

// ── Every key the pages use exists ──
const pages = { 'public/index.html': read('public/index.html'), 'public/auth.html': read('public/auth.html') };
const missing = [];
let used = 0;
for (const [file, html] of Object.entries(pages)) {
  for (const m of html.matchAll(/\bt\(\s*\\?'([a-zA-Z][\w.]*?)\\?'/g)) {
    if (m[1].endsWith('.')) continue;          // t('sg.pos.'+k): a family, checked below
    used++; if (!(m[1] in en)) missing.push(`${file} t('${m[1]}')`);
  }
  for (const m of html.matchAll(/\btn\(\s*'([a-zA-Z][\w.]*?)'/g)) {
    used++;
    if (!(m[1] + '.one' in en) || !(m[1] + '.other' in en)) missing.push(`${file} tn('${m[1]}')`);
  }
  for (const m of html.matchAll(/data-i18n(?:-html|-ph|-aria|-title)?="([^"]+)"/g)) { used++; if (!(m[1] in en)) missing.push(`${file} data-i18n "${m[1]}"`); }
  // t(cond ? 'a' : 'b') and t('prefix.'+x): every quoted key inside a t( … ) call.
  for (const m of html.matchAll(/\bt\(([^()]*\?[^()]*)\)/g)) {
    for (const k of m[1].matchAll(/'((?:sg|mo|pick|onb|auth|pg|sp|team|pref)\.[\w.]+)'/g)) { used++; if (!(k[1] in en)) missing.push(`${file} t(…'${k[1]}'…)`); }
  }
}
check(`every key used by the pages exists (${used} uses)`, missing.length === 0, missing.join('; '));

// Keys built at runtime: position, pick-slot, full-group and status families.
const idx = pages['public/index.html'];
const families = { 'sg.pos.': ['G', 'D', 'M', 'F', 'X'], 'sg.pick.': ['G', 'D', 'X'], 'sg.full.': ['G', 'D', 'X'],
  'sg.rv.': ['round', 'comp', 'overall', 'torcida'], 'mo.st.': ['PST', 'CANC', 'ABD', 'SUSP', 'INT'], 'mo.res.': ['W', 'D', 'L'] };
const famMissing = [];
for (const [pre, ends] of Object.entries(families)) for (const e of ends) if (!(pre + e in en)) famMissing.push(pre + e);
check('every runtime-built key family is complete', famMissing.length === 0, famMissing.join(', '));

const brk = /const SG_BREAKDOWN_KEYS=\[([^\]]+)\]/.exec(idx);
const brkKeys = brk ? [...brk[1].matchAll(/'(\w+)'/g)].map((m) => m[1]) : [];
check('index.html lists the breakdown keys', brkKeys.length >= 19, String(brkKeys.length));
const brkMissing = brkKeys.filter((k) => !('sg.brk.' + k in en));
check('every breakdown line has a label', brkMissing.length === 0, brkMissing.join(', '));
// (That the list matches what basePoints() really writes is pinned by
// tests/scout-game.test.js, which runs the scorer.)

// Badges, from the seed in 017.
const seed = read('supabase/migrations/017_scout_game.sql');
const badgeIds = [...seed.matchAll(/^\s*\('([a-z_]+)',\s*'[^']*(?:''[^']*)*',\s*'/gm)].map((m) => m[1]);
check('017 seeds 8 badges', badgeIds.length === 8, badgeIds.join(', '));
const badgeMissing = badgeIds.filter((id) => !(`badge.${id}.name` in en) || !(`badge.${id}.desc` in en));
check('every badge has a name and a description', badgeMissing.length === 0, badgeMissing.join(', '));

// submit_picks() messages, by exact text, from 023 (current) and 020 (older).
const serverMsgs = new Set();
for (const f of ['supabase/migrations/023_formation_and_history.sql', 'supabase/migrations/020_lineup_rule.sql']) {
  for (const m of read(f).matchAll(/raise exception '((?:[^']|'')+)'/g)) serverMsgs.add(m[1].replace(/''/g, "'"));
}
const unmapped = [...serverMsgs].filter((s) => !(s in w.I18N_SERVER));
check(`every submit_picks message is mapped (${serverMsgs.size})`, unmapped.length === 0, unmapped.join(' | '));
const badTarget = Object.entries(w.I18N_SERVER).filter(([s, k]) => !(k in en) || en[k] !== s);
check('each mapped message is the English string of its key', badTarget.length === 0, badTarget.map((x) => x[1]).join(', '));

// ── The helpers ──
check('English by default for an English browser', w.smLang() === 'en');
const p = load({ nav: 'pt-BR' });
check('Portuguese for a Portuguese browser', p.smLang() === 'pt-BR' && p.t('sg.save') === 'Salvar escalação');
const o = load({ saved: 'en', nav: 'pt-BR' });
check('a saved choice beats the browser', o.smLang() === 'en');
p.setLang('en');
check('setLang saves and switches', p.smLang() === 'en' && p.localStorage.getItem('sm_lang') === 'en');
check('placeholders fill', w.t('sg.closesIn', { t: '2h 5m' }) === 'Picks close in 2h 5m');
check('an unknown key falls back to the key', w.t('no.such.key') === 'no.such.key');
check('English plurals', w.tn('sg.members', 1) === '1 member' && w.tn('sg.members', 12) === '12 members');
const pp = load({ nav: 'pt-BR' });
check('Portuguese plurals', pp.tn('sg.members', 1) === '1 membro' && pp.tn('sg.members', 3) === '3 membros');
check('English ordinals', ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '102nd'].join() === [1, 2, 3, 4, 11, 12, 13, 21, 102].map(w.tOrd).join());
check('Portuguese ordinals', pp.tOrd(4) === '4º');
check('a known server message is translated', pp.tServer('Pick one goalkeeper.') === 'Escolha um goleiro.');
check('an unknown server message is kept as is', pp.tServer('Something new.') === 'Something new.');

console.log(`${enKeys.length} keys per language`);
for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
