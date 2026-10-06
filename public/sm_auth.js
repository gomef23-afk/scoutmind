/**
 * sm_auth.js — the one place that knows whether we are signed in.
 *
 * Classic script, not a module: there is no build step, and community.html
 * loads it the same way it loads club_names.js.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * A signed-in user's writes started failing with 401 "permission denied for
 * table profiles" after about an hour, and signing out and back in fixed it.
 * The cause was two sources of truth for "am I signed in":
 *
 *   - `sm_current_user` in localStorage, written once at sign-in and never
 *     given an expiry. The nav, the composer and every requireAuth() gate read
 *     this, so the app went on believing you were signed in forever.
 *   - the Supabase session, which expires after an hour.
 *
 * Once the session lapsed, the token lookup returned null and every request
 * quietly went out with the anon key instead. Nothing was broken enough to
 * notice until a write hit RLS.
 *
 * So: one token source, one refresh, one place that decides the session is
 * gone. A caller never reads a token from storage and never builds an
 * Authorization header by hand.
 *
 * Usage:
 *   SMAuth.init(supabaseClient, { anonKey, url });
 *   const rows = await SMAuth.rest('profiles?select=id').then(r => r.json());
 *   SMAuth.onSignedOut(function(){ ...show the sign-in sheet... });
 */
(function (global) {
  'use strict';

  // Refresh this far ahead of expiry. A minute is not enough: a slow phone
  // network plus a request already in flight can straddle it.
  var SKEW_MS = 120000;
  // How often a tab left open checks. The token lasts an hour, so this is
  // about keeping an idle tab alive, not about catching the exact moment.
  var WATCH_MS = 60000;

  var client = null;
  var cfg = { anonKey: null, url: null };
  var refreshing = null;        // the in-flight refresh promise, shared
  var signedOutCbs = [];
  var mismatchCbs = [];     // fired when the session is a different account
  var watchTimer = null;
  var gaveUp = false;           // stops a dead session retrying forever
  // The signed-in user id AS THE SERVER SEES IT — session.user.id, which is the
  // JWT's subject and the value auth.uid() returns inside every RLS policy.
  //
  // This exists because localStorage's `sm_current_user.id` is a copy, and a
  // copy can be stale. When it was, the app attributed writes to the wrong
  // account: an insert was rejected by `with check (auth.uid() = user_id)` and a
  // delete matched nothing, both while the UI cheerfully showed the change.
  // Anything that decides "is this mine" or stamps a user_id must use this.
  var sessionUid = null;

  function nowMs() { return Date.now(); }

  function init(supabaseClient, options) {
    client = supabaseClient || null;
    options = options || {};
    if (options.anonKey) cfg.anonKey = options.anonKey;
    if (options.url) cfg.url = options.url;
    purgeLegacyKeys();
    var who = uid();
    if (who !== 'guest') claimFor(who);
    startWatch();
    return SMAuth;
  }

  function onSignedOut(cb) {
    if (typeof cb === 'function') signedOutCbs.push(cb);
  }

  function onAccountMismatch(cb) {
    if (typeof cb === 'function') mismatchCbs.push(cb);
  }

  /**
   * The session is gone and cannot be recovered. Callers are told once, and
   * every later token request returns null rather than hammering the refresh
   * endpoint with a refresh token the server has already rejected.
   *
   * ONLY call this when a REFRESH HAS ACTUALLY FAILED. It signs the user out
   * and clears their caches, so calling it on any other signal is destructive.
   *
   * It used to be called from two other places, and that was a regression that
   * made the main club unsaveable: `apiSend` called it on any 401, and a 401 is
   * usually an RLS denial on ONE table, which says nothing about the session.
   * One rejected write — including a fire-and-forget telemetry insert — would
   * sign a perfectly good session out, after which every later write failed
   * with "not signed in" into a console.warn nobody was filtering for.
   */
  function giveUp(reason) {
    if (gaveUp) return;
    gaveUp = true;
    sessionUid = null;
    stopWatch();
    console.warn('SMAuth: session ended —', reason);
    clearAccountCaches();
    try { if (client && client.auth) client.auth.signOut(); } catch (e) {}
    var cbs = signedOutCbs.slice();
    for (var i = 0; i < cbs.length; i++) {
      try { cbs[i](reason); } catch (e) { console.warn('SMAuth callback:', e); }
    }
  }

  async function currentSession() {
    if (!client || !client.auth) return null;
    try {
      var r = await client.auth.getSession();
      var s = (r && r.data && r.data.session) || null;
      if (s && s.user && s.user.id) sessionUid = s.user.id;
      return s;
    } catch (e) {
      return null;
    }
  }

  /** The authoritative user id, once a session has been read. Null for guests. */
  function userId() { return sessionUid; }

  /** Decode a JWT payload. No verification — this is for inspection only. */
  function decodeJwt(token) {
    try {
      var part = String(token).split('.')[1];
      if (!part) return null;
      var b64 = part.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      return JSON.parse(decodeURIComponent(atob(b64).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join('')));
    } catch (e) { return null; }
  }

  /**
   * Who is this page ACTUALLY acting as? Run `await SMAuth.whoami()` in the
   * console.
   *
   * It reads the identity out of the access token itself — the same bytes the
   * server reads to compute auth.uid() — rather than from any cache. That is
   * the point: the nav can say one account while every write lands on another,
   * and only the token settles which is true.
   */
  async function whoami() {
    var s = await currentSession();
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem('sm_current_user') || 'null'); } catch (e) {}
    if (!s) {
      return { signedIn: false, jwt: null, cachedUser: cached,
               warning: cached ? 'Cached user with NO session — every write goes out as anon.' : null };
    }
    var claims = decodeJwt(s.access_token) || {};
    var out = {
      signedIn: true,
      jwtUserId: claims.sub || null,
      jwtEmail: claims.email || null,
      sessionUserId: s.user && s.user.id,
      sessionEmail: s.user && s.user.email,
      cachedUserId: cached && cached.id,
      cachedEmail: cached && cached.email,
      expiresAt: s.expires_at ? new Date(s.expires_at * 1000).toISOString() : null
    };
    // The whole point of this helper.
    out.match = out.jwtUserId === out.cachedUserId;
    if (!out.match) {
      out.warning = 'MISMATCH — the page is acting as ' + out.jwtEmail
        + ' while showing ' + out.cachedEmail
        + '. Every write lands on ' + out.jwtEmail + '.';
    }
    return out;
  }

  /**
   * Read the session and reconcile localStorage against it.
   *
   * Returns the authoritative user id, or null. Call this before anything that
   * writes a user_id or decides whether a row is yours.
   */
  async function resolveUser() {
    var s = await currentSession();
    if (!s || !s.user) return null;
    var stored = null;
    try {
      var cu = JSON.parse(localStorage.getItem('sm_current_user') || 'null');
      stored = (cu && cu.id) || null;
    } catch (e) {}
    if (stored && stored !== s.user.id) {
      // The cached account and the live session are DIFFERENT PEOPLE.
      //
      // This used to overwrite the cached id with the session's and carry on —
      // which papered over exactly the bug it should have shouted about: the
      // nav kept showing one account's name while every write went to the
      // other's rows, with full permission, because the token really was
      // theirs. Writes landed on the wrong account and nothing said so.
      //
      // The session wins, because the session is what the server obeys. But
      // the cached record is replaced WHOLESALE from the session rather than
      // patched, so no part of the other account's identity survives, and it
      // is reported as an error.
      console.error('SMAuth: session belongs to', s.user.email || s.user.id,
                    'but this browser cached', stored,
                    '— the cached account has been dropped. Run SMAuth.whoami().');
      claimFor(s.user.id);
      try {
        localStorage.setItem('sm_current_user', JSON.stringify({
          id: s.user.id,
          email: s.user.email || null,
          name: (s.user.user_metadata && s.user.user_metadata.name)
                || (s.user.email ? s.user.email.split('@')[0] : 'User'),
          plan: 'fan'      // re-read from profiles by the app on load
        }));
      } catch (e) {}
      var cbs = mismatchCbs.slice();
      for (var i = 0; i < cbs.length; i++) {
        try { cbs[i](s.user.email || s.user.id); } catch (e) {}
      }
    }
    return s.user.id;
  }

  /**
   * One refresh at a time. Without this, a page that fires six requests at boot
   * would start six refreshes; Supabase rotates the refresh token on use, so
   * five of them would present a token that has just been replaced and fail —
   * turning a recoverable expiry into a forced sign-out.
   */
  function refresh() {
    if (refreshing) return refreshing;
    refreshing = (async function () {
      try {
        var r = await client.auth.refreshSession();
        if (r && r.error) throw new Error(r.error.message || 'refresh failed');
        var s = (r && r.data && r.data.session) || null;
        if (!s || !s.access_token) throw new Error('refresh returned no session');
        return s;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  function expiringSoon(session) {
    if (!session) return false;
    // expires_at is unix SECONDS. Treating it as milliseconds would put every
    // token half a century in the past and refresh on every single call.
    var expMs = session.expires_at ? session.expires_at * 1000 : 0;
    if (!expMs) return false;
    return expMs - nowMs() < SKEW_MS;
  }

  /**
   * A usable access token, or null when nobody is signed in.
   * `force` refreshes even if the stored token still looks valid — used after a
   * 401, where the server has told us the token is not acceptable whatever its
   * expiry claims.
   */
  async function token(force) {
    if (gaveUp) return null;
    var session = await currentSession();
    if (!session) return null;              // a guest, which is normal
    if (!force && !expiringSoon(session)) return session.access_token;
    try {
      var fresh = await refresh();
      return fresh.access_token;
    } catch (e) {
      giveUp(e.message);
      return null;
    }
  }

  /** Headers for a PostgREST call. Falls back to the anon key when signed out. */
  async function headers(extra) {
    var tok = await token(false);
    var h = { apikey: cfg.anonKey, Authorization: 'Bearer ' + (tok || cfg.anonKey) };
    if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) h[k] = extra[k];
    return h;
  }

  /** True when there is a live session right now. */
  async function isSignedIn() {
    return Boolean(await token(false));
  }

  /**
   * PostgREST fetch with one retry.
   *
   * A 401 or 403 on a request we sent WITH a user token means the token was
   * rejected, so the retry forces a refresh first. A 401 on a request sent with
   * the anon key means the user is not signed in, and retrying would only
   * produce the same answer — so it is returned as-is for the caller to handle.
   */
  async function rest(path, init) {
    init = init || {};
    var tok = await token(false);
    var send = function (bearer) {
      var h = { apikey: cfg.anonKey, Authorization: 'Bearer ' + bearer };
      if (init.headers) for (var k in init.headers) if (init.headers.hasOwnProperty(k)) h[k] = init.headers[k];
      return fetch(cfg.url + '/rest/v1/' + path, {
        method: init.method || 'GET',
        headers: h,
        body: init.body
      });
    };
    var res = await send(tok || cfg.anonKey);
    if ((res.status === 401 || res.status === 403) && tok) {
      var fresh = await token(true);
      if (fresh && fresh !== tok) res = await send(fresh);
    }
    return res;
  }

  /** Keep an idle tab's session alive so the first write after lunch works. */
  function startWatch() {
    stopWatch();
    watchTimer = setInterval(async function () {
      if (gaveUp) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      var s = await currentSession();
      if (s && expiringSoon(s)) {
        try { await refresh(); } catch (e) { giveUp(e.message); }
      }
    }, WATCH_MS);
  }

  function stopWatch() {
    if (watchTimer) { clearInterval(watchTimer); watchTimer = null; }
  }

  // ── PER-USER CACHE KEYS ──────────────────────────────────────────────────
  // Every cached club, follow and language choice used to live under one
  // unkeyed name, so signing in as a second account on the same browser
  // inherited the first account's clubs — and because the one-time
  // localStorage import only checks `onboarded_at`, it wrote them onto the new
  // account for real.
  //
  // Keys are scoped by user id now. A guest gets ':guest', which is a genuine
  // scope rather than a fallback: a guest's picks should survive until they
  // sign in, and must not leak into whichever account signs in next.

  var SCOPED = ['sm_main_club', 'sm_following_clubs', 'sm_content_langs', 'sm_club_selected'];

  // Cache keys prefer the session's id and fall back to the cached one, which
  // is all that is available in the synchronous render path before the first
  // session read resolves. resolveUser() clears the other account's keys the
  // moment it finds a mismatch, so the fallback cannot outlive the truth.
  function uid() {
    if (sessionUid) return sessionUid;
    try {
      var cu = JSON.parse(localStorage.getItem('sm_current_user') || 'null');
      return (cu && cu.id) || 'guest';
    } catch (e) { return 'guest'; }
  }

  function key(name, forUid) {
    return name + ':' + (forUid || uid());
  }

  function getJSON(name, fallback) {
    try {
      var raw = localStorage.getItem(key(name));
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  function setJSON(name, value) {
    try { localStorage.setItem(key(name), JSON.stringify(value)); } catch (e) {}
  }

  function remove(name) {
    try { localStorage.removeItem(key(name)); } catch (e) {}
  }

  /**
   * Wipe every scoped cache for every account on this browser, plus the
   * unkeyed legacy names. Called on sign-out and when a session ends: a shared
   * computer must not hand the next person the last person's clubs.
   */
  function clearAccountCaches() {
    try {
      var doomed = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        for (var j = 0; j < SCOPED.length; j++) {
          if (k === SCOPED[j] || k.indexOf(SCOPED[j] + ':') === 0) { doomed.push(k); break; }
        }
        if (k.indexOf('sm_session_logged_') === 0) doomed.push(k);
      }
      for (var d = 0; d < doomed.length; d++) localStorage.removeItem(doomed[d]);
      localStorage.removeItem('sm_current_user');
    } catch (e) {}
  }

  /**
   * Delete the unkeyed legacy names outright.
   *
   * These held pre-package-2 club picks, and importLocalClubs() used to lift
   * them onto whichever account signed in next with a null `onboarded_at`.
   * That is precisely how one account's follows ended up on another's, so the
   * import is gone and the data goes with it. Anyone who had genuine
   * pre-package-2 picks has had them imported at some point since package 2
   * shipped; what is left under these names now is residue.
   *
   * Called from init(), so it happens once per page load whoever is looking.
   */
  function purgeLegacyKeys() {
    try {
      localStorage.removeItem('sm_main_club');
      localStorage.removeItem('sm_following_clubs');
      localStorage.removeItem('sm_content_langs');
      localStorage.removeItem('sm_club_selected');
    } catch (e) {}
  }

  /**
   * Called at sign-in. If the account that owns the caches is not the account
   * signing in, every other account's scoped cache is dropped.
   *
   * Sign-out already clears everything, but sign-out is not guaranteed to have
   * happened: a session can lapse, a tab can be closed mid-session, or someone
   * can sign in from the auth page without ever pressing Sign out.
   */
  function claimFor(userId) {
    if (!userId) return;
    try {
      var doomed = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        for (var j = 0; j < SCOPED.length; j++) {
          if (k.indexOf(SCOPED[j] + ':') === 0 && k !== SCOPED[j] + ':' + userId) {
            doomed.push(k);
            break;
          }
        }
      }
      for (var d = 0; d < doomed.length; d++) localStorage.removeItem(doomed[d]);
    } catch (e) {}
  }

  var SMAuth = {
    init: init,
    token: token,
    headers: headers,
    rest: rest,
    isSignedIn: isSignedIn,
    session: currentSession,
    userId: userId,
    resolveUser: resolveUser,
    onSignedOut: onSignedOut,
    onAccountMismatch: onAccountMismatch,
    whoami: whoami,
    endSession: giveUp,
    uid: uid,
    key: key,
    getJSON: getJSON,
    setJSON: setJSON,
    remove: remove,
    clearAccountCaches: clearAccountCaches,
    claimFor: claimFor
  };

  global.SMAuth = SMAuth;
})(typeof window !== 'undefined' ? window : this);
