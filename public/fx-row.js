// One fixture as a compact row (Sequence 2 commit 4a, moved here in 4b so the
// club page can use it too): home crest + name, the kick-off time or the score
// in the number face, away name + crest. The Matches tab, Scout's "Matches in
// this round" and the club page's Fixtures & results all draw this row, so
// they can never drift apart. The styles are .fx-* in theme.css.
//
// FxRow.render(o, page)
//   o: { id, homeId, awayId, home?, away?, status ('live'|'finished'|'upcoming'),
//        statusShort?, minute?, homeGoals?, awayGoals?, kickoff (Date|ms|iso),
//        showDay?, mine?, onTap? (JS run on tap instead of opening the match),
//        selected? (a toggle: true / false, shown and announced) }
//   page: what the page knows about clubs and how it escapes text:
//        { crest(id, size) -> html, name(id) -> string, esc(s) -> string,
//          open?(id) -> JS string run on tap (default: openMatch(id)) }
// Strings come from i18n.js (t, smLocale). Precached (rule 24).
(function (root) {
  'use strict';

  /** Fixtures that will not be played as scheduled: no time, no score. */
  const OFF = ['PST', 'CANC', 'ABD', 'SUSP', 'AWD', 'WO'];

  function render(o, page) {
    const t = root.t || ((k) => '');
    const loc = (root.smLocale && root.smLocale()) || [];
    const esc = page.esc;
    const sc = o.homeGoals != null && o.awayGoals != null ? o.homeGoals + '–' + o.awayGoals : '–';
    const k = o.kickoff ? new Date(o.kickoff) : null;
    let big, small = '', live = false;
    if (o.statusShort && OFF.indexOf(o.statusShort) >= 0) {
      big = '—'; small = t('mo.st.' + o.statusShort) || o.statusShort;
    } else if (o.status === 'live') {
      big = sc; live = true;
      small = o.statusShort === 'HT' ? t('mo.ht') : t('mo.live') + (o.minute ? ' ' + o.minute + '\'' : '');
    } else if (o.status === 'finished') {
      big = sc; small = o.statusShort === 'AET' ? t('mo.aet') : o.statusShort === 'PEN' ? t('mo.pens') : t('fx.ft');
    } else {
      big = k ? k.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' }) : '—';
      small = o.showDay && k ? k.toLocaleDateString(loc, { weekday: 'short', day: 'numeric' }) : '';
    }
    const name = (id, fallback) => page.name(id) || fallback || '—';
    const act = o.onTap || (o.id ? (page.open ? page.open(Number(o.id)) : 'openMatch(' + Number(o.id) + ')') : '');
    const tap = act ? ' role="button" tabindex="0" onclick="' + act + '" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();' + act + '}"'
      + (o.selected != null ? ' aria-pressed="' + (o.selected ? 'true' : 'false') + '"' : '') : '';
    return '<div class="fx-row' + (o.mine ? ' mine' : '') + (o.selected ? ' sel' : '') + '"' + tap + '>'
      + '<span class="fx-team">' + page.crest(o.homeId, 20) + '<span>' + esc(name(o.homeId, o.home)) + '</span></span>'
      + '<span class="fx-mid"><b>' + esc(big) + '</b>' + (small ? '<small' + (live ? ' class="live"' : '') + '>' + esc(small) + '</small>' : '') + '</span>'
      + '<span class="fx-team r"><span>' + esc(name(o.awayId, o.away)) + '</span>' + page.crest(o.awayId, 20) + '</span>'
      + '</div>';
  }

  root.FxRow = { render, OFF };
})(typeof window !== 'undefined' ? window : globalThis);
