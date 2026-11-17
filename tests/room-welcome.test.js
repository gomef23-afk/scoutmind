// Migration 033 (Sequence 2 commit 4b-8): the pinned room welcome in
// Portuguese and English.
//
//   node tests/room-welcome.test.js
//
// Static checks on the SQL: re-runnable, never deletes, touches only pinned
// system messages in official rooms (the Scout Game round posts are system
// but not pinned), Portuguese first then English with the club's name, no
// "do/da <club>", the same text in the UPDATE and the INSERT, a guard that
// fails the run if a room is left English-only, and a verification query.
// No dependencies.

import { readFileSync } from 'node:fs';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const sql = readFileSync(new URL('../supabase/migrations/033_bilingual_room_welcome.sql', import.meta.url), 'utf8');
const body = sql.replace(/--[^\n]*/g, '');

check('never deletes, never drops', !/\bdelete\s+from\b|\bdrop\s+(table|column)\b|\btruncate\b/i.test(body));
check('one transaction', /^\s*begin;/m.test(body) && /^\s*commit;/m.test(body));
const upd = (/update public\.group_messages m[\s\S]*?;/.exec(body) || [''])[0];
check('the update touches pinned system messages in official rooms only, not soft-deleted ones',
  /g\.is_official/.test(upd) && /m\.is_system/.test(upd) && /m\.pinned/.test(upd) && /m\.deleted_at is null/.test(upd));
const ins = (/insert into public\.group_messages[\s\S]*?;/.exec(body) || [''])[0];
check('the insert only fills a room with no welcome (re-runnable)', /not exists \(/.test(ins) && /m\.is_system and m\.pinned/.test(ins));
const text = (s) => ((/'Bem-vindos[\s\S]*?Be decent\.'/.exec(s) || [''])[0]).replace(/\s+/g, ' ');
check('the same text in the update and the insert', text(upd) !== '' && text(upd) === text(ins), `${text(upd)}\n      ${text(ins)}`);
const pt = text(upd).indexOf('Bem-vindos'), en = text(upd).indexOf('Welcome to the official');
check('Portuguese first, then English', pt === 1 && en > pt);
check('the club named from teams.name in both halves', (text(upd).match(/\|\| t\.name \|\|/g) || []).length === 2);
check('no "do <club>" / "da <club>" (the article depends on the club)', !/\b(do|da) ' \|\| t\.name/.test(text(upd)));
check('a guard fails the run if a room is left English-only or without the welcome', /raise exception '033:/.test(body) && /v_welcomes <> v_rooms or v_old <> 0/.test(body));
check('a read-only verification query is in the file', /-- VERIFY/.test(sql) && /--\s+select[\s\S]*with_bilingual_welcome/.test(sql));
const sample = "Bem-vindos à sala oficial da torcida: Atlético Mineiro. Dia de jogo, mercado, discussão. Respeito sempre. · Welcome to the official Atlético Mineiro room. Match days, transfers, arguments. Be decent.";
check('a long club name stays far under the 500-character limit', sample.length < 300, String(sample.length));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
