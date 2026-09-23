# ScoutMind — instructions for Claude Code

Read these two files before doing any work, every session:
- `SCOUTMIND_PROJECT_CONTEXT.md` — full architecture, Supabase tables, design system, file map (May 2026 snapshot)
- `SCOUTMIND_SOCIAL_PIVOT_PLAN.md` — the current direction. This supersedes the pricing, Stripe, pending-list and next-session sections of the context doc.

## What ScoutMind is now (Sept 2026)
A free football social network. All subscription tiers (Scout Free / Scout Pro / Club Basic / Club Pro) are being removed. Every feature is available to every user. Scout Mode, SM Weekly, transfer news, match day, communities, polls, groups and analyst posts all stay — they become content for the social feed.

## Stack
Vanilla HTML/CSS/JS in `public/`. No framework, no build step. Hosted on Vercel, auto-deploys from `main`. Supabase for auth + data. Stripe exists but is dormant — do not wire anything to it.

Serverless ingest lives in `api/` (ESM, **zero npm dependencies** — talk to Supabase over PostgREST with `fetch`). Football data comes from API-Football v3 Pro via `/api/cron/*`, scheduled by cron-job.org with a `CRON_SECRET` bearer token. The browser never sees the service key.

## Files
- `public/app.html` — main app (Scout Mode, Feed, Profile)
- `public/community.html` — team communities (polls, analyst insights, groups, wishlist)
- `public/auth.html` — login/signup
- `public/index.html` — landing page
- `public/news.html` — transfer news
- `public/leagues_data.js`, `public/players_data.js` — data

## Hard rules
1. Never use Python string replacement on JS-inside-HTML. Edit files directly with the editor tools.
2. After any HTML change, verify div balance: strip `<script>` blocks, count `<div` vs `</div>` — must be equal. Report the numbers.
3. No duplicate `function` / `const` / `let` declarations across script blocks in the same file.
4. `community.html` team selection uses the `_ft` array + `pickTeam(idx)` — never inline strings in onclick.
5. Nav is duplicated across `app.html`, `community.html`, `news.html` — any nav change must be applied to all three.
6. Modals: `display:none` in HTML, `display:flex` set only in JS.
7. `badge_applications` — do not send `user_id` (FK fails for localStorage users).
8. `leagues_data.js` must load before `init()` — keep the `typeof TEAMS !== 'undefined'` pattern.
9. Every new Supabase table needs RLS. Write the SQL in `supabase/migrations/` (create the folder) — Felipe runs it in the dashboard.
10. No social data in localStorage. Only session/UI preferences. Anything other users should see goes in Supabase.
11. Mobile-first CSS: base styles for ~375px, `@media (min-width: 900px)` for desktop.
12. All feed items render through one `renderFeedItem(item)` with a `type` switch.
13. **Ingest jobs are additive only.** Nothing in `api/` may DELETE — `_lib/supabase.js` exports no delete on purpose. A job that deleted outside its window would wipe backfilled data on the next scheduled run.
14. **Null is not zero.** In API-Football responses, counting stats (shots, fouls, cards, saves) use `null` for "none happened" → coalesce to 0. `expected_goals` and `goals_prevented` use `null` for "not available" → keep null and exclude from averages. Averaging a null in as zero is the most likely source of wrong-looking-but-plausible data.
15. **Every average needs its denominator stored.** `team_season_stats` has three: `matches`, `fixtures_sampled`, `xg_sample`. Never divide by the wrong one, and never add an average without a sample column beside it.
16. Cron endpoints must finish in **under ~25s** — cron-job.org stops waiting at 30s. Bound work by wall clock, not only by row count.

## Workflow
- Before editing, grep and list every hit you plan to change. Wait for approval on anything that removes or restructures more than one section.
- Make focused commits with clear messages. Do not push to `main` unless explicitly told to.
- After each task, list exactly which files changed and what to check on the live site.
- Design tokens (colors, fonts) are in the context doc Section 5 — reuse them, don't invent new ones.
- Ask when unsure. Don't guess at product decisions; the plan's Section 14 lists open ones.
