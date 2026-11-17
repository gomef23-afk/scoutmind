/* News card rules — design spec v1.2 §4 (lead card, following rows) and §6
 * (the crest tile), as pure functions. Sequence 2 commit 2b.
 *
 * No DOM and no network: index.html paints, and reads crest pixels through a
 * canvas; tests/news-card.test.js runs the rules. The visual slot is the crest
 * tile on every card for now — sources A (publisher images, switched off) and
 * B (images we are entitled to) arrive in commits 6 and 7.
 */
(function (root) {
  'use strict';

  /**
   * The tagger's category -> the label shown (spec v1.2 §6). transfer and
   * contract -> Transfer; rumour -> Rumour (transfer colour); match -> Match;
   * general and anything else -> no label at all.
   */
  var CATS = {
    transfer: { key: 'news.cat.transfer', tone: 'transfer' },
    contract: { key: 'news.cat.transfer', tone: 'transfer' },
    rumor: { key: 'news.cat.rumour', tone: 'transfer' },
    rumour: { key: 'news.cat.rumour', tone: 'transfer' },
    match: { key: 'news.cat.match', tone: 'match' }
  };
  function category(cat) { return CATS[cat] || null; }

  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  /**
   * The tagged clubs in tile order: clubs named in the headline first, in the
   * order the headline names them (the club named first sits on the left), then
   * clubs mentioned only in the summary, in their tag order.
   * item: { title, teams:[{api_team_id,name,label?}], headlineTeamIds:[api ids] }
   */
  function orderTeams(item) {
    var teams = (item && item.teams) || [];
    var head = (item && item.headlineTeamIds) || [];
    var title = norm(item && item.title);
    var pos = function (t) {
      var best = -1;
      [t.label, t.name].forEach(function (n) {
        var i = n ? title.indexOf(norm(n)) : -1;
        if (i >= 0 && (best < 0 || i < best)) best = i;
      });
      return best;
    };
    return teams.map(function (t, i) {
      var inTitle = head.indexOf(t.api_team_id) >= 0;
      var p = pos(t);
      return { t: t, i: i, k: inTitle ? (p >= 0 ? p : 100000) : 1000000 + i };
    }).sort(function (a, b) { return a.k - b.k || a.i - b.i; }).map(function (x) { return x.t; });
  }

  /**
   * The crest tile (spec v1.2 §6):
   *   lead card, any case        -> 'navy'
   *   one club                   -> 'club' (a light tint of the club's colour,
   *                                 read from the crest; 'tint' when unreadable)
   *   two clubs                  -> 'tint', the two crests overlapping
   *   three or more              -> 'tint', the first two overlapping + "+N"
   *   no club                    -> 'tint', the source's name in the number face
   * Returns { bg, crests (0-2 teams), more (N), text (source name or null) }.
   */
  function tile(item, lead) {
    var teams = orderTeams(item);
    var bg = lead ? 'navy' : teams.length === 1 ? 'club' : 'tint';
    return {
      bg: bg,
      crests: teams.slice(0, 2),
      more: Math.max(0, teams.length - 2),
      text: teams.length ? null : String((item && item.source) || '').trim() || null
    };
  }

  /**
   * The club's colour from a crest's pixels (RGBA, e.g. a 32x32 canvas), or
   * null when there is no clear colour: transparent, near-white, near-black and
   * grey pixels are ignored, and the winning colour must cover at least 8% of
   * the crest. Pixels are grouped by hue (12 bands of 30°), so a gradient or an
   * anti-aliased edge stays one colour (Palmeiras' greens, São Paulo's red);
   * the biggest band's average is returned as [r, g, b].
   */
  function hueBand(r, g, b, max, min) {
    var d = max - min, h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
    return Math.floor(((h + 15) % 360) / 30);   // band 0 is centred on red
  }
  function pickColour(px) {
    if (!px || !px.length) return null;
    var buckets = {}, opaque = 0;
    for (var i = 0; i + 3 < px.length; i += 4) {
      var r = px[i], g = px[i + 1], b = px[i + 2], a = px[i + 3];
      if (a < 128) continue;
      opaque++;
      var max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (max < 40) continue;                    // near black
      if (min > 215) continue;                   // near white
      if (max - min < 40) continue;              // grey
      var k = hueBand(r, g, b, max, min);
      var e = buckets[k] || (buckets[k] = { n: 0, r: 0, g: 0, b: 0 });
      e.n++; e.r += r; e.g += g; e.b += b;
    }
    var best = null;
    for (var key in buckets) if (!best || buckets[key].n > best.n) best = buckets[key];
    if (!best || !opaque || best.n / opaque < 0.08) return null;
    return [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)];
  }

  var api = { category: category, orderTeams: orderTeams, tile: tile, pickColour: pickColour };
  root.NewsCard = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
