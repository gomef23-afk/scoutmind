/*
 * Round Recap, the words (R-2, 25 Nov 2026).
 *
 * Turns what rpc/round_recap returns (migration 042: the stored facts, names
 * for the fans it mentions, the reader's own lines) into the card's band and
 * its templated sentences. Pure: no DOM, no network. index.html paints what
 * build() returns; tests/round-recap-screens.test.js runs it.
 *
 * The rules (decided 21 Nov 2026):
 *   - Every sentence is an i18n key (recap.*), English and Portuguese.
 *   - A line is built only when every value in it exists: a missing value
 *     drops the line, a section with no line drops, and nothing is filled.
 *   - Points only. Names as the app shows them: players and clubs from our
 *     tables, fans' names in rankings as they set them, and "who picked
 *     him" as first name + initial ("Felipe V."), or "3 fans".
 *   - Ownership is never a number (029): the quiet star says few fans
 *     picked him, nothing more.
 *
 * ctx = { t, tn, tOrd, esc, pts(n), num(n, digits), club(teamId) -> name | null,
 *         tier(tier) -> word, signedIn, deleted -> word for a deleted account }
 */
(function (root) {
  'use strict';

  var FRESH_DAYS = 7;

  function has(v) { return v !== null && v !== undefined && v !== '' && !(typeof v === 'number' && !isFinite(v)); }
  function num(v) { return v === null || v === undefined || v === '' ? NaN : Number(v); }

  /** A round's recap is "fresh" for 7 days after the round turned final. */
  function fresh(finalizedAt, now) {
    var f = Date.parse(finalizedAt || '');
    if (!isFinite(f)) return false;
    var n = typeof now === 'number' ? now : Date.now();
    return n >= f && n - f <= FRESH_DAYS * 86400000;
  }

  /** "Felipe Valois" -> "Felipe V."; one word stays as it is; nothing -> null. */
  function shortName(full) {
    var w = String(full || '').trim().split(/\s+/).filter(Boolean);
    if (!w.length) return null;
    if (w.length === 1) return w[0];
    return w[0] + ' ' + w[w.length - 1].charAt(0).toUpperCase() + '.';
  }

  function build(rec, ctx) {
    var out = { title: null, band: [], sections: [] };
    if (!rec || !rec.data) return out;
    var d = rec.data, names = rec.names || {}, people = d.people || {};
    var t = ctx.t, esc = ctx.esc;

    /** One sentence, or null when any value is missing. */
    function line(key, vars) {
      for (var k in vars) if (!has(vars[k])) return null;
      return t(key, vars);
    }
    /** A player as the app names him, with his club when we know it; escaped. */
    function player(id) {
      var p = people[String(id)];
      if (!p || !has(p.name)) return null;
      var club = has(p.team) ? ctx.club(p.team) : null;
      return esc(p.name) + (has(club) ? ' (' + esc(club) + ')' : '');
    }
    function club(id) { var c = has(id) ? ctx.club(id) : null; return has(c) ? esc(c) : null; }
    function fan(uid) { var n = names[uid]; return has(n) ? esc(n) : esc(ctx.deleted); }
    function pts(v) { return has(v) && isFinite(num(v)) ? ctx.pts(num(v)) : null; }
    function score(r) {
      if (!r || !has(r.hg) || !has(r.ag)) return null;
      var h = club(r.h), a = club(r.a);
      return h && a ? { home: h, away: a, hg: String(r.hg), ag: String(r.ag) } : null;
    }
    function list(top) {
      var items = (top || []).filter(function (x) { return has(x.rank) && pts(x.total) !== null; })
        .map(function (x) { return x.rank + '. ' + fan(x.u) + ' ' + pts(x.total); });
      return items.length ? items.join(' · ') : null;
    }

    out.title = has(rec.round_no) ? t('recap.title', { n: rec.round_no })
      : has(rec.round_label) ? t('recap.titleLabel', { label: esc(rec.round_label) }) : null;

    var m = d.matches || {}, g = d.game || null, pl = d.players || {}, mine = rec.mine || null;

    // ── the band: goals · best pick · your points ──
    if (has(m.goals) && has(m.played)) {
      out.band.push({ lab: t('recap.band.goals'), big: String(m.goals), line: ctx.tn('recap.nMatches', m.played) });
    }
    if (g && g.best_pick && pts(g.best_pick.points) !== null) {
      var bp = people[String(g.best_pick.id)];
      out.band.push({ lab: t('recap.band.best'), big: pts(g.best_pick.points), line: bp && has(bp.name) ? bp.name : '' });
    }
    if (ctx.signedIn && mine) {
      if (pts(mine.total) !== null) {
        out.band.push({ lab: t('recap.band.you'), big: pts(mine.total),
          line: has(mine.rank) && has(mine.participants) ? t('recap.rankOf', { rank: ctx.tOrd(mine.rank), n: mine.participants }) : '' });
      } else {
        out.band.push({ lab: t('recap.band.you'), big: '—', line: t('recap.band.notPlayed') });
      }
    }

    // ── the round ──
    var round = [];
    if (has(m.played) && has(m.goals)) round.push(ctx.tn('recap.nMatches', m.played) + ', ' + ctx.tn('recap.nGoals', m.goals));
    (m.big_wins || []).slice(0, 2).forEach(function (r) {
      var s = score(r);
      if (s) round.push(line('recap.bigWin', s));
    });
    (m.upsets || []).slice(0, 2).forEach(function (u) {
      round.push(line('recap.upset', { winner: club(u.w), wr: has(u.wr) ? ctx.tOrd(u.wr) : null, loser: club(u.l), lr: has(u.lr) ? ctx.tOrd(u.lr) : null }));
    });
    push('recap.sec.round', round);

    // ── the Scout Game ──
    var game = [];
    if (g) {
      if (g.most_picked) game.push(line('recap.mostPicked', { player: player(g.most_picked.id), pts: pts(g.most_picked.base) }));
      if (g.best_pick) {
        var b = g.best_pick, who = null, by = b.by || [];
        if (has(b.fans) && b.fans >= 3) who = ctx.tn('recap.fans', b.fans);
        else if (b.fans === 2 && by.length === 2) who = t('recap.two', { a: shortFan(by[0]), b: shortFan(by[1]) });
        else if (b.fans === 1 && by.length === 1) who = shortFan(by[0]);
        game.push(line('recap.bestPick', { player: player(b.id), pts: pts(b.points), base: pts(b.base),
          mult: has(b.multiplier) ? ctx.num(b.multiplier, 2) : null, who: who }));
      }
      if (g.captains && has(g.captains.of) && g.captains.of > 0 && has(g.captains.delivered)) {
        game.push(g.captains.of >= 20
          ? line('recap.captainsPct', { pct: Math.round(100 * g.captains.delivered / g.captains.of) })
          : ctx.tn('recap.captains', g.captains.delivered, { of: g.captains.of }));
      }
      game.push(line('recap.top3', { list: list(g.top3) }));
    }
    if (d.tiers && d.tiers.best) {
      game.push(line('recap.tier', { tier: esc(ctx.tier(d.tiers.best.tier)), pts: pts(d.tiers.best.mean) }));
    }
    if (mine && mine.leagues) mine.leagues.forEach(function (lg) {
      game.push(line('recap.leagueTop', { league: has(lg.name) ? esc(lg.name) : null, list: list(lg.top3) }));
    });
    push('recap.sec.game', game);

    // ── players ──
    var plays = [];
    if (pl.top_scorers && has(pl.top_scorers.goals)) {
      var ids = (pl.top_scorers.ids || []).map(player).filter(has);
      var goals = ctx.tn('recap.nGoals', pl.top_scorers.goals);
      if (ids.length === 1 && !has(pl.top_scorers.more)) plays.push(line('recap.topScorer', { player: ids[0], goals: goals }));
      else if (ids.length) plays.push(line('recap.topScorers', { goals: goals,
        list: ids.join(', ') + (has(pl.top_scorers.more) ? ' ' + ctx.tn('recap.andMore', pl.top_scorers.more) : '') }));
    }
    if (pl.top_rating) plays.push(line('recap.topRating', { player: player(pl.top_rating.id), rating: has(pl.top_rating.rating) ? ctx.num(pl.top_rating.rating, 1) : null }));
    if (pl.quiet_star) plays.push(line('recap.quietStar', { player: player(pl.quiet_star.id), pts: pts(pl.quiet_star.base) }));
    push('recap.sec.players', plays);

    // ── you ──
    var you = [];
    if (ctx.signedIn && mine) {
      if (has(mine.main_club_id)) {
        var mr = (m.results || []).filter(function (r) { return r.h === mine.main_club_id || r.a === mine.main_club_id; })[0];
        var s = score(mr);
        if (s) you.push(line('recap.yourClub', s));
      }
      if (pts(mine.total) !== null) {
        you.push(line('recap.yourPoints', { pts: pts(mine.total), rank: has(mine.rank) ? ctx.tOrd(mine.rank) : null, n: mine.participants }));
        if (has(mine.season_rank)) {
          you.push(has(mine.season_rank_before)
            ? line('recap.yourSeason', { after: ctx.tOrd(mine.season_rank), before: ctx.tOrd(mine.season_rank_before) })
            : line('recap.yourSeasonNew', { after: ctx.tOrd(mine.season_rank) }));
        }
      } else if (g) {
        you.push(t('recap.notPlayed'));
      }
    }
    push('recap.sec.you', you);

    return out;

    function shortFan(uid) { var n = shortName(names[uid]); return n ? esc(n) : esc(ctx.deleted); }
    function push(key, lines) {
      var ok = lines.filter(has);
      if (ok.length) out.sections.push({ key: key, title: t(key), lines: ok });
    }
  }

  root.RoundRecap = { build: build, fresh: fresh, shortName: shortName, FRESH_DAYS: FRESH_DAYS };
})(typeof window !== 'undefined' ? window : globalThis);
