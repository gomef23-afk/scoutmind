// ScoutMind as an installable app (Day 6). Loaded by every page.
//
// 1. Registers /sw.js (scope /).
// 2. On the app itself (index.html), offers "Add to Home Screen" ONCE, from
//    the second visit on, where it can work:
//      - Chrome / Android: the browser's own install prompt, kept from
//        `beforeinstallprompt` and shown when the banner's button is tapped;
//      - iPhone / iPad Safari: there is no prompt to call, so the banner says
//        how (Share, then "Add to Home Screen").
//    Never when already installed, never on desktop.
//
// A visit = one browser session (sessionStorage). The counter and the "done"
// flag are UI state, so localStorage is fine (CLAUDE.md rule 10). Nothing here
// talks to Supabase.
(function () {
  'use strict';

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .catch(function (e) { console.warn('service worker:', e && e.message); });
    });
  }

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  // Count this visit once per browser session.
  var visits = Number(get('sm_visits') || 0);
  try {
    if (!sessionStorage.getItem('sm_visit_counted')) {
      sessionStorage.setItem('sm_visit_counted', '1');
      visits += 1;
      set('sm_visits', String(visits));
    }
  } catch (e) {}

  var isApp = !!document.getElementById('page-feed');            // index.html only
  var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    || window.navigator.standalone === true;
  var ua = navigator.userAgent || '';
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isMobile = isIOS || /Android/i.test(ua);
  var eligible = isApp && !standalone && isMobile && visits >= 2 && get('sm_a2hs_done') !== '1';

  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();                 // our banner, at the moment we choose
    deferred = e;
    if (eligible) show('android');
  });
  window.addEventListener('appinstalled', function () { set('sm_a2hs_done', '1'); hide(); });

  if (eligible && isIOS) {
    // Safari only: Chrome / Firefox on iOS have their own share menus, and the
    // wording would be wrong there.
    if (!/CriOS|FxiOS|EdgiOS/.test(ua)) window.addEventListener('load', function () { setTimeout(function () { show('ios'); }, 1500); });
  }

  var shown = false;
  function show(kind) {
    if (shown || !eligible) return;
    shown = true;
    set('sm_a2hs_done', '1');           // once: shown counts, whatever happens next
    var css = document.createElement('style');
    css.textContent =
      '.a2hs{position:fixed;left:12px;right:12px;bottom:calc(64px + env(safe-area-inset-bottom));z-index:600;' +
      'display:flex;align-items:center;gap:12px;background:#0d1117;border:1px solid #00e5a0;border-radius:14px;' +
      'padding:12px 12px 12px 14px;box-shadow:0 10px 30px rgba(0,0,0,.55);font-family:\'DM Sans\',sans-serif;color:#edf2f7;}' +
      '.a2hs img{width:40px;height:40px;border-radius:9px;flex-shrink:0;}' +
      '.a2hs-text{flex:1;min-width:0;font-size:13px;line-height:1.45;}' +
      '.a2hs-text b{display:block;font-size:14px;}' +
      '.a2hs-go{min-height:44px;padding:0 16px;border-radius:22px;border:none;background:#00e5a0;color:#000;font-weight:700;font-family:inherit;font-size:13px;cursor:pointer;}' +
      '.a2hs-x{min-width:44px;min-height:44px;border:none;background:transparent;color:#5a6a85;font-size:18px;cursor:pointer;}';
    document.head.appendChild(css);
    var el = document.createElement('div');
    el.className = 'a2hs';
    el.id = 'a2hs';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Install ScoutMind');
    el.innerHTML = '<img src="/apple-touch-icon.png" alt="">' +
      (kind === 'android'
        ? '<div class="a2hs-text"><b>Install ScoutMind</b>Add it to your home screen: it opens full-screen, like an app.</div>' +
          '<button class="a2hs-go" id="a2hs-go">Install</button>'
        : '<div class="a2hs-text"><b>Add ScoutMind to your Home Screen</b>Tap <span aria-label="Share">Share ⬆</span>, then “Add to Home Screen”.</div>') +
      '<button class="a2hs-x" id="a2hs-x" aria-label="Close">✕</button>';
    document.body.appendChild(el);
    document.getElementById('a2hs-x').onclick = hide;
    var go = document.getElementById('a2hs-go');
    if (go) go.onclick = function () {
      if (!deferred) return hide();
      deferred.prompt();
      deferred.userChoice.finally(function () { deferred = null; hide(); });
    };
  }
  function hide() { var el = document.getElementById('a2hs'); if (el) el.remove(); }
})();
