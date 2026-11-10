// Reads of "my rows" from public-read tables must say whose rows.
//
//   node tests/client-reads.test.js
//
// `follows` is public-read (club pages count followers), so RLS does not
// narrow a read to the caller. An unfiltered `follows?select=...` returns every
// user's follows: that is how a brand-new account opened onboarding with ~30
// clubs already ticked, and how a club anyone else followed could never be
// saved as yours (Day 5). This pins every client read of follows to a user_id
// or team_id filter. No dependencies.

import { readFileSync, readdirSync } from 'node:fs';

let passed = 0;
const failures = [];
const pub = new URL('../public/', import.meta.url);

const PUBLIC_READ_PER_USER = ['follows'];

for (const f of readdirSync(pub).filter((n) => n.endsWith('.html'))) {
  const src = readFileSync(new URL(f, pub), 'utf8');
  for (const table of PUBLIC_READ_PER_USER) {
    // Every string literal that starts a PostgREST path for this table.
    const re = new RegExp(`['"\`]${table}\\?[^'"\`]*`, 'g');
    for (const m of src.matchAll(re)) {
      const lit = m[0];
      // The literal may continue with concatenation ('...&user_id=eq.'+me):
      // look at the rest of the statement too.
      const stmt = src.slice(m.index, src.indexOf(';', m.index) + 1);
      const ok = /user_id=eq\.|team_id=eq\.|team_id=in\./.test(stmt) || /on_conflict=/.test(lit);
      if (ok) passed++;
      else failures.push(`${f}: unfiltered read of ${table}: ${stmt.slice(0, 120)}`);
    }
  }
}

if (passed === 0) failures.push('found no reads of follows at all — the pattern no longer matches the code');
for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
