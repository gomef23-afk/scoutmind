/* Home band — the three slot rules of design spec v1.2 §4, as pure functions,
 * and (since the landing page) the band's HTML, shared by Home and welcome.html.
 *
 * No DOM, no network, no clock of its own: index.html gathers the data and
 * paints; tests/home-band.test.js runs every state in the spec's table. Every
 * function returns i18n keys + values the caller gave it, so a slot can never
 * show a number that was not in its input ("nothing fake", spec §8).
 *
 * A slot is { label:{key,vars}, big:{kind,...}, line:{key,vars}|null, tone }
 * or null (hidden: the other slots widen). big.kind is one of
 *   'ord'       big.n            a table position, printed with tOrd()
 *   'time'      big.at           a kick-off instant, printed in local time
 *   'score'     big.home,big.away
 *   'countdown' big.at           a deadline, printed as 1d 04h / 3h 12m / 12m (gold)
 *   'points'    big.n            Scout points
 *   'dash'                       nothing true to say yet
 */
(function (root) {
  'use strict';

  var LIVE = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT'];
  var DONE = ['FT', 'AET', 'PEN'];
  var DAY = 86400000;

  function sameLocalDay(a, b) {
    var x = new Date(a), y = new Date(b);
    return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
  }
  function num(v) { return v == null || v === '' || isNaN(Number(v)) ? null : Number(v); }

  /**
   * Slot 1, TABLE. form = match_form(): { rank, points } for the club's league
   * and season (a league split into groups gives the rank within the group).
   * No rank → null: the slot is hidden.
   */
  function tableSlot(form) {
    var rank = form ? num(form.rank) : null;
    if (rank == null) return null;
    var pts = num(form.points);
    return {
      label: { key: 'hb.table' },
      big: { kind: 'ord', n: rank },
      line: pts == null ? null : { key: 'hb.pts', vars: { n: pts } },
      tone: 'normal'
    };
  }

  /**
   * Slot 2, MATCH. fixtures: the club's fixtures, any order, each
   * { id, kickoff (ms), status_short, elapsed, home_id, away_id, home_goals,
   *   away_goals, opponent, comp }. Live beats finished-today beats next.
   * comp (C-1): the competition's name when it is not the club's own league
   * ("Champions League · UEFA"); the slot carries it and its label names it.
   */
  function matchSlot(clubId, fixtures, now) {
    var s = matchSlotOf(clubId, fixtures, now);
    if (s.comp === undefined) s.comp = null;
    return s;
  }
  function matchSlotOf(clubId, fixtures, now) {
    var list = (fixtures || []).filter(function (f) { return f && (f.home_id === clubId || f.away_id === clubId); })
      .slice().sort(function (a, b) { return a.kickoff - b.kickoff; });
    var live = list.filter(function (f) { return LIVE.indexOf(f.status_short) >= 0; })[0];
    if (live) {
      return {
        label: { key: 'hb.live', vars: { m: num(live.elapsed) } },
        big: score(live),
        line: { key: 'hb.vs', vars: { opp: live.opponent } },
        tone: 'live', fixtureId: live.id, comp: live.comp || null
      };
    }
    var ft = list.filter(function (f) { return DONE.indexOf(f.status_short) >= 0 && sameLocalDay(f.kickoff, now); }).pop();
    if (ft) {
      return {
        label: { key: 'hb.ft' },
        big: score(ft),
        line: { key: 'hb.vs', vars: { opp: ft.opponent } },
        tone: 'normal', fixtureId: ft.id, comp: ft.comp || null
      };
    }
    var next = list.filter(function (f) { return f.kickoff > now && LIVE.indexOf(f.status_short) < 0 && DONE.indexOf(f.status_short) < 0
      && ['PST', 'CANC', 'ABD', 'AWD', 'WO', 'SUSP'].indexOf(f.status_short) < 0; })[0];
    if (next) {
      return {
        label: { key: 'hb.next' },
        big: { kind: 'time', at: next.kickoff },
        line: { key: 'hb.dayVs', vars: { at: next.kickoff, opp: next.opponent } },
        tone: 'normal', fixtureId: next.id, comp: next.comp || null
      };
    }
    return { label: { key: 'hb.next' }, big: { kind: 'dash' }, line: { key: 'hb.noMatch' }, tone: 'normal' };
  }
  function score(f) {
    var h = num(f.home_goals), a = num(f.away_goals);
    return h == null || a == null ? { kind: 'dash' } : { kind: 'score', home: h, away: a };
  }

  /**
   * Which Scout Game round the band is about. rounds: game_rounds rows
   * ({ id, league_slug, status, deadline_utc }); entered: Set of round ids I
   * have an entry for; inPlay: Set of locked round ids with a match still to
   * play (null = could not tell, treat locked as in play).
   *
   * An open round closing within 24 h comes first (the next thing to do), then
   * a round in play that I entered (points arriving), then the soonest open
   * round, then a round in play, then the latest final round of the last two
   * days. leagueSlug null = any league (no club chosen).
   */
  function pickRound(rounds, leagueSlug, entered, inPlay, now) {
    var rs = (rounds || []).filter(function (r) { return !leagueSlug || r.league_slug === leagueSlug; });
    var open = rs.filter(function (r) { return r.status === 'open' && new Date(r.deadline_utc).getTime() > now; })
      .sort(function (a, b) { return new Date(a.deadline_utc) - new Date(b.deadline_utc); });
    var playing = rs.filter(function (r) { return r.status === 'locked' && (!inPlay || inPlay.has(r.id)); });
    var has = function (r) { return !!(entered && entered.has(r.id)); };
    if (open[0] && new Date(open[0].deadline_utc).getTime() - now <= DAY) return open[0];
    var mineLive = playing.filter(has)[0];
    if (mineLive) return mineLive;
    if (open[0]) return open[0];
    if (playing[0]) return playing[0];
    var fin = rs.filter(function (r) { return r.status === 'final' && now - new Date(r.closes_utc || r.deadline_utc).getTime() <= 2 * DAY; })
      .sort(function (a, b) { return new Date(b.deadline_utc) - new Date(a.deadline_utc); });
    return fin[0] || null;
  }

  /**
   * The round the band shows for a club: its own league's (pickRound), or,
   * when its league has no round at all (a tracked-only league, 035, or a
   * playable league between seasons), the next round of any playable
   * competition, marked foreign so the slot names that competition.
   * Returns { round, foreign }.
   */
  function bandRound(rounds, leagueSlug, entered, inPlay, now) {
    var own = leagueSlug && (rounds || []).some(function (r) { return r.league_slug === leagueSlug; });
    var round = pickRound(rounds, own ? leagueSlug : null, entered, inPlay, now);
    return { round: round, foreign: !!(round && leagueSlug && round.league_slug !== leagueSlug) };
  }

  /**
   * Slot 3, ROUND. round: the picked round or null; me: { entered, compRank,
   * roundTotal, roundRank } (any may be null); league: the competition's name;
   * opts.foreign: the round is another competition's (bandRound), so an open
   * round I have not entered names it ("No picks yet · Série A · BRA").
   */
  function roundSlot(round, me, league, opts) {
    me = me || {};
    var foreign = !!(opts && opts.foreign);
    if (!round) return { label: { key: 'hb.nextRound' }, big: { kind: 'dash' }, line: { key: 'hb.noRound' }, tone: 'normal' };
    var n = round.round_no != null ? round.round_no : (round.round_label || '');
    var rank = function (r) { return num(r) == null ? (league ? { key: 'hb.inLeagueName', vars: { league: league } } : null)
      : { key: 'hb.rankIn', vars: { n: num(r), league: league || '' } }; };
    if (round.status === 'open') {
      return {
        label: { key: 'hb.roundCloses', vars: { n: n } },
        big: { kind: 'countdown', at: new Date(round.deadline_utc).getTime() },
        line: me.entered ? rank(me.compRank) : (foreign && league ? { key: 'hb.noPicksIn', vars: { league: league } } : { key: 'hb.noPicks' }),
        tone: 'gold', roundId: round.id
      };
    }
    var total = num(me.roundTotal);
    if (round.status === 'locked') {
      return {
        label: { key: 'hb.roundLive', vars: { n: n } },
        big: total == null ? { kind: 'dash' } : { kind: 'points', n: total },
        line: !me.entered ? (league ? { key: 'hb.inLeagueName', vars: { league: league } } : null)
          : total == null ? { key: 'hb.ptsAfterFT' } : rank(me.roundRank),
        tone: 'normal', roundId: round.id
      };
    }
    return {
      label: { key: 'hb.round', vars: { n: n } },
      big: total == null ? { kind: 'dash' } : { kind: 'points', n: total },
      line: me.entered ? rank(me.roundRank) : (league ? { key: 'hb.inLeagueName', vars: { league: league } } : null),
      tone: 'normal', roundId: round.id
    };
  }

  /**
   * The picks row under the band, for the same round as slot 3.
   * entry: { picks:[{slot,is_captain,name,photo_url}] } or null.
   * Returns null when there is nothing to show (no round, or a round I cannot
   * enter any more and did not enter).
   */
  function picksRow(round, entry) {
    if (!round) return null;
    var picks = entry && entry.picks ? entry.picks.slice().sort(function (a, b) { return a.slot - b.slot; }) : [];
    if (round.status === 'open') {
      if (picks.length < 5) return { state: 'none', roundId: round.id, deadline: new Date(round.deadline_utc).getTime(), picks: picks };
      var cap = picks.filter(function (p) { return p.is_captain; })[0] || null;
      return { state: 'in', roundId: round.id, picks: picks, captain: cap ? cap.name : null };
    }
    if (!picks.length) return null;
    var c = picks.filter(function (p) { return p.is_captain; })[0] || null;
    return { state: 'locked', roundId: round.id, picks: picks, captain: c ? c.name : null };
  }

  /** "1d 04h" / "3h 12m" / "12m" / "0m", from a deadline in ms. */
  function countdownText(at, now) {
    var ms = Math.max(0, at - now), m = Math.floor(ms / 60000);
    var d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    var two = function (x) { return (x < 10 ? '0' : '') + x; };
    if (d) return d + 'd ' + two(h) + 'h';
    if (h) return h + 'h ' + two(mm) + 'm';
    return mm + 'm';
  }

  /** Last five, oldest first (match_form() gives newest first). */
  function formChips(form) {
    var l = form && Array.isArray(form.last5) ? form.last5 : [];
    return l.filter(function (x) { return x && /^[WDL]$/.test(x.result); }).slice(0, 5).reverse()
      .map(function (x) { return { r: x.result, score: x.score || '', opponent: x.opponent || '', home: !!x.home }; });
  }

  // ── Drawing (landing page commit): the band's HTML, shared by Home
  // (index.html) and the logged-out landing (welcome.html), so they can never
  // drift apart. Still no DOM and no network: each function returns a string
  // from what it is given. ctx is what the page knows:
  //   { t(key, vars), tOrd(n), esc(s), pts(n), locale, now }
  // The styles are .hb-* in theme.css.

  /** A slot's big text, from the kind the slot rules gave it. */
  function bigText(b, ctx) {
    if (!b || b.kind === 'dash') return '—';
    if (b.kind === 'ord') return ctx.tOrd(b.n);
    if (b.kind === 'score') return b.home + '–' + b.away;
    if (b.kind === 'points') return ctx.pts(b.n);
    if (b.kind === 'countdown') return countdownText(b.at, ctx.now);
    if (b.kind === 'time') { try { return new Date(b.at).toLocaleTimeString(ctx.locale || [], { hour: '2-digit', minute: '2-digit' }); } catch (e) { return '—'; } }
    return '—';
  }
  /** A label or line: the key and values, with the day and ordinal filled in. */
  function lineText(x, ctx) {
    if (!x) return '';
    var v = {}, k;
    for (k in (x.vars || {})) v[k] = x.vars[k];
    if (x.key === 'hb.dayVs') {
      v.day = sameLocalDay(v.at, ctx.now) ? ctx.t('hb.today') : new Date(v.at).toLocaleDateString(ctx.locale || [], { weekday: 'short' });
    }
    if (x.key === 'hb.rankIn') v.ord = ctx.tOrd(v.n);
    if (x.key === 'hb.live' && v.m == null) return ctx.t('hb.liveNow');
    return ctx.t(x.key, v);
  }
  /** One slot. act: the onclick JS, or '' for a slot that does not open anything. */
  function slotHtml(s, act, ctx) {
    if (!s) return '';
    var live = s.tone === 'live', gold = s.tone === 'gold', esc = ctx.esc;
    return '<div class="hb-slot"' + (act ? ' role="button" tabindex="0" onclick="' + act + '" onkeydown="if(event.key===\'Enter\'){this.click();}"' : '') + '>'
      // "NEXT · Champions League · UEFA": a match outside the club's league names its competition (C-1).
      + '<div class="hb-lab' + (live ? ' live' : '') + '">' + esc(lineText(s.label, ctx) + (s.comp ? ' · ' + s.comp : '')) + '</div>'
      + '<div class="hb-big' + (gold ? ' gold' : '') + '"' + (s.big && s.big.kind === 'countdown' ? ' data-at="' + s.big.at + '"' : '') + '>' + esc(bigText(s.big, ctx)) + '</div>'
      + (s.line ? '<div class="hb-line">' + esc(lineText(s.line, ctx)) + '</div>' : '')
      + '</div>';
  }
  /** The club row: crest (or its initial), name, the last five as W/D/L chips. club: { label, logo_url }. */
  function clubHtml(club, form, ctx) {
    if (!club) return '';
    var esc = ctx.esc, ini = esc(String(club.label || '?').slice(0, 1));
    var chips = formChips(form);
    return '<div class="hb-crest">' + (club.logo_url
        ? '<img src="' + esc(club.logo_url) + '" alt="" crossorigin="anonymous" referrerpolicy="no-referrer" onerror="this.outerHTML=\'<b>' + ini + '</b>\'">'
        : '<b>' + ini + '</b>') + '</div>'
      + '<div style="min-width:0;"><div class="hb-name">' + esc(club.label) + '</div>'
      + (chips.length ? '<div class="hb-form" role="list" aria-label="' + esc(ctx.t('hb.form')) + '">'
        + chips.map(function (c) {
          return '<span class="hb-chip ' + c.r + '" role="listitem" title="' + esc((c.home ? '' : '@ ') + c.opponent + ' ' + c.score) + '">' + esc(ctx.t('mo.res.' + c.r)) + '</span>';
        }).join('') + '</div>' : '')
      + '</div>';
  }

  var api = { tableSlot: tableSlot, matchSlot: matchSlot, pickRound: pickRound, bandRound: bandRound, roundSlot: roundSlot,
    picksRow: picksRow, countdownText: countdownText, formChips: formChips,
    bigText: bigText, lineText: lineText, slotHtml: slotHtml, clubHtml: clubHtml };
  root.HomeBand = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
