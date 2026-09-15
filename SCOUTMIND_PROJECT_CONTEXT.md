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

- **Frontend:** Pure vanilla HTML/CSS/JavaScript — NO framework, no React, no Vue
- **Hosting:** Vercel (auto-deploys from GitHub on push to main)
- **Database/Auth:** Supabase
- **Payments:** Stripe (test mode as of May 2026)
- **Domain:** scoutmind.app (purchased, not yet connected to Vercel — live at scoutmind-one.vercel.app)
- **GitHub:** github.com/gomef23-afk/scoutmind (public/ folder)
- **Live URL:** https://scoutmind-one.vercel.app

### Supabase Details
- **Project URL:** https://kdhbpzooyjxcglbxbuya.supabase.co
- **Anon Key:** eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkaGJwem9veWp4Y2dsYnhidXlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NTEwNTMsImV4cCI6MjA5MzMyNzA1M30.mcflbqGij3Kzm_Ooe5yMw-fMUBWe25-y6TRiChFuekw
- **Site URL:** https://scoutmind-one.vercel.app (updated from localhost:3000)
- **Redirect URLs:** https://scoutmind-one.vercel.app

### Stripe Details (Test Mode)
- **Account:** gomef23@wfu.edu
- **Product:** Scout Pro — $6.99/mo recurring
- **Price ID:** price_1TTPbD37p1XoJuouR0HQWLbu
- **Publishable Key:** pk_test_51TTBnu37p1XoJuouXfgMHV3TDdlGxo4LPLgkWZ8HnSxhe8Vm6FfjsOIo0fDdObsHn6LepNWdo60ULKhk161ESIuS00fF0Fv6gu
- **Payment Link (test):** https://buy.stripe.com/test_5kQ4gsbY9eW32IQ6rqeME00
- **Success redirect:** https://scoutmind-one.vercel.app/app.html?upgraded=1
- **Status:** Test mode only — NOT live. Will go live after APIs, MEI, and legal are sorted.

---

## 4. FILES IN THE PROJECT

All files live in the `public/` folder on GitHub:

| File | Purpose | Status |
|------|---------|--------|
| `app.html` | Main app — Scout Mode, Feed, Profile | ✅ Fully built |
| `community.html` | Communities page | ✅ Fully built |
| `auth.html` | Login / Signup | ⚠️ Needs plan selection at signup |
| `index.html` | Landing page | ⚠️ Needs pricing update |
| `news.html` | Transfer news standalone page | ⚠️ Needs nav update + pricing |
| `leagues_data.js` | All team/league data | ✅ Working |
| `players_data.js` | Player database | ✅ Working |

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

### `profiles` (existing)
```sql
id UUID (references auth.users)
name TEXT
email TEXT
plan TEXT DEFAULT 'free'  -- 'free', 'pro', 'club', 'clubpro', 'analyst'
credential TEXT           -- e.g. 'ESPN Brasil', 'Licensed Scout' (for analysts)
created_at TIMESTAMP
```

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

**Seeded groups:** Botafogo (3 groups), Flamengo (3), Palmeiras (2)

---

## 7. PRICING (DECIDED)

| Tier | Audience | Price | Key Features |
|------|----------|-------|-------------|
| Scout Free | Everyone | Free | Top 10 player recommendations, weakness analysis, transfer news, read/post in groups, SM Weekly (2 leagues: Série A + Premier League) |
| Scout Pro | Fans, serious followers | **$6.99/mo** | Full player database, unlimited recs, PDF export, all 7 SM Weekly leagues, create polls, create groups |
| Club Basic | Semi-pro clubs, agents | **$49/mo** | Everything Pro + recruitment shortlist, player comparison tool, branded PDF (club logo), 3 account users |
| Club Pro | Pro clubs, full scouts | **$149/mo** | Everything Club Basic + 10 users, API access (contact us), historical tracking (post-launch) |
| Analyst | Journalists/scouts | **Free** (apply only) | Post analyst insights with verified credential badge |

**Pricing decisions made:**
- $6.99 not $9.99 — psychological threshold, Brazilian student market
- Free users CAN post in group chats — drives engagement
- Only poll creation = Pro gate
- Analyst badge = free, manually approved by Felipe in Supabase
- Historical tracking = post-launch (needs paid API)
- API access = "contact us" only, not self-serve
- Club Basic vs Pro: distinguished by user seats (3 vs 10), not more of same features

---

## 8. APP ARCHITECTURE (app.html)

### Pages (CSS class `.page`, toggled with `.active`)
- `#page-scout` — Scout Mode (default on load)
- `#page-feed` — Feed
- `#page-profile` — User Profile

### Nav
Scout Mode | Feed | Communities (→ community.html)

### Feed Tabs
**Transfer news** | **For you** | **SM Weekly** | **Match day**

- **Transfer news:** Transfer Intelligence format, filters (All/Transfers/Rumors/Contracts/Financial/Brazil/Europe), Hot Rumors sidebar, Fit Score Index sidebar
- **For you:** Posts from clubs/analysts you follow (ScoutMind AI + verified analyst posts)
- **SM Weekly:** ScoutMind Weekly Report — 7 leagues, free users see Série A + Premier League, other 5 locked behind blur overlay ("Scout Pro — $6.99/mo")
- **Match day:** User's clubs pinned top with green border + analysis, then all matches grouped by competition tier (UCL > PL > La Liga > Bundesliga > Serie A IT/Ligue 1 > Série A > etc), live first

### Feed Sidebar (sticky right column)
Hot Rumors % | Fit Score Index | Today's Matches | My Clubs

### Scout Mode
- League dropdown (12 leagues)
- Team selector → shows team weakness analysis
- Player recommendations algorithm: scores players on how well they address the team's specific weaknesses (aerial, pressing, passing, goals, possession)
- Free: Top 10 players shown, rest blurred
- Pro: Full database
- PDF export button (Pro only)
- Currency switcher: EUR / USD / BRL / GBP

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

**Gating:** Free = Série A + Premier League in full. Other 5 have blur overlay + "Upgrade to Scout Pro — $6.99/mo"

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

## 12. PLAN DETECTION IN CODE

```javascript
const cu = JSON.parse(localStorage.getItem('sm_current_user') || 'null');
const isPro = cu && ['pro', 'club', 'clubpro', 'analyst'].includes(cu.plan);
const isAnalyst = cu && cu.plan === 'analyst';
const isFree = !isPro;
```

**To approve a user manually:** Supabase → Table Editor → profiles → find by email → set `plan = 'pro'` (or 'analyst') + fill `credential` field for analysts.

---

## 13. STRIPE FLOW (CURRENT — MANUAL)

1. User clicks any "Upgrade" button → opens `https://buy.stripe.com/test_5kQ4gsbY9eW32IQ6rqeME00` in new tab
2. User pays with test card `4242 4242 4242 4242` (test mode)
3. Stripe redirects to `https://scoutmind-one.vercel.app/app.html?upgraded=1`
4. Green banner appears: "Welcome to Scout Pro! Your account will be upgraded shortly."
5. **Felipe manually** goes to Supabase → profiles → finds user by email → changes `plan` to `pro`

**Future:** Stripe webhook to automate step 5 — not yet built.

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

## 16. PENDING / NOT YET BUILT ⚠️

### High Priority (next sessions)
- [ ] **index.html pricing update** — still shows old prices ($9.99, Top 3 players), needs new tier structure
- [ ] **auth.html plan selection** — show Scout Free vs Scout Pro choice at signup so users can go Pro immediately
- [ ] **Profile "Edit name" button** — exists in UI but not wired up
- [ ] **news.html** — still has old nav structure and old $9.99 pricing

### Before Launch
- [ ] **MEI registration** — gov.br/mei, CNAE 6201-5/00
- [ ] **Legal/patent review** — lawyers reviewing
- [ ] **Real stats API** — API-Football, FBref, WhoScored (need budget)
- [ ] **Stripe webhook** — automate plan upgrade after payment
- [ ] **Connect scoutmind.app domain** to Vercel
- [ ] **Stripe live mode** — after MEI + legal

### Post-Launch Features
- [ ] Historical tracking (needs paid API with historical data)
- [ ] Real-time match data API
- [ ] Community groups subscription model
- [ ] Official club logos
- [ ] Club Basic / Club Pro tier implementation in UI
- [ ] Stripe webhook automation
- [ ] Middle tier around $19.99/mo (for serious fans, freelance scouts) — possible future addition

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
4. Only then introduce Club Basic / Club Pro sales pitch

### Pitch Targets (drafted emails ready)
- Sampaio Corrêa
- Madureira

### Competitive Positioning
- vs Wyscout: $150/mo — ScoutMind Club Pro at $149/mo is competitive but ScoutMind has community + fan angle
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
10. **leagues_data.js must load before init()** — use `if(typeof TEAMS !== 'undefined'){init();}else{window.addEventListener('load',init);}` pattern

---

## 19. THINGS WE EXPLICITLY DECIDED NOT TO DO (YET)

- No real-time data (needs paid API)
- No historical tracking (needs paid API)
- No automated Stripe webhook (manual plan upgrade for now)
- No self-serve API access (Club Pro gets "contact us" only)
- No Google Translate widget (Chrome handles it natively via lang="en")
- No priority support tier (too complex)
- No league requests feature (too complex)
- No rival club monitoring (needs real-time data)
- No pitch to clubs until launch + user base established

---

## 20. WHAT TO DO IN THE NEXT SESSION

In order of priority:

1. **index.html** — update pricing section: $6.99/mo Scout Pro, Top 10 free players, add Club Basic ($49) and Club Pro ($149) tiers, update feature lists
2. **auth.html** — add plan selection at signup (Scout Free vs Scout Pro toggle), wire Scout Pro choice to Stripe payment link
3. **Profile edit name** — wire up the "Edit name" button in app.html profile page (input field → update localStorage `sm_current_user.name` → update nav display name)
4. **news.html** — update nav to match other pages, update any $9.99 references to $6.99

---

## 21. FILES TO ATTACH TO THIS PROJECT

When setting up the Claude Project, attach these files alongside this context document:

| File | Why |
|------|-----|
| `app.html` | Main app — most complex file, most work happens here |
| `community.html` | Community page — second most complex |
| `leagues_data.js` | Team/league data — referenced by both app.html and community.html |
| `players_data.js` | Player database — used by Scout Mode algorithm |
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
