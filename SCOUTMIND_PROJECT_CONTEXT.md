# ScoutMind — Complete Project Context
*Last updated: May 4, 2026. Upload this to Claude Projects as the primary context document.*

---

## 1. WHO / TEAM

- **Felipe Valois** — Sole founder, CEO. Brazilian, studying at Wake Forest University (WFU) in the US. Botafogo fan. Email: gomef23@wfu.edu
- **Henrique** — Operations
- **Bernardo** — Finance
- **Pedro** — Sales
- **Max** — Marketing
- **Charlie / Princeton** — Tech support

---

## 2. WHAT IS SCOUTMIND

ScoutMind is a football (soccer) scouting and fan intelligence platform. It combines AI-powered tactical analysis, player recommendations, transfer news, and community features. It targets two audiences simultaneously:

1. **Football fans** — want to feel like an insider, follow their club deeply, discuss transfers
2. **Clubs, scouts, agents** — want data-driven player recommendations, weakness analysis, scouting reports

The core value proposition: "What position does your team need? Here are the 10 best available players that fit, ranked by Fit Score." Free for fans, paid for professionals.

---

## 3. TECH STACK
*Updated September 23, 2026.*

- **Frontend:** Pure vanilla HTML/CSS/JavaScript — NO framework, no build step
- **Backend:** Vercel serverless functions in `api/` (ESM, zero npm dependencies — they talk to Supabase over PostgREST with `fetch`)
- **Hosting:** Vercel (auto-deploys from GitHub on push to main)
- **Database/Auth:** Supabase
- **Football data:** API-Football v3 — **Pro plan**, direct host `v3.football.api-sports.io` (NOT RapidAPI)
- **Scheduling:** cron-job.org (Vercel Hobby allows only 2 daily crons)
- **Payments:** Stripe — **dormant**. All tiers removed in Phase A; nothing is wired to it
- **Domain:** scoutmind.app
- **GitHub:** github.com/gomef23-afk/scoutmind

### Supabase Details
- **Project URL:** https://kdhbpzooyjxcglbxbuya.supabase.co
- **Anon key:** used by the browser only, against public-read tables
- **Service key:** new format (`sb_secret_…`), Vercel env only — **never** in the client
- **Migrations applied:** `001_plan_to_role`, `002_public_read`, `003_football_data`

### API-Football
- Pro: **7,500 req/day, 300/min**. Steady state ~205/day (~3%): live 144, fixtures ≤14, standings 7, fixture-stats 20-40
- All seven leagues active: Série A 🇧🇷 (71), Premier League (39), La Liga (140), Bundesliga (78), Serie A 🇮🇹 (135), Ligue 1 (61), Liga Profesional 🇦🇷 (128) — all `current_season = 2026`
- The free tier is unusable here: seasons 2022-2024 only, and it rejects the `next`/`last` fixture parameters

### Vercel environment variables
`API_FOOTBALL_KEY` · `SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` · `CRON_SECRET` (rotated November 2026)

### Cron endpoints (cron-job.org, `Authorization: Bearer $CRON_SECRET`)
| Endpoint | Schedule | Cost |
|---|---|---|
| `/api/cron/fixtures` | daily 05:05 | 7 (+1 per empty league) |
| `/api/cron/standings` | daily 06:00 | 7 |
| `/api/cron/live` | **every 10 min** | 1 (144/day) |
| `/api/cron/fixture-stats` | every 15 min | ≤40 (0 when the queue is empty) |
| `/api/cron/teams` | manual | 7, or ~150 with `?coaches=1` |
| `/api/cron/player-stats` | every 15 min | 1 per 20 finished fixtures (`/fixtures?ids=`); 0 when the queue is empty |
| `/api/cron/players` | hourly | ≤15 `/players` pages a run until a pass of 245 completes, then 0 until it is 7 days old |
| `/api/cron/health` | manual | 0 |

`fixture-stats` is self-limiting: max 40 fixtures **or** 20 s of wall clock,
whichever comes first, so it always returns inside cron-job.org's 30 s timeout.
It serves both the backfill and steady state — no manual looping.

---

## 4. FILES IN THE PROJECT

| File | Purpose | Status |
|------|---------|--------|
| `public/index.html` | **The app** — Home feed, Clubs, Scout (the Scout Game), Matches, Profile | ✅ Live (was `app.html`) |
| `public/app.html` | Redirect stub to `/`, preserves query + hash | ✅ Live |
| `public/about.html` | Marketing page — hero, how it works, for who, FAQ, for clubs | ✅ Live |
| `public/community.html` | Team communities — polls, analyst insights, groups, wishlist | ✅ Live |
| `public/auth.html` | Login / Signup | ✅ Live |
| `public/favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `og.png` | "SM" monogram icons and the link-preview image; made by `scripts/make-icons.ps1` from `scripts/brand/*.html` | ✅ |
| `public/terms.html`, `public/privacy.html` | Terms of Service and Privacy Policy, EN + PT-BR with a language toggle | ⚠️ Draft, pending legal review |
| `public/news.html` | Transfer news | ⚠️ Deleted in B3 → `/?filter=transfers` |
| `public/leagues_data.js` | Static team/league data — `community.html` only since Day 4 | ⚠️ Replaced in R9, deleted in R10 |
| `public/players_data.js` | Static player database for Scout Mode | 🗑️ Deleted on Day 4 (Nov 2026) with Scout Mode |
| `api/_lib/*.js` | API-Football client, PostgREST helper, cron scaffolding | ✅ Live |
| `api/cron/*.js` | teams · fixtures · standings · live · health | ✅ Live |
| `supabase/migrations/*.sql` | 001, 002, 003 | ✅ Applied |
| `scripts/probe-api-football.ps1` | R0 schema probe (PowerShell 5.1-safe, pure ASCII) | ✅ |
| `tests/fixtures/api-football/*.json` | Real API payloads, committed as fixtures | ✅ |

---

## 5. DESIGN SYSTEM

```css
--bg: #07090f         /* Page background */
--bg2: #0d1117        /* Card background */
--bg3: #141b27        /* Input/inner background */
--accent: #00e5a0     /* Primary green */
--accent2: #00b8ff    /* Secondary blue */
--warn: #ff6b35       /* Orange warning */
--text: #edf2f7       /* Primary text */
--muted: #5a6a85      /* Secondary text */
--border: #1a2540     /* Border color */
--red: #ff4560        /* Red/negative */
--yellow: #f5c842     /* Yellow/neutral */
```

**Fonts:** Bebas Neue (headings/stats), DM Sans (body), DM Mono (numbers/stats)

---

## 6. SUPABASE DATABASE TABLES
*Updated September 23, 2026. Migrations 001-003 applied.*

**Access model, applied to every table:** RLS on; `anon` + `authenticated` may
SELECT; writes go through the service key, which bypasses RLS and lives only in
Vercel env. Exceptions are called out below.

### `profiles` (existing — repurposed by `001`)
```sql
id UUID (references auth.users)
name TEXT
email TEXT
plan TEXT DEFAULT 'fan'   -- 'fan' | 'analyst' | 'admin'  (was free/pro/club/clubpro)
credential TEXT           -- e.g. 'ESPN Brasil', 'Licensed Scout' (for analysts)
created_at TIMESTAMP
main_club_id BIGINT       -- 007. references teams(id). NULL is normal: no default club
content_langs TEXT[]      -- 007. NULL = fall back to the browser language alone
show_club_news_all_langs BOOLEAN -- 007. opt-in: club news in other languages too
onboarded_at TIMESTAMPTZ  -- 007. set when onboarding completes OR is skipped;
                          --      also guards the one-time localStorage import
```
⚠️ **`plan` and `credential` cannot be written from the app** (`013`). Set them in the dashboard or SQL editor. A new column the app writes needs its own `grant update`.

⚠️ **`profiles` is NOT publicly readable** — it holds email addresses. A signed-in
user can read and update only their own row. Public/social reads go through:

**Account deletion (024).** `/api/account/delete` checks the session and password, calls `delete_account_data(user)` (service role), then deletes the auth user. Since 024 every reference to `auth.users` / `profiles` has a deliberate rule: authors and stamps → `set null` (content shows "[deleted user]"), `profiles` and `badge_applications` → `cascade`, `game_entries` / `game_round_results` have no FK (a deleted player's rows move to a ghost id). `export_my_data()` returns everything held about `auth.uid()`.

### `public_profiles` (VIEW, created by `002`)
```sql
id, name, plan, credential, created_at   -- never email
```
**Client rule:** another user's profile data → `public_profiles`; the signed-in
user's own row → `profiles`.

### `on_auth_user_created` (TRIGGER, created by `002`)
Creates the `profiles` row server-side on signup. Required: email confirmation
means `auth.signUp()` returns no session, so a client-side insert would run as
`anon` and be rejected by RLS. It fires at sign-up, before confirmation, and
passes 013's `profiles_role_guard` because `handle_new_user` is SECURITY
DEFINER (the guard sees `current_user = postgres`). Email confirmation is on
since Day 5: Resend SMTP, templates in `docs/auth-email-templates.md`, setup in
`docs/email-setup.md`.

### `groups` (created May 2026)
```sql
id UUID PRIMARY KEY
team_id TEXT             -- e.g. 'botafogo', 'flamengo'
name TEXT
description TEXT
created_by UUID
member_count INT DEFAULT 0
created_at TIMESTAMPTZ
```

### `group_messages` (created May 2026)
```sql
id UUID PRIMARY KEY
group_id UUID REFERENCES groups(id)
user_id UUID REFERENCES profiles(id)
user_name TEXT
content TEXT
created_at TIMESTAMPTZ
```

### `analyst_posts` (created May 2026)
```sql
id UUID PRIMARY KEY
team_id TEXT
user_id UUID REFERENCES profiles(id)
user_name TEXT
credential TEXT          -- shown as badge on posts
content TEXT
reactions JSONB DEFAULT '{"fire": 0, "clap": 0, "mind_blown": 0}'
created_at TIMESTAMPTZ
```

### `badge_applications` (created May 2026)
```sql
id UUID PRIMARY KEY
user_id UUID (nullable)
user_name TEXT
email TEXT
role TEXT                -- 'Football Journalist', 'Licensed Scout', etc.
organisation TEXT
bio TEXT
status TEXT DEFAULT 'pending'
created_at TIMESTAMPTZ
```

⚠️ `badge_applications` has **no SELECT policy at all** — applications hold an
email and a bio. Only the dashboard (service role) reads them. Insert is
`authenticated` only, so every application is tied to an account.

**Seeded groups:** Botafogo (3 groups), Flamengo (3), Palmeiras (2)

---

## 6b. FOOTBALL DATA TABLES (migrations `003`–`008`, Phase R)

Written only by the cron jobs. All public-read.

| Table | Holds | Populated by |
|---|---|---|
| `leagues` | 7 leagues, `api_league_id`, `current_season` (per league), `active` | seeded in `003` |
| `teams` | 146 teams — venue, founded, logo, coach | `/api/cron/teams` ✅ |
| `team_aliases` | Club aliases for news tagging, with `kind` / `langs` / `short_ok` | seeded in `005` from `api/_lib/aliases.js` ✅ |
| `standings` | Rank, points, form, `group_label` | `/api/cron/standings` ✅ |
| `standings_snapshots` | One row per club per UTC day: rank, points, played, W/D/L, GF/GA, form, `group_label`. Cannot be back-filled | `/api/cron/standings` (`013`) |
| `fixtures` | Kickoff, status, elapsed, score, venue | `/api/cron/fixtures` ✅ |
| `fixture_stats` | All 18 `/fixtures/statistics` types incl. `expected_goals`, `goals_prevented` | `/api/cron/fixture-stats` ✅ |
| `team_season_stats` | The weakness engine's inputs — `gc gs yel pa pos_pct fouls sh sot tk int duels_won_pct xg_pg xga_pg` | R5 ✅; `tk`/`int`/`duels_won_pct` + `player_sample` from player rows, R6 (`015`) |
| `league_averages` | **VIEW** (`016`, replaced the empty 003 table). Per league and season, the unweighted mean across teams of every `team_season_stats` metric, each with `<m>_n` (teams) and `<m>_games` (its denominator summed). `is_current` picks the live season | derived, R7 |
| `game_rounds`, `game_round_fixtures` | Scout Game rounds per competition from `fixtures.round` (regular season only), with deadline (first kickoff), window and status `open` / `locked` / `final`; which fixtures each round scores (`counts`) | `sync_game_rounds()` from `player-stats` (`017`) |
| `game_entries`, `game_picks` | One entry per user per round, five picks with one captain. Written **only** through `submit_picks()`, before the deadline. `locked_tier` / `locked_multiplier` / `locked_contrarian` are snapshotted at the deadline and never change | `submit_picks()`, `lock_due_rounds()` (`017`) |
| `game_pick_scores`, `game_round_results` | Points per pick per fixture (base, breakdown, multiplier, total) and per user per round (total, captain points, streak). Recomputed, never incremented; public once a round is locked | `player-stats` + `refresh_game_results()` (`017`) |
| `badges`, `user_badges`, `game_config` | Eight badges, each earned once; `game_config.torcida_min_members` (3 for the beta) | `017` |
| `game_round_rankings`, `game_competition_standings`, `game_overall_standings`, `game_torcida_standings`, `game_torcida_table` | **VIEWS.** Ties broken by total, captain points, earliest final submission, user id. Overall = sum across competitions with rounds played beside it; torcida table = mean of each club's top 10 | derived (`017`) |
| `league_position_rates` | **VIEW** (`016`). Per league, season and position: mean and SD of per-90 goals, assists, shots on target, key passes, saves, plus rating and clean-sheet rate, over players with minutes ≥ max(270, 30% of team minutes). `n_players` behind every mean. The Scout Game's tier baselines | derived, R7 |
| `players` | Name, age, nationality, height, photo. Created by `player-stats` on first appearance; bio filled by `/api/cron/players` | R6 (`015`) |
| `player_fixture_stats` | **One row per player who played, per fixture** — the Scout Game's source. Position as played, `started` (from the lineup), minutes, on/off minute, rating, goals, assists, saves, derived `goals_conceded`, `clean_sheet`, shots, key passes, tackles, interceptions, duels, cards and more | `/api/cron/player-stats` (`015`) |
| `fixture_events` | Goals, cards, substitutions, VAR per fixture, in API order (`seq`). Conceded and clean sheet are recomputable from here | `/api/cron/player-stats` (`015`) |
| `player_season_stats` | Season totals **summed from `player_fixture_stats`** by `refresh_player_season_stats()`, never fetched. `rated_apps` is the rating denominator; `position` is the one played most minutes | R6 (`015`) |
| `player_season_rates` | **VIEW** — per-appearance rates computed, never stored | derived |
| `news_sources` | The 10 live feeds — `lang`, `country`, `headline_only`, `exclude_patterns`, health counters | seeded in `005` ✅ |
| `news_items` | Headline + ≤300-char snippet + link. **Never full article text**. `football_ok` hides non-football without deleting it | `/api/cron/news` ✅ |
| `news_item_teams` | Article → club, plus `via` (the alias that matched) and `in_title` (named in the headline, drives ranking) | `/api/cron/news` ✅ |
| `follows` | User -> club. Public read (real follower counts), own-row write only | `007` ✅ || `comments` | News comments. Soft delete only (`deleted_at`); `content` immutable via column grant. Authors and admins can read deleted rows (`014`), so every client read filters `deleted_at=is.null` | `008` ✅ |
| `reactions` | 🔥 👏 🤯, one of each per user per item. Counts are always COUNT(*) | `008` ✅ |
| `reports` | Comment reports. One open report per user per target | `008` ✅ |
| `events` | Insert-only telemetry. **No SELECT policy** — read as service role | `008` ✅ |
| `moderation_blocklist` / `moderation_allowlist` | Server-side slur filter. RLS on, no policy: unreadable via the API | `008` ✅ || `ingest_runs` | Job telemetry + resumable cursor. **No read policy** — telemetry, not content | all jobs |

### Player rows: what absence means (R6)
- **Once a fixture has `players_fetched_at` set, no `player_fixture_stats` row for a player means they did not play.** Unused substitutes get no row. The Scout Game relies on this. The one exception is `fixtures.players_unidentified`: players the API sent with id 0, who played but could not be stored.
- **Clean sheet:** 60+ minutes and no goals conceded while on the pitch, own goals included. `goals_conceded` and `clean_sheet` are null for a fixture whose goal events do not add up to its score.
- **Rule 14, null means 0, even for a whole match.** `goals` in a 0-0 (or a 0-1 own goal) arrives null for every player; it is still 0. Never infer "not provided" from a field being null for everyone; that wrote null goals for every 0-0 until 9 Nov.
- **The one "not provided" case is a reduced feed**, found in every league: when every goalkeeper's `goals.conceded` is null, six fields (`goals_conceded_api`, `dribbles_past`, `pen_won`, `pen_committed`, `pen_missed`, `pen_saved`) are absent and stay null. The goalkeeper anchor decides, not the fields: in a full feed `pen_won` can be null for everyone simply because nobody won a penalty.
- **Starters come from `lineups.startXI`**, not the API's `substitute` flag, which is false for everyone in the Premier League.
- `team_season_stats.player_sample` is the denominator for `tk_pg`, `int_pg` and `duels_won_pct`: fixtures with player rows that carried tackle data. It is `<= matches` and independent of `fixtures_sampled` and `xg_sample`.

### Data the API does not provide — dropped
Player **market value** (so the budget filter and currency switcher are gone),
`subpos` (only Goalkeeper/Defender/Midfielder/Attacker), **clearances**, and the
**aerial-duel split** — "Aerial vulnerability" becomes **"Duel vulnerability"**
on `duels_won_pct`. `passes.accuracy` is null for ~95% of players.

### The three denominators in `team_season_stats`
Getting these wrong produces plausible-looking nonsense, so they are explicit:

| Column | Counts | Denominator for |
|---|---|---|
| `matches` | games played (from `fixtures`) | `gs`, `gc` |
| `fixtures_sampled` | games we hold stats for | `pos_pct`, `sh_pg`, `sot_pg`, `fouls_pg`, `yel_pg` |
| `pa_sample` | games with a published pass % (`016`); until then a missing pass % was averaged in as 0% | `pa` |
| `xg_sample` | games with non-null xG **on both sides** | `xg_pg`, `xga_pg` |

`matches >= fixtures_sampled >= xg_sample`. When they diverge the averages are
still right; the sample columns are what make that visible.

### Ingest gotchas worth remembering
- Counting stats use `null` for zero — coalesce or every per-90 breaks
- `Ball Possession` and `Passes %` are strings (`"56%"`); `rating` is a string
- `height` arrives as both `"178"` and `"188 cm"` in one response
- `teams/statistics` cards include an **empty-string key** (`""`) for unknown minute
- `/coachs` returns coaching **history**, not just the incumbent
- `league.standings` is an array of **groups**; Argentina repeats teams across them

---

## 7. *(deleted — pricing)*

ScoutMind is free. There are no tiers. Removed in Phase A, September 2026; see
the Status section of SCOUTMIND_SOCIAL_PIVOT_PLAN.

*Section numbers below are intentionally unchanged: CLAUDE.md and the pivot plan
reference this document by section number, so the gaps stay rather than
renumbering everything and breaking those links.*

---

## 8. APP ARCHITECTURE (`index.html`)

*Rewritten for Day 4 (Nov 2026). The feed notes below predate the pivot in places; the plan's Status table is the current record.*

### Pages (CSS class `.page`, toggled with `.active`; `showPage(id)`, `?page=` on load)
- `#page-feed` — Home (default on load)
- `#page-communities` — Clubs
- `#page-scout` — the Scout Game
- `#page-matches` — Matches
- `#page-profile` — Profile (includes a Scout Game section, `renderProfileGame()`)

### Nav
Home · Clubs · Scout · Matches · Profile — top bar on desktop, fixed bottom bar on mobile (B2), duplicated across index / about / community / news (rule 5).

### Feed Tabs
**Transfer news** | **For you** | **SM Weekly** | **Match day**

- **Transfer news:** Transfer Intelligence format, filters (All/Transfers/Rumors/Contracts/Financial/Brazil/Europe), Hot Rumors sidebar, Fit Score Index sidebar
- **For you:** Posts from clubs/analysts you follow (ScoutMind AI + verified analyst posts)
- **SM Weekly:** ScoutMind Weekly Report — all 7 leagues, ungated (Phase A removed the blur overlay)
- **Match day:** promoted out of the feed into its own `#page-matches` in B2. User's clubs pinned top, then all matches grouped by competition tier, live first. Reads `fixtures` from Supabase with a static fallback

### Feed Sidebar (sticky right column)
Hot Rumors % | Fit Score Index | Today's Matches | My Clubs

### Scout tab — the Scout Game (Day 4)
Scout Mode (static `players_data.js`, weakness-fit ranking, PDF export) was removed. The tab is now the Scout Game: free, points only, every number read from Supabase. Rules and scoring live in `api/_lib/scout-game.js` and migrations `017`–`019`; the plan's roadmap item 3 has the design and the backtest.

- **State:** one `SG` object in the Scout Game `<script>` block at the end of `index.html`. `renderScout()` loads rounds (`game_rounds`, open + locked + final within 14 days) and `game_config` (`select=*`, so a missing column degrades instead of 400ing), then my entries (`game_entries` + `game_picks`).
- **Competition tabs:** a league shows only with an open round, a locked round with a match still to play (`SG.playing`, from `game_round_fixtures`), or a locked round you entered; default is the main club's league. A Rankings tab sits at the end.
- **Round chips:** Open / In play / Full time (locked, every match over, points arriving) / Final.
- **Scoring:** v2 points table in `api/_lib/scout-game.js` (plan roadmap item 3), no appearance points. Breakdown keys from `basePoints()` are labelled by `SG_BREAKDOWN_LABEL`; `tests/scout-game.test.js` fails if a key has no label or a label no key. Base points are stored to two decimals (022).
- **Round fixture:** each row and slot shows the club's match in the round ("vs Palmeiras (H) · Sat"), from `game_pickable_players` (021). No counting fixture → "No match this round", not pickable (`sgNoMatch()`). Rows from before 021 carry no `fixture_id` key and are not blocked.
- **Formation:** exactly 1 GK, 2 DEF and 2 MID/FWD (`submit_picks`, 023, which replaced 020's caps). Slots are stored in formation order: 1 GK, 2–3 DEF, 4–5 MID/FWD. The board mirrors it in `sgBlock()`: + disabled with the reason, counts per group in the status line.
- **Positional slots:** `SG.picks` is always five entries indexed by slot (`SG_SLOT_GROUP` = G · D · D · X · X, X = MID/FWD). Adding a player drops him into the first empty slot of his group (`sgFreeSlot`); an empty slot is a button that filters the list to who can fill it. A saved entry is re-seated by position once the list loads (`sgSeatAll`), so it renders in formation order whatever order it was picked in; the in-play / final view labels each pick from its slot number, which 023 stores in formation order. `submit_picks` receives the ids in slot order. Default round: an in-play round I entered, else the earliest open one.
- **Pick screen (open round):** five slots and a captain, the pick list from `rpc/game_pickable_players` (same eligibility as `submit_picks`), search + position + club filters, at most 120 rows shown. Each row: club, position, **"Level n · ×1.20"** (from `game_config.ladder`; "Not enough minutes · ×1.4" when unranked; "×—" before 019), two per-90 lines for the position, last-match status. Client checks (five, the lineup rule, a captain) are feedback only; `rpc/submit_picks` decides, and its messages are shown verbatim through `friendlyDbError()`. Sticky save bar above the mobile tab bar; guests get "Sign in to play".
- **In play / final:** total and rank (`game_round_rankings`), each pick's locked level and points from `game_pick_scores` with a tap-to-open breakdown, the round's matches, the round's top 10. In play reads "Points arrive a few hours after full time."
- **My history** (tab after Rankings, `SG.view='history'`, `sgRenderHistory()`): one call to `rpc/my_game_history` (023) returns `{summary, rounds}` for `auth.uid()` — season points, rounds played, best round, current streak; then every entered round newest first with points, rank of N, best pick and badges. A row whose round is still loaded opens it. A round is listed from the moment its picks are saved: "picks in · closes Sat 16:30", then "in play · points after full time", then its rank (`sgHistoryState()`). The Profile's Scout Game section reads the same RPC. Guests get a sign-in prompt; no rounds → "Your first round is open — pick now →" (`sgGoPick`). The Profile's Scout Game section links here (`sgOpenHistory()`).
- **Rankings:** this round, competition, overall, my torcida (fans of my main club, plus the club-vs-club torcida table, clubs shown only with ≥ max(3, `torcida_min_members`) fans). Top 50, with my row pinned below when I am outside it.
- **Match panel** (`#match-overlay`, `openMatch(fixtureId)` / `closeMatch()`): any card or row carrying `fixtures.id` (Matches, Home sidebar, Your club card, a Scout round's matches) opens it. One call to `rpc/match_detail`. Started: score, goals, who played (starters, then subs who came on) with "Rating by API-Football", the reader's Scout points in the match. Upcoming: league position and last five per club. Before 019 it says details are not available yet.
- **Copy rule:** never "odds", "bet", "win money" or a quote format; multipliers only as "Level n · ×1.20", never as probabilities. `tests/scout-game.test.js` greps the game files and `index.html` for it.

---

## 9. COMMUNITY PAGE (community.html)

### Layout
Left sidebar (team selector by league + search) | Right (team page + tabs)

### Team Selector
- League dropdown (12 leagues)
- Search teams
- Auto-selects user's main club on load
- Uses `_ft` array + `pickTeam(idx)` to avoid string escaping issues

### Team Page Header
Full name, city, stadium, founded year, coach, style badges, 4 stats (goals/game, conceded/game, pass accuracy, possession), ScoutMind Weekly Verdict

### Community Tabs
1. **Polls** — localStorage, free users vote, Pro creates polls
2. **Analyst Insights** — Supabase `analyst_posts`, analysts post, everyone reads/reacts (🔥👏🤯), "Apply for Badge →" opens modal
3. **Groups** — Supabase `groups`/`group_messages`, all users read+post, Pro creates groups, 8-second polling
4. **Transfer Wishlist** — localStorage, Pro suggests players, everyone votes

### Badge Application Modal
- Opens on "Apply for Badge →"
- Pre-fills name/email from localStorage
- Fields: name, email, role (dropdown), organisation, bio
- Submits to `badge_applications` Supabase
- Shows success screen
- Free — no payment

### Group Chat
- Full-screen overlay
- Real Supabase messages, 8s polling
- Free users CAN post (changed from Pro-only)
- My messages right-aligned, green tint

---

## 10. SCOUTMIND WEEKLY REPORT

7 leagues: Série A 🇧🇷, Premier League 🏴󠁧󠁢󠁥󠁮󠁧󠁿, La Liga 🇪🇸, Bundesliga 🇩🇪, Serie A Italy 🇮🇹, Ligue 1 🇫🇷, Argentina 🇦🇷

Each report has 4 sections:
1. **Biggest Mover** — team + stat change + note
2. **Weakness Alert** — team + weakness + stat + note
3. **Most Needed Position** — demand level + 2 players with fit scores
4. **Deep Dive** — one team, coach, analysis paragraph, 2 recommended signings with fit %

**Gating:** none. All 7 leagues are readable by everyone, including signed-out
guests — the blur overlay and upgrade CTA were removed in Phase A.

**User's main league always sorts first**

Content is hardcoded/static for now — will be replaced with real API data at launch.

---

## 11. localStorage KEYS

```
sm_current_user      -- {id, email, name, plan}
sm_main_club         -- {id, name, league, emoji}
sm_following_clubs   -- array of club IDs
sm_club_selected_{userId} -- '1' or 'skipped'
sm_comm_{teamId}     -- community data (polls, wishlist) per team
```

---

## 12. ROLE DETECTION IN CODE
*Rewritten September 2026. `isPro` / `isFree` / `isClub` no longer exist anywhere.*

```javascript
const cu = JSON.parse(localStorage.getItem('sm_current_user') || 'null');
const isGuest   = !cu;                          // drives the sign-in sheet
const isAnalyst = cu && cu.plan === 'analyst';  // analyst write box
```

**Guest mode:** there is no auth guard on any page. Guests read everything.
Every write action calls `requireAuth(message)` at function entry, which returns
`false` and opens the sign-in sheet. Gating at function entry, not on the
button, so programmatic callers are covered too.

**To approve an analyst:** Supabase → Table Editor → `profiles` → find by email
→ set `plan = 'analyst'` + fill `credential`.

---

## 13. *(deleted — Stripe flow)*

Nothing is charged. The Stripe account exists but is dormant and nothing in the
codebase references it.

---

## 14. HOW TO APPROVE AN ANALYST

1. Someone submits the "Apply for Analyst Badge" form on community.html
2. Felipe sees it in Supabase → Table Editor → `badge_applications`
3. To approve: go to `profiles` table → find their email → set `plan = 'analyst'` + fill `credential` (e.g. "ESPN Brasil")
4. That user now sees the analyst write box in every team's Analyst Insights tab

---

## 15. WHAT'S BUILT AND WORKING ✅

- Scout Mode with full weakness analysis + player recommendations algorithm
- Free tier shows Top 10 players, Pro shows all
- PDF export (Pro only)
- Currency switcher (EUR/USD/BRL/GBP)
- Feed: Transfer news, For you, SM Weekly, Match day — all 4 tabs working
- SM Weekly — 7 leagues, proper gating
- Match day — user clubs first, all matches by competition tier
- Communities: Polls, Analyst Insights (Supabase), Groups (Supabase real-time), Transfer Wishlist
- Badge application modal → Supabase
- Group chat — free users can post
- Supabase auth (email/password signup)
- Nav uniform across all pages (Scout Mode | Feed | Communities)
- Auto-select main club in communities
- Avatar → profile page navigation
- Stripe payment link wired to all upgrade buttons
- `?upgraded=1` return handler with welcome banner
- Supabase Site URL updated to live domain

---

## 16. *(deleted — pending list)*

The live roadmap and the non-code launch checklist (MEI, legal review, Terms and
Privacy, account deletion) now live in one place: the **Status** section at the
top of SCOUTMIND_SOCIAL_PIVOT_PLAN.

---

## 17. BUSINESS CONTEXT

### Target Market
- **Phase 1:** Brazilian football fans (Série A audience), students
- **Phase 2:** Semi-professional clubs (Sampaio Corrêa, Madureira)
- **Phase 3:** Professional clubs after real API data

### Launch Strategy
1. Build user base first (free users, word of mouth)
2. Get real analysts posting content (badge system)
3. Then pitch clubs with "X users, Y analysts active"
4. Only then build a **separate** B2B product for clubs. The old Club Basic /
   Club Pro tiers are gone and are not coming back for fans — see monetization
   path 3 in the pivot plan. Nothing consumer-facing is ever charged for.

### Pitch Targets (drafted emails ready)
- Sampaio Corrêa
- Madureira

### Competitive Positioning
- vs Wyscout (~$150/mo): a future B2B tier could undercut it, and ScoutMind has the community + fan angle Wyscout lacks. No price is set; no club product exists yet
- vs Fan forums: ScoutMind adds real data, analyst insights, AI recommendations
- vs nothing: Brazilian clubs often have no data infrastructure at all

---

## 18. CRITICAL TECHNICAL RULES

1. **No Python string escaping for HTML** — always use heredoc or direct file write. Python replacing JS strings with HTML inside strings creates nested escaping hell that breaks JS silently.
2. **Div balance** — HTML-only balance (strip scripts first) must = 0
3. **No duplicate function/const declarations** across script blocks
4. **community.html team selection** — uses `_ft` array + `pickTeam(idx)`, never inline string in onclick
5. **Upgrade buttons** — always define `STRIPE_PRO` as a JS variable at top of script, call `goStripe()` function — never inline the URL in HTML onclick attributes
6. **Feed layout** — `.feed-page{grid-template-columns:1fr 300px}`, feed-side must be direct child of feed-page
7. **Modal display** — `display:none` in HTML only, `display:flex` set in JS only
8. **community.html and news.html are separate files** — nav changes must be replicated manually in both
9. **Supabase user_id in badge_applications** — column is nullable, don't send user_id (FK constraint fails with localStorage users)
10. **leagues_data.js must load before init() in community.html** (index.html no longer loads it) — use `if(typeof TEAMS !== 'undefined'){init();}else{window.addEventListener('load',init);}` pattern

---

## 19. THINGS WE EXPLICITLY DECIDED NOT TO DO (YET)

- No real-time data (needs paid API)
- No historical tracking (needs paid API)
- No payments of any kind — Stripe is dormant and nothing references it
- No self-serve API access (B2B enquiries go to hello@scoutmind.app)
- No Google Translate widget (Chrome handles it natively via lang="en")
- No priority support tier (too complex)
- No league requests feature (too complex)
- No rival club monitoring (needs real-time data)
- No pitch to clubs until launch + user base established

---

## 20. *(deleted — next session)*

What to do next is tracked in one place: **"Next, in order"** in the Status
section of SCOUTMIND_SOCIAL_PIVOT_PLAN. As of 23 Sept 2026 that is R5.

---

## 21. FILES TO ATTACH TO THIS PROJECT

When setting up the Claude Project, attach these files alongside this context document:

| File | Why |
|------|-----|
| `app.html` | Main app — most complex file, most work happens here |
| `community.html` | Community page — second most complex |
| `leagues_data.js` | Team/league data — referenced by both app.html and community.html |
| ~~`players_data.js`~~ | Deleted on Day 4 with Scout Mode |
| `auth.html` | Auth page — needs plan selection added |
| `index.html` | Landing page — needs pricing update |
| `news.html` | Transfer news page — needs nav + pricing update |

**Get these files from:** github.com/gomef23-afk/scoutmind (in the `public/` folder)

**Note:** Always download the files from GitHub before starting a session — the GitHub version is the source of truth. The outputs from previous Claude sessions may have been uploaded to GitHub already.

---

## 22. HOW TO START A NEW SESSION

Tell Claude:
> "I'm continuing work on ScoutMind. Read the project context document first. The current files are attached. Today I want to work on: [specific task]."

Claude should:
1. Read this document first
2. Read the specific files needed for the task
3. Ask any clarifying questions before coding
4. Always verify div balance after HTML changes
5. Never use Python string replacement on JS-inside-HTML strings
6. Always write community.html upgrades using `goStripe()` function pattern
