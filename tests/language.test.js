// Sequence 2 commit 4b-5: the language follows the device until the person
// chooses, and guests can choose from the first screen.
//
//   node tests/language.test.js
//
// - i18n.js run in a sandbox with fake devices: any Portuguese in
//   navigator.languages -> pt-BR, anything else -> en; a saved choice wins;
//   reading never saves; setLang saves, sets <html lang> and repaints the
//   EN / PT switches; <html lang> is set as soon as the file loads;
// - the legal pages apply the device language on load WITHOUT saving it
//   (they used to save it, locking a first visit in), and use the same rule;
// - about.html and offline.html load i18n.js and fill their text; the install
//   hint (pwa.js) speaks both languages by the same rule, on its own;
// - the EN / PT switch is on the sign-up page, in the nav for guests (index,
//   community), on the Home band for guests, and on about.html.
// No dependencies.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const i18nSrc = read('public/i18n.js');

/** i18n.js in a fresh sandbox: a device language list, an optional saved choice. */
function load(languages, saved) {
  const store = new Map(saved ? [['sm_lang', saved]] : []);
  const html = { lang: 'en' };
  const switches = [{ innerHTML: '' }];
  const ctx = {
    navigator: { languages, language: languages[0] },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    document: { documentElement: html, querySelectorAll: (sel) => (sel === '[data-lang-switch]' ? switches : []) },
    console: { warn() {} },
    CustomEvent: function (n, o) { this.type = n; this.detail = o && o.detail; },
    dispatchEvent: () => true,
    Intl,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(i18nSrc, ctx);
  return { ctx, store, html, switches };
}

// ── The device decides until the person chooses ──
eq('a pt-BR device → pt-BR', load(['pt-BR']).ctx.smLang(), 'pt-BR');
eq('pt-PT → pt-BR (any Portuguese)', load(['pt-PT', 'en']).ctx.smLang(), 'pt-BR');
eq('Portuguese second in the list still counts', load(['en-US', 'pt']).ctx.smLang(), 'pt-BR');
eq('an English device → en', load(['en-GB']).ctx.smLang(), 'en');
eq('Spanish, Italian, anything else → en', [load(['es-ES', 'it']).ctx.smLang(), load(['fr-FR']).ctx.smLang()], ['en', 'en']);
eq('no list at all → en', load([]).ctx.smLang(), 'en');
let w = load(['pt-BR'], 'en');
eq('a saved choice wins over the device', w.ctx.smLang(), 'en');
w = load(['pt-BR']);
w.ctx.smLang(); w.ctx.t('nav.home');
check('reading the language never saves it', !w.store.has('sm_lang'));
eq('<html lang> is set as soon as i18n.js loads', w.html.lang, 'pt-BR');
eq('the device\'s strings are used', w.ctx.t('nav.home'), 'Início');
w.ctx.setLang('en');
check('a choice is saved, and the page follows', w.store.get('sm_lang') === 'en' && w.html.lang === 'en' && w.ctx.t('nav.home') === 'Home');
check('the EN / PT switches are repainted with the choice pressed', /data-lang="en" aria-pressed="true"/.test(w.switches[0].innerHTML) && /data-lang="pt-BR" aria-pressed="false"/.test(w.switches[0].innerHTML));
const sw = load(['en']).ctx.langSwitchHtml();
check('the switch: two buttons, labelled in their own language, a named group', /role="group" aria-label="Language"/.test(sw) && /onclick="setLang\('en'\)"[^>]*lang="en"[^>]*>EN</.test(sw) && /onclick="setLang\('pt-BR'\)"[^>]*lang="pt-BR"[^>]*>PT</.test(sw));

// ── The legal pages ──
for (const p of ['terms', 'privacy']) {
  const html = read(`public/${p}.html`);
  const init = (/\(function\(\)\{\s*var q=new URLSearchParams[\s\S]*?\}\)\(\);/.exec(html) || [''])[0];
  check(`${p}: loading applies a language without saving it`, /applyLang\(l\);/.test(init) && !/setLang\(|setItem/.test(init));
  check(`${p}: only a tap saves`, /function setLang\(l\)\{\s*applyLang\(l\);\s*try\{ localStorage\.setItem\('sm_lang',l\); \}catch\(e\)\{\}/.test(html));
  check(`${p}: the device rule is "any Portuguese"`, /\[\]\.concat\(navigator\.languages\|\|\[\],navigator\.language\|\|\[\]\)\.some\(function\(x\)\{ return \/\^pt\/i\.test/.test(init));
  check(`${p}: the nav follows (i18n.js loaded, applied)`, /<script src="\/i18n\.js(\?v=[0-9a-f]+)?"><\/script>/.test(html) && /if\(typeof applyI18n==='function'\) applyI18n\(\);/.test(init));
}

// ── about, offline, the install hint ──
const about = read('public/about.html');
check('about.html loads i18n.js and fills its text', /<script src="\/i18n\.js(\?v=[0-9a-f]+)?"><\/script>/.test(about) && /if \(typeof applyI18n === 'function'\) applyI18n\(\);/.test(about)
  && (about.match(/data-i18n(-html)?="about\./g) || []).length >= 60 && /<title data-i18n="about\.docTitle">/.test(about));
check('about.html: the switch in the nav', /<div class="sm-lang-slot" id="lang-slot" data-lang-switch><\/div>/.test(about));
const off = read('public/offline.html');
check('offline.html loads i18n.js (precached) and fills its text', /<script src="\/i18n\.js(\?v=[0-9a-f]+)?"><\/script>/.test(off) && /applyI18n\(\)/.test(off)
  && ['off.docTitle', 'off.title', 'off.body', 'off.retry'].every((k) => off.includes(`data-i18n="${k}"`)));
check('the service worker precaches i18n.js for the offline page', /'\/i18n\.js'/.test(read('public/sw.js')));
const pwa = read('public/pwa.js');
check('install hint: both languages, its own strings', /pt: \{ label: 'Instalar o ScoutMind'/.test(pwa) && /en: \{ label: 'Install ScoutMind'/.test(pwa) && /var w = WORDS\[lang\(\)\];/.test(pwa));
check('install hint: the same rule (saved, else any Portuguese on the device)', /var saved = get\('sm_lang'\) \|\| get\('sm_legal_lang'\);/.test(pwa)
  && /\[\]\.concat\(navigator\.languages \|\| \[\], navigator\.language \|\| \[\]\)/.test(pwa) && !/set\('sm_lang'/.test(pwa));

// ── The switch from the first screen ──
const idx = read('public/index.html');
const comm = read('public/community.html');
const auth = read('public/auth.html');
check('sign-up page: EN / PT at the top', /<div class="lang-toggle" role="group"[^>]*>\s*<button type="button" data-lang="en" onclick="setLang\('en'\)">EN<\/button>\s*<button type="button" data-lang="pt-BR" onclick="setLang\('pt-BR'\)">PT<\/button>/.test(auth));
check('index nav: the switch, shown to guests', /<div class="sm-lang-slot" id="lang-slot" data-lang-switch style="display:none;"><\/div>/.test(idx) && /if\(langSlot\)langSlot\.style\.display=guest\?'flex':'none';/.test(idx));
check('community nav: the switch, shown to guests', /<div class="sm-lang-slot" id="lang-slot" data-lang-switch style="display:none;"><\/div>/.test(comm) && /if\(langSlot\)langSlot\.style\.display=isGuest\?'flex':'none';/.test(comm));
check('logged-out Home (phone): the switch on the band', /'<span data-lang-switch>'\+langSwitchHtml\(\)\+'<\/span>'/.test(idx));
check('the band row fits 375px (one flex row, slim switch)', /#hb-me\{display:flex;align-items:center;gap:4px;\}/.test(idx) && /\.hb \.lang-switch-b\{min-width:34px;padding:0 6px;\}/.test(idx));
check('switch styles are tokens (theme.css), 44px to the finger', /\.lang-switch-b\{min-width:40px;min-height:44px;/.test(read('public/theme.css')));

// ── Strings ──
const i18n = read('public/i18n.js');
for (const k of ['lang.switch', 'foot.privacy', 'foot.terms', 'foot.contact', 'off.docTitle', 'off.title', 'off.body', 'off.retry', 'about.docTitle', 'about.hero.h1', 'about.faq.a6', 'about.liveBadge']) {
  check(`${k} in both languages`, (i18n.match(new RegExp(`'${k.replace(/\./g, '\\.')}':`, 'g')) || []).length === 2);
}
const aboutKeys = [...new Set([...about.matchAll(/data-i18n(?:-html)?="([\w.]+)"/g)].map((m) => m[1]))];
const missing = aboutKeys.filter((k) => (i18n.match(new RegExp(`'${k.replace(/\./g, '\\.')}':`, 'g')) || []).length !== 2);
check('every key about.html uses exists in both languages', missing.length === 0, missing.join(', '));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
