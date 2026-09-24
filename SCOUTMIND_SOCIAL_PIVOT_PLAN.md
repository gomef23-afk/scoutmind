# ScoutMind — Social Pivot Master Plan
*Created: September 14, 2026. Last updated September 23, 2026. Companion to SCOUTMIND_PROJECT_CONTEXT — the monetization sections it used to supersede have now been deleted from that document outright.*

---

## STATUS AS OF SEPTEMBER 23, 2026

### Shipped

| Phase | What | State |
|---|---|---|
| **A** | All monetization removed — no tiers, gates, Stripe, blur overlays or upgrade CTAs anywhere | live |
| **B1** | Guest mode (no auth guard; every write opens a sign-in sheet), `about.html`, single entry point — `index.html` **is** the app, `app.html` is a redirect | live |
| **B2** | Five-tab nav (Home · Clubs · Scout · Matches · Profile), top bar on desktop, fixed bottom bar on mobile, written mobile-first. Match Day promoted to `#page-matches` | live |
| **R0** | API-Football schema probe; real payloads committed as test fixtures in `tests/fixtures/api-football/` | done |
| **R1** | Migration `003` — 13 tables, `player_season_rates` view, public-read RLS | applied |
| **R2** | `api/_lib/` — API client (quota-aware, logs exact request URLs) and dependency-free PostgREST helper | done |
| **R3** | Teams, venues and coaches ingested — **146 teams across 7 leagues** | live |
| **R4** | Fixtures, standings and live scores. Standings **146 rows**; Argentina's multi-group tables collapse correctly. Matches page reads Supabase with a static fallback | live |
| **R5** | `/api/cron/fixture-stats` — all 18 stat types per fixture, aggregated into `team_season_stats`. Migration `004`. Self-limiting batches (40 fixtures or 20s) serve backfill and steady state from one job. Backlog at launch: **932 finished fixtures**, ~24 runs | live |
| **R8 + news slice of R9** | `/api/cron/news` — 10 RSS feeds → `news_items`, club-tagged via `team_aliases`. Migration `005`. Home feed renders real news through `renderFeedItem()`. Both fake widgets (Hot Rumors %, Fit Score Index) deleted. Costs **zero** API-Football requests | built, awaiting `005` |

### Infrastructure

- **API-Football Pro** — direct host `v3.football.api-sports.io`, 7,500 req/day, 300/min. All seven leagues active (`leagues.active`). Steady state ~205 req/day (~3%): live 144, fixtures ≤14, standings 7, fixture-stats 20-40.
  *The free tier was abandoned: it serves only seasons 2022-2024 and rejects the `next`/`last` fixture parameters.*
- **cron-job.org** drives `/api/cron/fixtures` (daily), `/api/cron/standings` (daily), `/api/cron/live` (**every 10 min**), `/api/cron/fixture-stats` (every 15 min) and `/api/cron/news` (every 15 min), each authenticated with `CRON_SECRET` via an `Authorization: Bearer` header. Vercel's own cron was not used — the Hobby plan allows only 2 jobs at daily granularity. `/api/cron/teams` is run manually.
- **Season backfill done (23 Sept).** One `/api/cron/fixtures?back=400&ahead=21` run took `fixtures` from 83 to **1,033 rows, 932 finished**, no league paginated. Série A's 300 rows are 30 complete rounds x 10 matches, not an API cap — cross-checked against `standings.played`. Argentina holds **both** Apertura and Clausura (32 distinct round labels, max round 16).
- **Supabase migrations 001, 002, 003 and 004 applied; `005_news.sql` is pending.** `003` carries a SCHEMA PATCHES section so re-running it always brings an existing database up to date. `005` is idempotent and order-independent: its alias seed joins on `teams.api_team_id`, so it can be run before or after the teams job.
- **Vercel env:** `API_FOOTBALL_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (new-format `sb_secret_…`), `CRON_SECRET`. The service key never reaches the browser; the client uses the anon key against public-read tables only.

### Known state to carry forward

- The fixtures window is **-8/+21 days**. It has to be that wide: FIFA's September 2026 international window ran 21 Sept - 6 Oct, sixteen days with no club football, during which a narrower window returns nothing. Not a bug — verified the job's request URL is byte-identical to the probe's.
- **Dropped for good** (API-Football does not provide them): player market value — and with it the budget filter and currency switcher — plus `subpos`, clearances, and aerial-duel split. "Aerial vulnerability" becomes **"Duel vulnerability"** on `duels_won_pct`.
- **Gained**: `expected_goals` and `goals_prevented` per fixture — better signals for "Poor finishing" and "Goalkeeper weakness" than raw shot counts.
- `passes.accuracy` is null for ~95% of players. Team-level pass accuracy is fine (from `fixtures/statistics`), but the player profiles that weight `pass_acc` need reweighting in R6.
- `leagues_data.js` and `players_data.js` are still the live data source for Scout Mode and the weakness engine. They are replaced in R9 and deleted in R10.

**News (R8), carried forward:**

- **Four of the original feed URLs were dead** and are not in the seed. Ten are live: ge, ESPN Brasil, BBC, Sky, Olé, AS, Marca, Gazzetta, kicker, RMC. L'Équipe was dropped by decision, not by failure.
- **Copyright:** headline + ≤300-char snippet + link only. ge's feed carries whole articles, so it is `headline_only` — it is tagged on the snippet and stores none of it. *Legal review item: news snippets from RSS feeds, especially ge.*
- **Tag rate is ~50% and that is the intended trade.** Precision beats recall: an untagged article still appears in the feed, a wrongly tagged one appears on the wrong club's page. Measured on 505 frozen headlines: ge 48/100, Gazzetta 61/99, AS 36/68, Marca 32/49, BBC 26/86, kicker 13/20, ESPN 12/23, RMC 11/30, Olé 10/10, Sky 1/20.
- **Sky Sports is 1/20** — its headlines are mostly player- and pundit-led with no club name. Not a bug; revisit if it stays that low with a bigger sample.
- **Known tagger limits:** an English sentence-start common word can still false-positive (`"Forest fire near the stadium"` → Nottingham Forest). It never fired once across 505 real headlines, so it was accepted rather than patched with guesswork. `"Inter-Milan derby"` tags Inter only, not both clubs — the phrase is genuinely ambiguous and precision wins.
- **Promoted clubs arrive each season with no aliases.** After the teams job ingests a new season, add them to `api/_lib/aliases.js` and regenerate the seed block in `005`.
- **Argentina is neither Brazil nor Europe** in the Home filters, so Argentine items appear only under All News. Decide in B3 whether to add a third region or rename the filters.
- **Club-ID stopgap:** the Home feed's `ALL_CLUBS` slugs predate the football tables, so `CLUB_API_ID` in `index.html` maps 25 slugs to API-Football ids. Replace it when clubs are read from `teams`.
- **News cards have no comment UI.** The old hardcoded stories had one backed by an in-memory store, so a comment looked posted and vanished on reload. It was removed rather than shipped. Comments are Phase C and must go to Supabase, not localStorage (rule 10). The CSS classes (`.comment-section`, `.comment-toggle`, `.comments-body`, `.comment-item`, `.comment-input`) are still in `index.html` for C to render against.
- `news_items` only grows: rule 13 forbids DELETE in `api/`. Prune by hand; the SQL is at the bottom of `005`.

### Next, in order

| # | Work | Notes |
|---|---|---|
| **R6** | Players | ~58 pages per league, ~400 requests. Resumable via `ingest_runs.cursor`. Derives team `tk_pg`/`int_pg`/`duels_won_pct` — the last three nulls in `team_season_stats` |
| **R7** | League averages | Recompute `league_averages` from real data — the weakness thresholds become real |
| **R9** | Front end on real data | Scout Mode and SM Weekly read Supabase. The Matches and news slices are done. **Three engine decisions are queued here — see below** |
| **B3** | Delete `news.html` | Superseded by the Home feed; nothing left to port — the two widgets it shared were invented numbers and are gone |
| **B4** | i18n | `public/i18n.js` with en / pt-BR / es. Split: B4a infrastructure + extraction, B4b translation. ~250-400 strings |
| **F** | Mobile | Invert the remaining desktop-first CSS, then PWA manifest + service worker. *(The feed grid is done — it collapsed to a 75px column at 375px and now stacks below 900px.)* |
| **C** | Social layer | Posts, reactions, comments, follows, notifications, feed algorithm — the actual social network |

R10 (delete `leagues_data.js` / `players_data.js`) follows R9.

### Weakness-engine decisions queued for R9

**The plan previously said R5 unlocks "8 of 12" metrics. That is right for the
displayed stat cards and wrong for the engine.** `detectWeaknesses()`
(`index.html:1260`) builds `st` with 12 metrics but `checks[]` references only
**10** — `yel` and `fouls` are displayed and drive no weakness at all. So R5
unlocks **8 of 12 displayed**, but only **6 of 10 detection inputs**.

| Metric | In `checks[]` | After R5 | Source |
|---|---|---|---|
| `gc` `gs` `pa` `pos` `sh` `sot` | ✅ | ✅ real | R5 |
| `tk` `int` | ✅ | ⏳ R6 | player `tackles.total` / `.interceptions` |
| `aer` | ✅ | ❌ | no aerial split → `duels_won_pct` in R6 |
| `cl` | ✅ | ❌ **permanently** | clearances absent from the API entirely |
| `yel` `fouls` | ❌ display only | ✅ real | R5 |

1. **"GK weakness" and "Defensive errors" both run on `gc` alone after R5, so
   they always fire together.** They were separable only because "Defensive
   errors" also read `cl`, which no longer exists. **Move GK weakness onto
   `goals_prevented`** (real shot-stopping vs xG) in R9 so the two checks
   measure different things again.
2. **"Poor finishing" should compare `gs` against `xg_pg`**, not `gs` against
   the league average. Underperforming your own xG is the actual signal;
   scoring less than average may just mean fewer chances.
3. **"Aerial vulnerability" → "Duel vulnerability"** on `duels_won_pct` once R6
   lands, and `cl` drops out of "Defensive errors" for good.

### Argentina: both tournaments are in the season

Liga Profesional splits into Apertura and Clausura within one calendar season.
Our `fixtures` rows carry rounds labelled `Clausura - 9`, and `standings.played`
reported ~13.4 average against 201 season-to-date fixtures — consistent with
both tournaments counting. **R5 aggregates all of them into one
`team_season_stats` row per team per season.** That is the right default for a
weakness engine, which wants the largest honest sample.

**R9 decision:** whether Scout Mode should show Apertura and Clausura form
separately for Argentine clubs, and whether the league-average baselines in R7
should be split per tournament. Splitting would need a `tournament` dimension on
`team_season_stats` and `league_averages` — deferred until someone asks for it.

### Launch checklist — non-code
*Carried over from context doc Section 16, which has been deleted.*

| Item | State |
|---|---|
| **MEI registration** — gov.br/mei, CNAE 6201-5/00 | ⚠️ still open. Needed once any money flows; nothing is charged today |
| **Legal / patent review** | ⚠️ still open, with the lawyers |
| **Real stats API** | ✅ done — API-Football Pro |
| **scoutmind.app connected to Vercel** | ✅ done |
| **Real-time match data** | ✅ done — `/api/cron/live` |
| **Official club logos** | ✅ done — `teams.logo_url` from the API, not yet shown in the UI |
| **Historical tracking** | now possible on Pro; not scheduled |
| **Terms + Privacy pages** | ⚠️ still `showLegal()` modals on `about.html`; real pages needed before public launch (Phase G) |
| **Account deletion path** | ⚠️ not built. Required by LGPD |
| **Profile name changes persist** | ⚠️ `saveName()` writes localStorage only — the change is lost on another device. Needs a `profiles` update (Phase C5) |
| **Stripe live mode / webhook / Club tiers / middle tier** | ❌ dropped. Fans never pay for social features; Stripe stays dormant |

---

## 0. THE PIVOT IN ONE PARAGRAPH

ScoutMind stops being "a scouting tool with a community tab" and becomes **THE social network for football**. Everything is free. Every feature already built (Scout Mode, SM Weekly, Transfer Intelligence, Match Day, Communities, Analyst Insights, Polls, Wishlist) stays — but they stop being *destinations* and become *content engines* that feed one social loop: open the app → see what's happening with your club → react, post, argue → come back tomorrow. Monetization is deferred and will come from audience (ads/sponsorship, club/brand partnerships, and a future pro/club product) — not from gating fans.

---

## 1. GOALS

### North-star metric
**Weekly Active Users who take a social action** (post, comment, react, vote, follow). Not signups. Not page views.

### Launch definition ("officially launched")
- Site fully usable on desktop AND phone (real responsive layout, not desktop-squeezed)
- Installable as an app on phones (PWA) — see Section 7
- Zero references to Free/Pro/Club/subscriptions anywhere
- A user can: sign up in < 60 seconds → pick club → see a full feed immediately → post → follow → get a notification
- scoutmind.app domain live
- Analytics tracking the north-star metric

### First 90 days targets (set them, then adjust)
- 500 signups → 150 weekly active → 40 daily active
- 10 verified analysts posting
- 1 team community with genuinely active daily chat (probably Botafogo — start where the founder is)

---

## 2. THE CORE LOOP (what makes it social, not a tool)

```
TRIGGER  →  ACTION  →  REWARD  →  INVESTMENT
```

| Stage | What it means for ScoutMind |
|---|---|
| **Trigger** | Match today · transfer rumor about your club · someone replied to you · SM Weekly dropped · your club's poll is closing |
| **Action** | Open feed, react, comment, vote, post a hot take, share a Scout Mode result |
| **Reward** | Reactions on your post · seeing your club's community argue · Fit Score reveal on a rumor · match-day pinned analysis · being right on a prediction |
| **Investment** | Follow clubs/people · build your squad · make predictions · earn badges · post history/profile grows |

Every feature below should map to at least one stage. If it doesn't, it's not launch-priority.

---

## 3. PHASE A — REMOVE MONETIZATION (Day 1–2) ✅ DONE

Everything here is deletion/simplification. Do it first — it unblocks all other work and removes the biggest source of code complexity.

### Code changes
- [x] `app.html`: set `isPro = true` for everyone (or remove the check entirely); delete blur overlays on Scout Mode player list, SM Weekly leagues, PDF export gate
- [x] `app.html`: remove all Upgrade buttons, `STRIPE_PRO` constant, `goStripe()`, the `?upgraded=1` welcome banner handler
- [x] `community.html`: remove Pro gates on create poll, create group, suggest wishlist player; remove upgrade buttons/`goStripe()`
- [x] `index.html`: delete Pricing section entirely; delete "Pricing" nav link; delete pricing FAQ items (free trial, cancel anytime, "Scout Pro subscribers get access…"); replace plan labels on the "For who" cards
- [x] `auth.html`: no plan selection needed anymore — signup = name, email, password, club (see Phase D onboarding)
- [x] `news.html`: removed the auth guard; the paywalled duplicate at `public/public/news.html` was deleted. Full removal is B3
- [x] Supabase `profiles.plan`: keep the column but repurpose → `role` semantics: `'fan'` (default), `'analyst'`, `'admin'`. Stop reading `'pro'/'club'/'clubpro'` — migration `001`
- [x] Remove `Club Plan / Scout Pro / Club Pro` labels everywhere in copy

Also removed while here: the unused API-Football proxy at `api/football.js`,
which had a **RapidAPI key committed in plaintext** on an open CORS proxy. Key
rotated; the replacement reads `API_FOOTBALL_KEY` from Vercel env.

### Keep (don't delete)
- Stripe account — dormant, may be reused later for club/brand products
- Analyst badge application flow — this becomes MORE important, not less (see Phase E)
- PDF export — now free; it's a shareable artifact (people post their scouting reports)

---

## 4. PHASE B — RESTRUCTURE THE SITE (Day 2–3)
*Product decisions below are final as of Sept 2026 and supersede the earlier draft of this section.*

### Guest mode (decided)
scoutmind.app opens directly into the Home feed for everyone — logged in or not.
There is no redirect-to-auth guard on any page.

- **Guests can read everything:** feed, club pages, Scout Mode, matches, analyst
  insights, polls and group messages.
- **Every write action opens a sign-in sheet**, not a redirect:
  post · comment · react · vote · follow · create poll · create group · send group
  message · suggest wishlist player · apply for badge · set main club · edit profile.
  Copy: *"Create a free account to join the conversation."*
- Badge applications are gated too, so every application is tied to an account
  that the badge can actually be granted to.
- **Guests never read `profiles` directly.** It holds email addresses. Public
  profile data (name, plan, credential) is served by the `public_profiles` view;
  only the signed-in user's own row is read from `profiles`. See
  `002_public_read.sql`.
- **Top right:** Sign in button for guests; avatar for logged-in users.

Rationale: a social network that demands signup before showing anything has no
top of funnel. Reading is the hook; the account is the investment step.

### Single entry point (decided)
- `index.html` **is the app.** The old landing content moves out wholesale.
- `about.html` is new and holds the former landing page: hero, how it works,
  for who, FAQ, the "for clubs" band, and the Terms/Privacy modals.
- `app.html` becomes a redirect to `/` so existing links and bookmarks survive.
- `news.html` is deleted; `/news.html` redirects to `/?filter=transfers`.

### Five-tab navigation (decided)
Every page carries the same five tabs — **Home · Clubs · Scout · Matches · Profile**
— rendered as a top bar on desktop and a fixed bottom bar on mobile.

| Tab | Icon | Built from |
|---|---|---|
| **Home** | 🏠 | `#page-feed` — the social feed, default landing |
| **Clubs** | ⚽ | `#page-communities` + `community.html` |
| **Scout** | 🔍 | `#page-scout` |
| **Matches** | 📅 | the Match day feed tab, promoted to a top-level page |
| **Profile** | 👤 | `#page-profile` |

Top-right, on every page: **Sign in / avatar**, a small **About** link, and the
**language switcher**. Transfer news and SM Weekly remain feed content types, not tabs.
Notifications (🔔) join the top bar in Phase C6.

### Languages (decided)
- Every UI string in every page lives in one `public/i18n.js` dictionary.
- Three languages at launch: **en**, **pt-BR**, **es** — fully translated.
- Default from `navigator.language`; the user's choice persists in localStorage
  (a UI preference, so rule #12 permits it).
- **Content data stays English for now** — weekly reports, news items, player and
  team data. Browser translation covers the rest, so keep `lang` attributes
  accurate and update `<html lang>` when the switcher changes.

### Nav consistency rule
Nav is duplicated across `index.html`, `community.html` and `about.html`. Any nav
change must be applied to all three (was rule #8; `news.html` no longer applies).

---

## 5. PHASE C — BUILD THE SOCIAL LAYER (Day 3–6, biggest chunk)

This is the real work. Listed in build order; each item is a Supabase table + UI.

### C1. User posts (must-have)
- Table `posts`: `id, user_id, user_name, user_avatar, club_id, content TEXT, post_type ('text'|'scout_share'|'poll'|'prediction'), attachment JSONB, reaction_counts JSONB, comment_count INT, created_at`
- Compose box at the top of Home ("What's happening with [your club]?")
- Post types at launch: text, and **Scout Share** (one-click "post this to feed" from a Scout Mode result — a card with team, weakness, top 3 players + fit %). This is ScoutMind's unique post type — nobody else can generate it.
- Character limit ~500. Optional club tag.

### C2. Reactions + comments (must-have)
- Reuse existing 🔥👏🤯 reaction system from analyst_posts; add 👎 or keep positive-only (recommend positive-only at launch — less toxicity, less moderation)
- Table `comments`: `id, post_id, user_id, user_name, content, created_at`
- Table `reactions`: `id, post_id, user_id, type, created_at` (unique on post_id+user_id+type) — needed so users can't spam-react; do NOT rely on JSONB counters alone
- Comments load inline under post, collapsed after 2

### C3. Follow system (must-have)
- Table `follows`: `follower_id, following_id, following_type ('user'|'club'), created_at`
- Follow clubs (already partly exists as `sm_following_clubs` in localStorage → move to Supabase) and follow users
- Follower/following counts on profile

### C4. Home feed algorithm (must-have, keep it simple)
Feed = union of, sorted by recency with light pinning:
1. Posts from users you follow
2. Posts tagged with clubs you follow
3. ScoutMind AI posts for your clubs (news, weekly report snippets, match-day)
4. Analyst posts for your clubs
- Filters at top: **All · My Clubs · Transfers · Analysts · Match Day**
- Pinned to top on match day: your club's match card with prediction buttons
- Empty-state must NEVER be empty: if a user follows nothing, show Série A + Premier League AI content

### C5. Public profiles (must-have)
- `/profile.html?u=<id>` or in-app page
- Shows: name, club badge, bio, join date, posts, followers/following, predictions record (once C7 exists), analyst badge if any
- "Edit name" button finally gets wired (existing pending item) + add bio + avatar (Supabase Storage or emoji/initials avatar to avoid file uploads at launch)

### C6. Notifications (must-have, minimal)
- Table `notifications`: `id, user_id, type ('reaction'|'comment'|'follow'|'mention'|'match'|'poll_result'), actor_name, ref_id, read BOOLEAN, created_at`
- Bell icon with unread count; list view; mark read on open
- Poll every 15s (same pattern as group chat). Real-time subscriptions later.
- No push notifications at launch (needs native or complex PWA setup) — but design so it's addable

### C7. Predictions (high-value, do if time allows in week 1, otherwise week 2)
- On each Match Day card: predict score or winner before kickoff
- Table `predictions`: `user_id, match_id, home_score, away_score, created_at`
- Profile shows record (W/L, streak). Club community shows "fans predict: 62% win"
- This is the single strongest daily-return hook — matches happen every day somewhere

### C8. Move localStorage → Supabase (must-have for multi-device)
- Polls and Transfer Wishlist currently live in localStorage (`sm_comm_{teamId}`) — meaning every user sees a different version. A social network cannot work this way.
- Tables `polls`, `poll_votes`, `wishlist_items`, `wishlist_votes`
- `sm_main_club`, `sm_following_clubs` → `profiles.main_club` + `follows` table

### C9. Moderation basics (must-have before public launch)
- Report button on posts/comments → table `reports`
- Admin flag in profiles (`role = 'admin'`) that reveals delete buttons for Felipe
- Simple banned-words filter client-side + Supabase RLS so users can only delete their own content
- Terms + Privacy pages (currently `#` links in footer) — required before real users

### Supabase RLS reminder
Every new table needs Row Level Security: anyone can read, only authenticated users insert, only owner (or admin) updates/deletes. Without this any user can delete anyone's posts via the anon key.

---

## 6. PHASE D — ONBOARDING & "GETTING PEOPLE TO USE IT" (Day 5–6)

First session decides everything. Target: signup → useful feed in under 60 seconds.

- [ ] Signup: name, email, password (Google login later)
- [ ] Step 2: **Pick your club** (visual grid, Série A first for BR traffic, search for others)
- [ ] Step 3: **Follow 3+ more** — suggest rivals, big European clubs, and 5 analysts/active users
- [ ] Land on Home with feed already full (AI content + analyst posts for chosen clubs)
- [ ] First-post nudge: "Your first hot take about [club]?" with a pre-filled prompt
- [ ] Profile completion bar (club ✓, bio, avatar, first post, first follow) — cheap, effective
- [ ] Onboarding in PT-BR when browser language is pt — Brazilian fans are Phase 1

---

## 7. PHASE E — CONTENT ENGINE / COLD START (ongoing, start Day 1)

A social network with no posts is dead on arrival. ScoutMind has an unfair advantage: it can *generate* content. Use it.

### Automated "ScoutMind" account posts (ScoutMind AI as a verified account)
- Daily: transfer rumors with Fit Score (already exists as Transfer Intelligence — turn each item into a post)
- Match days: pre-match analysis card + post-match verdict for followed clubs
- Weekly: SM Weekly report split into 4 posts per league (Biggest Mover, Weakness Alert, Most Needed Position, Deep Dive) — all 7 leagues, no gating
- Provocations: "Botafogo's biggest weakness is aerial duels. Agree?" with an attached poll → drives comments
- Content is still hardcoded/static for now (no API budget) — that's fine for launch, but needs a weekly manual refresh routine until API is affordable

### Human content
- Recruit 5–10 analysts before launch (journalists, tactics accounts, licensed scouts) — badge is free, offer them a verified profile + audience
- Felipe posts daily as founder (Botafogo takes) — founder-led communities work
- Seed 2–3 team groups with real conversation before opening (Botafogo, Flamengo, Palmeiras already seeded as groups — now need messages in them)

---

## 8. PHASE F — MOBILE + APP (Day 4–6)

### Responsive (must-have)
- Audit every page at 375px, 390px, 430px widths
- Bottom tab bar on mobile (Home · Clubs · Scout · Matches · Profile)
- Feed sidebar (Hot Rumors / Fit Score Index / Today's Matches) collapses into horizontal scroll cards above the feed on mobile
- Scout Mode: player cards stack; league/team selectors become full-width dropdowns
- Group chat overlay already full-screen — verify keyboard behavior on iOS
- Touch targets ≥ 44px; no hover-only interactions

### PWA (must-have — this is "the app" for launch)
- `manifest.json`: name, short_name, icons (192, 512), theme_color `#07090f`, display `standalone`, start_url `/app.html`
- Service worker: cache shell (HTML/CSS/JS/fonts), network-first for Supabase
- "Add to Home Screen" prompt banner after 2nd visit
- Apple: `apple-touch-icon`, `apple-mobile-web-app-capable` meta tags
- Result: installable on iOS/Android from the browser, full-screen, app icon — no App Store needed

### Native app (NOT this week)
- Path when justified: wrap the PWA with Capacitor → App Store + Play Store. Same codebase. Needed mainly for push notifications and store discoverability. Requires Apple Developer ($99/yr), Google Play ($25 once), and review time. Revisit at ~1,000 users.

---

## 9. PHASE G — LAUNCH INFRASTRUCTURE (Day 6–7)

- [ ] Connect **scoutmind.app** to Vercel; update Supabase Site URL + redirect URLs to the new domain
- [ ] Analytics: Vercel Analytics (free) + custom events into a Supabase `events` table (signup, post, react, comment, follow, predict, session) — this is how the north-star metric is measured
- [ ] Error monitoring: at minimum `window.onerror` → Supabase `errors` table
- [ ] Terms of Service + Privacy Policy pages (LGPD basics for Brazil: what data, why, how to delete account)
- [ ] Account deletion path (required by LGPD and by Apple later)
- [ ] Open Graph / Twitter card meta tags so shared posts look good on WhatsApp/X/Instagram
- [ ] Shareable post URLs (`/p/<post_id>`) — every post is a growth channel
- [ ] Favicon + app icons
- [ ] Update `SCOUTMIND_PROJECT_CONTEXT.md` to reflect all of the above (new tables, removed Stripe flow, new IA, new rules)
- [ ] Deferred but still needed: MEI registration (still required once any money flows), legal review

---

## 10. RETENTION MECHANICS — "APPEALING & ADDICTIVE" (honest version)

Ranked by impact. Things that give people a **real** reason to come back beat things that just ping them.

| # | Mechanic | Why it works | When |
|---|---|---|---|
| 1 | **Match-day predictions + streaks** | Matches happen daily; being right is satisfying; streaks create loss aversion | Week 1–2 |
| 2 | **Your club's feed, pinned to your identity** | People return for *their* club, not for "football" — main club drives everything | Week 1 |
| 3 | **Reactions/comments notifications** | Social validation loop — the one that every network runs on | Week 1 |
| 4 | **Scout Share posts** | Unique to ScoutMind; gives fans a "smart" artifact to post and argue over | Week 1 |
| 5 | **Hot Rumor of the day with fan vote ("Will it happen?")** | Daily ritual + resolution later (rumor confirmed/denied → notify voters) | Week 2 |
| 6 | **Polls that close** (24h) with result notification | Deadline + closure = two triggers per poll | Week 2 |
| 7 | **Rivalry mechanics** | Botafogo vs Flamengo prediction battles, "which fanbase called it" — Brazil runs on rivalry | Week 3+ |
| 8 | **Analyst content + verified badge** | Gives the feed credibility and gives analysts a reason to bring their own audience | Week 1 (recruit), ongoing |
| 9 | **Leaderboards** (predictions, most 🔥 this week, per club) | Status | Week 3+ |
| 10 | **Daily "ScoutMind Verdict"** post per followed club | Consistent daily content even when nothing happens | Week 2 |

Deliberately NOT doing: infinite scroll dark patterns, fake engagement counts, notification spam, "X people are talking about you" bait. Trust is the asset; Brazilian fans are savvy.

---

## 11. MONETIZATION (deferred — but design for it now)

Nothing is charged at launch. Paths that stay open, in order of likelihood:
1. **Sponsored posts / native ads** in feed (needs ~10k WAU to be worth anything) — leave a slot in feed layout every ~8 posts
2. **Brand & club partnerships** — club-official groups, sponsored polls, betting-adjacent partners (careful: legal in Brazil since 2025 regulation but reputationally sensitive)
3. **ScoutMind for Clubs** — the original Club Basic/Pro product resurrected as a separate B2B pitch once the fanbase exists ("we have X active fans of your club")
4. **Analyst tools / pro tier** — much later, and only for features fans never had (API, exports at scale)

Rule: fans never pay for social features. Ever. Say it in the manifesto.

---

## 12. WEEK-1 PRIORITY ORDER (what to actually do, in order)

| Day | Focus | Files |
|---|---|---|
| 1 | Phase A — strip all monetization; Supabase schema for posts/comments/reactions/follows/notifications (write SQL, run in Supabase) | app.html, community.html, index.html, auth.html, news.html, Supabase |
| 2 | Phase B — new 5-tab nav on all pages; index.html rewrite; onboarding club-pick in auth.html | index.html, auth.html, app.html, community.html |
| 3 | C1 + C2 — post composer, feed rendering of user posts, reactions, comments | app.html |
| 4 | C3 + C4 + C5 — follows, feed algorithm with filters, public profile, edit name/bio | app.html, new profile page |
| 5 | C6 + C8 — notifications; move polls/wishlist to Supabase | app.html, community.html |
| 6 | Phase F — responsive audit + bottom nav + PWA manifest/service worker | all pages + manifest.json + sw.js |
| 7 | Phase G + C9 — domain, analytics, terms/privacy, report/delete, seed content, final QA on real phones | all |
| Week 2 | C7 predictions, rumor votes, closing polls, Scout Share polish, native app decision |  |

This is aggressive for one person. If something slips, slip Day 5 (notifications can poll-check on next visit) and Day 7's seed content can happen in parallel with launch. Do NOT slip responsive/PWA — "mobile" is half the launch definition.

---

## 13. NEW TECHNICAL RULES (add to context doc Section 18)

11. Every new Supabase table gets RLS enabled before any UI touches it
12. No social data in localStorage — only session/UI preferences. Anything another user should see lives in Supabase
13. All feed items (user post, AI post, analyst post, news item, match card) render through ONE `renderFeedItem(item)` function with a `type` switch — no separate renderers per tab
14. Mobile-first CSS: write base styles for 375px, `@media (min-width: 900px)` for desktop — not the reverse
15. `manifest.json` and `sw.js` live at `/public/` root; bump the cache version string on every deploy or users get stale files

---

## 14. OPEN DECISIONS (answer before Day 1)

- [ ] Positive-only reactions at launch (recommended) vs include 👎
- [ ] Fold `news.html` into `app.html` as a feed filter (recommended) vs keep separate
- [ ] Avatars: initials/emoji at launch (recommended, no uploads) vs Supabase Storage uploads
- [ ] Launch language: EN only, PT-BR only, or both (recommended: UI in EN with PT-BR onboarding + AI posts in PT-BR for Brazilian clubs)
- [ ] Predictions in Week 1 or Week 2
- [ ] Who are the first 5 analysts to invite — names needed
- [ ] Does "ScoutMind" the AI account post as a user in the same feed (recommended) or stay a separate content type
