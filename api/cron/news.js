// Pull RSS feeds into news_items and tag each article to clubs.
//
// Costs ZERO API-Football requests — this job only talks to publishers' feeds
// and to Supabase. Run it every 15 minutes.
//
// Copyright line: we store a headline, a plain-text snippet of at most 300
// characters, and a link. We never fetch the article page, never store the
// body, and never store or hotlink images. Sources marked headline_only get
// no snippet stored at all.

import { withCron } from '../_lib/cron.js';
import { select, upsert, upsertReturning, update } from '../_lib/supabase.js';
import { parseFeed } from '../_lib/rss.js';
import { buildIndex, tagText, clipSummary, normalise } from '../_lib/tagger.js';
import { isFootball } from '../_lib/football-filter.js';

const FETCH_TIMEOUT_MS = 8000;
const WALL_CLOCK_BUDGET_MS = 20000; // rule 16: cron-job.org gives up at 30s
const USER_AGENT = 'ScoutMindBot/1.0 (+https://scoutmind.app)';

// Category markers, matched against normalised (lowercased, unaccented) text.
// Kept deliberately small: a wrong category is a wrong filter result, and
// "general" is a perfectly good answer.
const MARKERS = {
  contract: [
    'renova', 'renovacao', 'renovado', 'contrato', 'renew', 'renewal',
    'new deal', 'extension', 'renovacion', 'renueva', 'rinnovo', 'rinnova',
    'vertrag', 'verlangert', 'prolongation', 'prolonge',
  ],
  transfer: [
    'contrata', 'contratacao', 'reforco', 'anuncia contratacao', 'vendido',
    'venda de', 'e do', 'assina com', 'signs', 'signed', 'joins', 'transfer',
    'completes move', 'fichaje', 'ficha por', 'fichado', 'traspaso',
    'acquisto', 'ufficiale', 'ceduto', 'wechselt', 'verpflichtet', 'neuzugang',
    'transfert', 'signe a', 'recrue',
  ],
  rumor: [
    'sondagem', 'negocia', 'interessado', 'pode reforcar', 'especula',
    'rumour', 'rumor', 'linked with', 'interested in', 'eyeing', 'target',
    'suena', 'sondeo', 'interesa', 'pretende', 'sondaggio', 'interessa a',
    'obiettivo', 'gerucht', 'interessiert', 'piste', 'interesse par',
  ],
  match: [
    'melhores momentos', 'ao vivo', 'tempo real', 'pre jogo', 'escalacao',
    'highlights', 'live', 'match report', 'player ratings', 'preview',
    'minuto a minuto', 'en directo', 'cronica', 'previa', 'alineaciones',
    'pagelle', 'diretta', 'formazioni', 'liveticker', 'spielbericht',
    'noten', 'direct', 'compositions',
  ],
};
// Checked in this order; the first hit wins.
const CATEGORY_ORDER = ['contract', 'transfer', 'rumor', 'match'];

function categorise(title, summary) {
  const text = normalise(`${title} ${summary}`);
  for (const cat of CATEGORY_ORDER) {
    for (const marker of MARKERS[cat]) {
      if (text.includes(marker)) return cat;
    }
  }
  return 'general';
}

async function fetchFeed(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export default withCron('news', async ({ req }) => {
  const started = Date.now();
  const url = new URL(req.url, 'http://localhost');
  const only = url.searchParams.get('source'); // optional: one slug, for debugging

  const [sources, teams, aliasRows] = await Promise.all([
    select(
      'news_sources',
      'select=id,slug,name,url,lang,country,headline_only,exclude_patterns,consecutive_failures&active=is.true&order=slug'
    ),
    select('teams', 'select=id,api_team_id,name,league_id'),
    select('team_aliases', 'select=team_id,alias,kind,langs,short_ok'),
  ]);
  const leagues = await select('leagues', 'select=id,slug');

  // The tagger works in API-Football ids and league slugs; the database works
  // in our own ids. Translate once, here.
  const leagueSlug = new Map(leagues.map((l) => [l.id, l.slug]));
  const ourId = new Map(teams.map((t) => [t.api_team_id, t.id]));
  const apiId = new Map(teams.map((t) => [t.id, t.api_team_id]));
  const index = buildIndex(
    teams.map((t) => ({
      api_team_id: t.api_team_id,
      name: t.name,
      league: leagueSlug.get(t.league_id),
    })),
    aliasRows
      .filter((a) => apiId.has(a.team_id))
      .map((a) => ({
        api_team_id: apiId.get(a.team_id),
        alias: a.alias,
        kind: a.kind || 'o',
        langs: a.langs && a.langs.length ? a.langs : null,
        short_ok: Boolean(a.short_ok),
      }))
  );

  const todo = only ? sources.filter((s) => s.slug === only) : sources;
  const perSource = {};
  let itemsWritten = 0;
  let tagsWritten = 0;
  let skippedForTime = 0;
  let nonFootball = 0;

  for (const source of todo) {
    if (Date.now() - started > WALL_CLOCK_BUDGET_MS) {
      skippedForTime++;
      continue; // picked up on the next run; nothing is lost
    }

    let xml;
    try {
      xml = await fetchFeed(source.url);
    } catch (e) {
      perSource[source.slug] = `fetch failed: ${e.message}`;
      await update('news_sources', `id=eq.${source.id}`, {
        last_fetched_at: new Date().toISOString(),
        last_status: `error: ${String(e.message).slice(0, 120)}`,
        consecutive_failures: (source.consecutive_failures || 0) + 1,
      }).catch(() => {});
      continue;
    }

    let parsed = [];
    try {
      parsed = parseFeed(xml);
    } catch (e) {
      perSource[source.slug] = `parse failed: ${e.message}`;
      continue;
    }

    const rows = [];
    const tagsByGuid = new Map();
    const seen = new Set();

    for (const item of parsed) {
      if (!item.published) continue; // undateable items would sort unpredictably
      if (seen.has(item.guid)) continue; // some feeds repeat a guid
      seen.add(item.guid);

      // One snippet, used for tagging either way. Stored only when the source
      // is not headline_only.
      const snippet = clipSummary(item.summary, 300);
      const hits = tagText(index, item.title, snippet, source.lang);
      const football = isFootball(item.title, snippet, hits.length, source.exclude_patterns);
      if (!football) nonFootball++;

      rows.push({
        source_id: source.id,
        guid: item.guid,
        title: item.title,
        summary: source.headline_only ? '' : snippet,
        source_url: item.link,
        lang: source.lang,
        category: categorise(item.title, snippet),
        published_at: item.published,
        football_ok: football,
      });
      tagsByGuid.set(
        item.guid,
        hits
          .map((h) => ({
            team_id: ourId.get(h.api_team_id),
            via: h.via,
            in_title: h.in_title,
          }))
          .filter((t) => t.team_id)
      );
    }

    if (rows.length === 0) {
      perSource[source.slug] = '0 items';
      continue;
    }

    const stored = await upsertReturning('news_items', rows, 'source_id,guid', 'id,guid');
    itemsWritten += stored.length;

    const tagRows = [];
    for (const s of stored) {
      for (const t of tagsByGuid.get(s.guid) || []) {
        tagRows.push({ news_item_id: s.id, team_id: t.team_id, via: t.via, in_title: t.in_title });
      }
    }
    if (tagRows.length) {
      await upsert('news_item_teams', tagRows, 'news_item_id,team_id');
      tagsWritten += tagRows.length;
    }

    const taggedCount = [...tagsByGuid.values()].filter((t) => t.length).length;
    perSource[source.slug] = `${stored.length} items, ${taggedCount} tagged`;

    await update('news_sources', `id=eq.${source.id}`, {
      last_fetched_at: new Date().toISOString(),
      last_status: `ok: ${stored.length} items`,
      consecutive_failures: 0,
    }).catch(() => {});
  }

  return {
    rows_written: itemsWritten,
    requests_used: 0, // no API-Football calls
    tags_written: tagsWritten,
    non_football_hidden: nonFootball,
    sources: perSource,
    skipped_for_time: skippedForTime,
    index_entries: index.entries.length,
    ambiguous_aliases_dropped: index.dropped.length,
  };
});
