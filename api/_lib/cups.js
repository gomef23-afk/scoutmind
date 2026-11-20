// Cups on the server side (C-1, 22 Nov 2026). The round rules are the ones in
// public/cup-ties.js (the browser builds the ties from the fixtures we hold);
// tests/cups.test.js checks the two agree on every real round name.

import { BY_SLUG } from './leagues.js';

/** The config entry of a leagues row (type, fromRound live in api/_lib/leagues.js). */
const cfgOf = (lg) => (lg && BY_SLUG[lg.slug]) || lg || {};

/** A cup, by its leagues row (its config type, else the row's own `type`, 039). */
export function isCupRow(lg) { const c = cfgOf(lg); return (c.type || lg?.type) === 'cup'; }

/** A qualifying round (or a round before the league phase): never loaded for a cup with fromRound. */
export function isQualifying(round) {
  const r = String(round || '');
  return /qualifying/i.test(r) || /^play-?offs?$/i.test(r) || /^playoff round$/i.test(r) || /^preliminary/i.test(r);
}

/**
 * Do we keep this fixture? Every fixture of a league; for a cup with
 * fromRound ('League Stage'), everything but the qualifying rounds before it
 * (decision 2 of C-1: no qualifying, so no 214 qualifying-only clubs).
 */
export function keepRound(lg, round) {
  const c = cfgOf(lg);
  if (!isCupRow(lg) || !c.fromRound) return true;
  return !isQualifying(round);
}

/** The penalty shoot-out score, for a cup's fixture row (039): { pen_home, pen_away }. */
export function penalties(apiFixture) {
  const p = apiFixture?.score?.penalty || {};
  return { pen_home: p.home ?? null, pen_away: p.away ?? null };
}
