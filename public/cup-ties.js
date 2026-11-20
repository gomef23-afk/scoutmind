// Cup rounds and knockout ties (C-1, 22 Nov 2026).
//
// API-Football has no tie object: a two-legged tie is two fixtures in the same
// round with home and away reversed, and each fixture's `winner` is that
// MATCH's (Juventus "won" the second leg 3-2 after extra time while
// Galatasaray won the tie 7-5, UCL 2025-26). So ties and aggregates are built
// here, from the fixtures we hold:
//   - round names: "League Stage - N" (the league phase), then "Round of 32"
//     (the knockout play-off; older seasons: "Knockout Round Play-offs"),
//     "Round of 16", "Quarter-finals", "Semi-finals", "Final";
//   - the aggregate is the goals of both legs, extra time included (the stored
//     score already includes it); a level aggregate goes to the penalties of
//     the last leg (pen_home / pen_away, migration 039); there are no away
//     goals any more;
//   - the final is one match at a neutral venue: home and away are nominal.
// Pure: no DOM, no network. Precached (rule 24). Pinned by tests/cups.test.js
// on the real UCL 2025-26 knockout fixtures.
(function (root) {
  'use strict';

  var STAGES = ['kpo', 'r16', 'qf', 'sf', 'f'];
  var DONE = ['FT', 'AET', 'PEN'];

  /** 'league' | 'kpo' | 'r16' | 'qf' | 'sf' | 'f' | null (a qualifying round, or unknown). */
  function stage(round) {
    var r = String(round || '');
    if (/^league (stage|phase)\b/i.test(r)) return 'league';
    if (/qualifying/i.test(r) || /^play-?offs?$/i.test(r) || /^playoff round$/i.test(r)) return null;
    if (/round of 32|knockout round play-?offs?/i.test(r)) return 'kpo';
    if (/round of 16|8th finals/i.test(r)) return 'r16';
    if (/quarter-?finals?/i.test(r)) return 'qf';
    if (/semi-?finals?/i.test(r)) return 'sf';
    if (/^final$/i.test(r.trim())) return 'f';
    return null;
  }

  var ms = function (k) { return typeof k === 'number' ? k : Date.parse(k); };
  var num = function (v) { return v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v); };

  /**
   * Ties from a cup's knockout fixtures. Each fixture:
   *   { id, round, kickoff (ms or ISO), status_short, home_id, away_id,
   *     home_goals, away_goals, pen_home, pen_away, venue_name }
   * Returns ties in stage order, then by first kick-off:
   *   { stage, a, b (a = home in the first leg), legs: [fixture…], single,
   *     neutral, aggA, aggB, penA, penB, played (legs finished), done,
   *     winner (a team id, or null while undecided) }
   */
  function build(fixtures) {
    var byKey = {};
    (fixtures || []).forEach(function (f) {
      var st = stage(f.round);
      if (!st || st === 'league' || f.home_id == null || f.away_id == null) return;
      var lo = Math.min(f.home_id, f.away_id), hi = Math.max(f.home_id, f.away_id);
      var k = st + '|' + lo + '|' + hi;
      (byKey[k] = byKey[k] || { stage: st, legs: [] }).legs.push(f);
    });
    var ties = Object.keys(byKey).map(function (k) {
      var t = byKey[k];
      t.legs.sort(function (x, y) { return ms(x.kickoff) - ms(y.kickoff); });
      var first = t.legs[0];
      t.a = first.home_id; t.b = first.away_id;
      t.single = t.stage === 'f';
      t.neutral = t.stage === 'f';
      var aggA = 0, aggB = 0, played = 0;
      t.legs.forEach(function (l) {
        if (DONE.indexOf(l.status_short) < 0) return;
        var h = num(l.home_goals), a = num(l.away_goals);
        if (h == null || a == null) return;
        played++;
        if (l.home_id === t.a) { aggA += h; aggB += a; } else { aggA += a; aggB += h; }
      });
      t.played = played;
      t.aggA = played ? aggA : null; t.aggB = played ? aggB : null;
      var need = t.stage === 'f' ? 1 : 2;
      t.done = played >= need;
      var last = t.legs[t.legs.length - 1];
      var ph = num(last.pen_home), pa = num(last.pen_away);
      t.penA = null; t.penB = null;
      if (t.done && ph != null && pa != null) {
        if (last.home_id === t.a) { t.penA = ph; t.penB = pa; } else { t.penA = pa; t.penB = ph; }
      }
      t.winner = null;
      if (t.done) {
        if (t.aggA !== t.aggB) t.winner = t.aggA > t.aggB ? t.a : t.b;
        else if (t.penA != null && t.penA !== t.penB) t.winner = t.penA > t.penB ? t.a : t.b;
      }
      return t;
    });
    ties.sort(function (x, y) { return (STAGES.indexOf(x.stage) - STAGES.indexOf(y.stage)) || (ms(x.legs[0].kickoff) - ms(y.legs[0].kickoff)); });
    return ties;
  }

  var api = { stage: stage, build: build, STAGES: STAGES };
  root.CupTies = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
