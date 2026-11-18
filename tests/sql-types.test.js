// PL/pgSQL variables hold the type of the id they receive.
//
//   node tests/sql-types.test.js
//
// 17 Nov 2026: 035's room trigger declared `v_group bigint` and did
// `insert into public.groups … returning id into v_group`. groups.id is a uuid
// (011), so the first brand-new club raised 22P02 inside the teams upsert and
// /api/cron/teams?league=championship failed (fixed in 035b). Nothing ran the
// trigger path before production did.
//
// This reads every migration: the primary-key type of each table from its
// CREATE TABLE (bigserial → bigint), then, inside every function, each
// variable that receives a table's id —
//   select x.id into v from public.T …
//   insert into public.T … returning id into v
// — must be declared with that type. Static, no database, no dependencies.

import { readFileSync, readdirSync } from 'node:fs';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };

const dir = new URL('../supabase/migrations/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/--[^\n]*/g, '');
const src = Object.fromEntries(files.map((f) => [f, strip(readFileSync(new URL(f, dir), 'utf8'))]));

// ── Primary-key types ──
const norm = (t) => ({ bigserial: 'bigint', serial: 'integer', int8: 'bigint', int4: 'integer', int: 'integer' }[t.toLowerCase()] || t.toLowerCase());
const idType = {};
for (const f of files) {
  for (const m of src[f].matchAll(/create table if not exists public\.(\w+)\s*\(\s*id\s+(\w+)/gi)) idType[m[1]] ??= norm(m[2]);
}
check('the tables the room trigger touches have their id types on record',
  idType.groups === 'uuid' && idType.group_messages === 'uuid' && idType.teams === 'bigint' && idType.leagues === 'bigint' && idType.ingest_runs === 'bigint',
  JSON.stringify({ groups: idType.groups, group_messages: idType.group_messages, teams: idType.teams, leagues: idType.leagues, ingest_runs: idType.ingest_runs }));

// ── Every function: declared variables vs the ids they receive ──
let checked = 0;
const wrong = [];
function checkFunction(file, name, body) {
  const decl = (/\bdeclare\b([\s\S]*?)\bbegin\b/i.exec(body) || [])[1] || '';
  const vars = {};
  for (const m of decl.matchAll(/^\s*(\w+)\s+([a-z_]+)(?:\s*\([^)]*\))?\s*(?::=[^;]*)?;/gim)) vars[m[1].toLowerCase()] = norm(m[2]);
  const flows = [];
  for (const m of body.matchAll(/select\s+(?:\w+\.)?id\s+into\s+(\w+)\s+from\s+public\.(\w+)/gi)) flows.push([m[1], m[2]]);
  for (const m of body.matchAll(/insert\s+into\s+public\.(\w+)\b[\s\S]*?returning\s+id\s+into\s+(\w+)/gi)) flows.push([m[2], m[1]]);
  for (const [v, table] of flows) {
    const want = idType[table], got = vars[v.toLowerCase()];
    if (!want || !got) continue;      // a table or variable this test cannot see
    checked++;
    if (want !== got) wrong.push(`${file} ${name}: ${v} is ${got}, public.${table}.id is ${want}`);
  }
}
for (const f of files) {
  // The last definition of each function in a file is the one that stands.
  for (const m of src[f].matchAll(/create or replace function public\.(\w+)\([^)]*\)[\s\S]*?\$\$([\s\S]*?)\$\$/gi)) checkFunction(f, m[1], m[2]);
}
check('every variable that receives a table id has that id\'s type', wrong.length === 0, wrong.join('\n      '));
check('the check sees real flows (not vacuous)', checked >= 3, String(checked));

// ── It would have caught 17 Nov ──
const bad = `create or replace function public.x() returns trigger language plpgsql as $$
declare
  v_group bigint;
begin
  insert into public.groups (club_id) values (new.id) returning id into v_group;
  return new;
end; $$;`;
const before = wrong.length;
for (const m of strip(bad).matchAll(/create or replace function public\.(\w+)\([^)]*\)[\s\S]*?\$\$([\s\S]*?)\$\$/gi)) checkFunction('probe', m[1], m[2]);
check('the 035 bug (v_group bigint ← groups.id uuid) is flagged', wrong.length === before + 1 && /v_group is bigint, public\.groups\.id is uuid/.test(wrong[wrong.length - 1] || ''));

// ── The fix ──
const fixA = readFileSync(new URL('035_leagues_config.sql', dir), 'utf8'), fixB = readFileSync(new URL('035b_club_room_uuid.sql', dir), 'utf8');
check('035 and 035b declare v_group uuid', /v_group uuid;/.test(fixA) && /v_group uuid;/.test(fixB) && !/v_group bigint/.test(strip(fixA)) && !/v_group bigint/.test(strip(fixB)));
check('035b replaces the function only (the trigger stays), and keeps it closed to the browser',
  /create or replace function public\.ensure_club_room\(\)/.test(fixB) && !/create trigger|drop trigger/i.test(strip(fixB))
  && /revoke all on function public\.ensure_club_room\(\) from public, anon, authenticated;/.test(fixB) && /security definer/.test(fixB));
const body = (s) => strip((/create or replace function public\.ensure_club_room\(\)[\s\S]*?\$\$[\s\S]*?\$\$;/.exec(s) || [''])[0]).replace(/\s+/g, ' ');
check('035b\'s function is exactly 035\'s corrected one', body(fixA) !== '' && body(fixA) === body(fixB));
check('035b carries a rolled-back end-to-end check of the trigger path', /begin;\s*\n--\s+insert into public\.teams \(api_team_id, name\) values \(-35, 'Trigger Test FC'\);[\s\S]*rollback;/.test(fixB));
// The previous run left nothing behind: the trigger raises inside the upsert.
check('the teams upsert is one statement, so a failed trigger rolls the whole batch back', /rows \+= await upsert\('teams', teamRows, 'api_team_id'\);/.test(readFileSync(new URL('../api/cron/teams.js', import.meta.url), 'utf8')));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed  (${checked} id flows checked)`);
process.exit(failures.length ? 1 : 0);
