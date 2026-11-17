// Every user-visible string in index.html, auth.html and community.html goes
// through i18n.js (Sequence 2 commit 4b-5).
//
//   node tests/i18n-coverage.test.js
//
// Fails when one of these pages shows English that has no pt-BR key:
//  1. HTML text outside <script>/<style>/comments that is not inside an
//     element carrying data-i18n / data-i18n-html;
//  2. placeholder / aria-label / title attributes with words but without
//     data-i18n-ph / data-i18n-aria / data-i18n-title on the same tag;
//  3. string literals in the inline scripts that read as English words
//     (a capitalised word followed by another word, or a lowercase phrase
//     ending in punctuation), once HTML tags and CSS declarations are
//     stripped, unless they are an argument of t(), tn(), console.*, an API
//     call or similar.
// What legitimately stays English is listed below, with the reason. Every key
// those pages use existing in BOTH dictionaries is tests/i18n.test.js's job.
// No dependencies.

import { readFileSync } from 'node:fs';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// ── What stays as it is, and why ──
const ALLOW = new Set([
  // The wordmark (two spans) and the EN / PT switch labels, which name languages.
  'Scout', 'Mind', 'EN', 'PT',
  // Technical: key names, HTTP headers.
  'Escape', 'Content-Type', 'Prefer', 'Bearer ',
  // Proper names: clubs the club picker suggests (matched by name), competitions
  // (COMP_TIER keys, compared with the API's names), languages named in
  // themselves (CONTENT_LANGS, App language).
  'Flamengo', 'Corinthians', 'Palmeiras', 'Botafogo', 'Vasco da Gama', 'Fluminense', 'Internacional', 'Real Madrid',
  'Barcelona', 'Manchester United', 'Manchester City', 'Liverpool', 'Arsenal', 'Bayern', 'Juventus', 'Boca Juniors', 'River Plate',
  'UEFA Champions League', 'Premier League', 'La Liga', 'Bundesliga', 'Serie A', 'Liga Profesional',
  'English', 'Italiano', 'Deutsch',
  // Values compared with what the API / database sends, never shown as such.
  'Own Goal', 'Penalty', 'Invalid login credentials', 'That competition is not in the Scout Game.',
  // A console message for whoever debugs.
  'league_averages unavailable (016 not applied yet?):',
]);

function literals(code, baseLine) {
  const out = [];
  let i = 0, line = baseLine;
  const n = code.length;
  while (i < n) {
    const c = code[i], d = code[i + 1];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && d === '/') { while (i < n && code[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(code[i] === '*' && code[i + 1] === '/')) { if (code[i] === '\n') line++; i++; } i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; let s = ''; const l0 = line, start = i; i++;
      while (i < n && code[i] !== q) {
        if (code[i] === '\\') { s += code[i] + code[i + 1]; i += 2; continue; }
        if (code[i] === '\n') line++;
        s += code[i]; i++;
      }
      i++;
      out.push({ s, line: l0, before: code.slice(Math.max(0, start - 40), start) });
      continue;
    }
    if (c === '/') {   // a regex literal after ( , = : [ ! & | ? { } ; or return
      let j = i - 1; while (j >= 0 && /\s/.test(code[j])) j--;
      if (j < 0 || /[(,=:[!&|?{};]/.test(code[j]) || /return$/.test(code.slice(Math.max(0, j - 5), j + 1))) {
        i++; let inClass = false;
        while (i < n && (code[i] !== '/' || inClass)) { if (code[i] === '\\') i++; else if (code[i] === '[') inClass = true; else if (code[i] === ']') inClass = false; if (code[i] === '\n') break; i++; }
        i++; continue;
      }
    }
    i++;
  }
  return out;
}
const visible = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\b[a-z-]+:[^;'"]*;?/g, ' ').replace(/\\n/g, ' ');
const looksText = (x) => /\b[A-Z][a-z']+(?:[ ’'-]+[A-Za-z’']+)+/.test(x) || /\b[a-z]{2,} [a-z]{2,}[ a-z]*[.!?…]/.test(x) || /^\s*[A-Z][a-z]{2,}[.…!?]?\s*$/.test(x);
const SKIP_BEFORE = /(console\.\w+\(|\bt\(|\btn\(|tServer\(|new Error\(|apiGet\(|apiSend\(|sgRpc\(|querySelector(All)?\(|getElementById\(|addEventListener\(|classList\.\w+\(|localStorage\.\w+\(|setAttribute\('(?:data|class|id|role|type)[^']*',\s*|toLocale\w*String\()\s*$/;

function scan(file) {
  const html = read(file);
  const js = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    const baseLine = html.slice(0, m.index).split('\n').length;
    for (const x of literals(m[1], baseLine)) {
      if (ALLOW.has(x.s)) continue;
      if (!looksText(visible(x.s))) continue;
      if (SKIP_BEFORE.test(x.before)) continue;
      if (/^https?:|^\/|select=|^[\w.-]+\?|PGRST|^\w+(\.\w+)+$/.test(x.s)) continue;
      js.push(`line ${x.line}: ${JSON.stringify(x.s.slice(0, 80))}`);
    }
  }
  const bare = html.replace(/<script[\s\S]*?<\/script>/g, (s) => s.replace(/[^\n]/g, ' '))
    .replace(/<style[\s\S]*?<\/style>/g, (s) => s.replace(/[^\n]/g, ' '))
    .replace(/<!--[\s\S]*?-->/g, (s) => s.replace(/[^\n]/g, ' '))
    .replace(/<!DOCTYPE[^>]*>/i, '');
  const stack = [];
  const text = [];
  const VOID = new Set(['br', 'img', 'input', 'meta', 'link', 'hr', 'source', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon']);
  const tagRe = /<\/?([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g;
  let t;
  while ((t = tagRe.exec(bare))) {
    const lineNo = () => bare.slice(0, t.index).split('\n').length;
    if (t[3] !== undefined) {
      const txt = t[3].replace(/&[a-z#0-9]+;/gi, ' ').trim();
      if (/[A-Za-z]{2,}/.test(txt) && !ALLOW.has(txt) && !stack.some((e) => e.i18n)) text.push(`line ${lineNo()}: ${txt.slice(0, 70)}`);
      continue;
    }
    const name = t[1].toLowerCase(), attrs = t[2] || '';
    if (t[0][1] === '/') { while (stack.length && stack.pop().name !== name); continue; }
    for (const [a, need] of [['placeholder', 'data-i18n-ph'], ['aria-label', 'data-i18n-aria'], ['title', 'data-i18n-title']]) {
      const v = new RegExp(`\\s${a}="([^"]*)"`).exec(attrs);
      if (v && /[A-Za-z]{2,}/.test(v[1]) && !attrs.includes(need)) text.push(`line ${lineNo()}: [${a}] ${v[1]}`);
    }
    if (VOID.has(name) || /\/\s*$/.test(attrs)) continue;
    stack.push({ name, i18n: /\sdata-i18n(-html)?="/.test(attrs) });
  }
  return { js, text };
}

for (const file of ['public/index.html', 'public/auth.html', 'public/community.html']) {
  const r = scan(file);
  check(`${file}: every visible HTML text and attribute is marked for translation`, r.text.length === 0, r.text.join('\n      '));
  check(`${file}: no English string literal outside t()`, r.js.length === 0, r.js.join('\n      '));
}

// ── Rendered, not just written: the Home feed in Portuguese ──
// 18 Nov 2026: "Trending · News · For you", the heading, its line and the
// Today / This week chips were reported in English with the app in PT. The
// cause was production serving an older build, but the screen is pinned here
// by RUNNING what draws it: the real renderTrending() with pt-BR selected, and
// every static data-i18n key of the feed bar resolved in pt-BR.
{
  const vm = await import('node:vm');
  const idxSrc = read('public/index.html');
  const fnSrc = (name) => (new RegExp('(?:async )?function ' + name + '\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}').exec(idxSrc) || [''])[0];
  const box = { innerHTML: '' };
  const ctx = {
    navigator: { languages: ['en-US'], language: 'en-US' },
    localStorage: { getItem: (k) => (k === 'sm_lang' ? 'pt-BR' : null), setItem() {} },
    document: { documentElement: {}, querySelectorAll: () => [], getElementById: (id) => (id === 'trending-content' ? box : null) },
    console: { warn() {}, info() {} },
    CustomEvent: function () {}, dispatchEvent: () => true, Intl,
    trendWindow: 'today', trendingItems: () => [], isOffline: () => false, offlineHtml: () => '', paintClubTints() {}, renderFeedItem: () => '',
    sanitize: (s) => String(s == null ? '' : s),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('public/i18n.js'), ctx);
  vm.runInContext(fnSrc('renderTrending') + '\nthis.renderTrending=renderTrending;', ctx);
  ctx.renderTrending();
  const out = box.innerHTML.replace(/<[^>]*>/g, ' ');
  check('Home → Trending rendered in pt-BR: the chips and the empty line in Portuguese', /Hoje/.test(out) && /Esta semana/.test(out) && /Nada de hoje ainda/.test(out), out);
  check('…and no English left in it', !/\b(Today|This week|Nothing|Try)\b/.test(out), out);
  const bar = (/<div class="feed-tabs-bar">([\s\S]*?)<\/div>/.exec(idxSrc) || [])[1] || '';
  const feedKeys = [...bar.matchAll(/data-i18n="([\w.]+)"/g)].map((m) => m[1]).concat(['home.trending.sub']);
  const en = (k) => ctx.I18N.en[k], pt = (k) => ctx.I18N['pt-BR'][k];
  check('Home → the feed tabs, heading and its line exist in pt-BR and differ from English',
    feedKeys.length === 4 && feedKeys.every((k) => pt(k) && pt(k) !== en(k)), feedKeys.map((k) => `${k}=${pt(k)}`).join(', '));
}

// The scanner itself catches what it should (a guard against it going blind).
const probe = literals("el.innerHTML='<div class=\"x\">No matches today.</div>'; const k=t('fx.today'); console.warn('Debug only here');", 1);
check('the scanner flags a plain English literal and skips t() / console', probe.filter((x) => !ALLOW.has(x.s) && looksText(visible(x.s)) && !SKIP_BEFORE.test(x.before)).map((x) => x.s).join('|') === '<div class="x">No matches today.</div>');

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
