# ScoutMind — Design spec v1.2 "Scoreboard" (16 Nov 2026)

> **v1.2** (16 Nov, Felipe's decisions on Claude Code's plan): contrast fixes in the token table (dark navy text, chip and category colours, light muted, LIVE on the band), no notifications bell, no "Club" pill, tab "Rooms" on phone and laptop, slot fallbacks as built, crest tile rules, no "average" and no ScoutMind rating, emoji become line icons, theme default dark until commit 4b. Sections 1, 4, 5, 6, 7 and Open items are updated below; the values in `public/theme.css` are the source of truth and `tests/theme.test.js` checks them against this table.

The identity chosen for Sequence 2. Source mockups: canvas "ScoutMind Home — D2 direction", boards **F1 · Scoreboard band** (phone) and **F1 · Desktop**. Background research: `claude/DESIGN-RESEARCH-COLOUR-2026-11.md`.

## How we got here
- Round 1 vote (10 friends): A 3 · D 3 · C 2 · B 1 · E2 1 · E1 0. Light, clean, content-coloured styles won; "colour by meaning" and the paper look lost.
- D as drawn was too close to OneFootball and was withdrawn. D2 rebuilt it in ScoutMind's own terms; F1/F2/F3 varied the top and the news.
- Decision (Felipe, 16 Nov): **F1 "Scoreboard band" on phone and laptop.** Round 2 friends' vote runs as a sanity check only.
- v1.1, same day, after Claude Code's review of the repo: real fonts are DM Sans + a condensed number face (Inter/Oswald were mockup stand-ins); no "online" count (no presence tracking); news photos handled by the three-source rule in §6 and an amended rule 17.

## The idea in one line
A navy band at the top answers three questions in big scoreboard numbers — where is my team, when do they play, when does the round close — and everything else sits on a calm light sheet where crests and photos bring the colour.

## 1. Colour tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--navy` | `#12304F` | `#16365A` | Band, wordmark, primary button, active tab/chip text |
| `--ground` | `#F6F7F9` | `#0F141B` | Page background |
| `--card` | `#FFFFFF` | `#1A2029` | Cards, bottom bar |
| `--border` | `#E6E9EF` | `#2A323E` | Hairlines, card borders |
| `--ink` | `#13203A` | `#EEF1F5` | Text |
| `--muted` | `#677082` (v1.2; was `#6C7689`, 4.27:1 on ground) | `#9AA5B5` | Secondary text |
| `--tint` | `#E6EEF8` | `#1F2E42` | Active chip background |
| `--gold` | `#FFD166` | `#FFD166` | Countdown number on navy only; captain "C" |
| `--win` | `#1A8548` | `#2FA865` | Positive text and marks |
| `--loss` | `#D7263D` | `#E5485D` | Negative marks |
| `--draw` | `#6C7689` | `#6C7689` | D chip |
| `--navy-ink` (v1.2) | `#12304F` | `#A9C7EA` | Navy used as **text or a line** (active chip/tab text, links, the wordmark on a card). Navy text on dark surfaces measured 1.1–1.3:1; `--navy` stays the fill |
| `--on-navy` (v1.2) | `#FFFFFF` | `#FFFFFF` | Text on a navy fill |
| `--chip-win` / `--chip-loss` / `--chip-draw` (v1.2) | `#1A8548` / `#D7263D` / `#6C7689` | same | W/L/D chip fills with a white letter. The dark `--win`/`--loss` measured 3.0 and 3.9:1 under white |
| `--loss-ink` (v1.2) | `#D7263D` | `#E85C6F` | LIVE and error text on cards (dark `--loss` measured 4.22:1) |
| `--live-on-band` (v1.2) | `#E77B89` | `#ED8391` | The word LIVE on the navy band (`--loss` measured 2.71:1 there) |
| `--field` (v1.2) | `#F4F6F9` | `#222A35` | Inputs |
| `--border-strong` (v1.2) | `#CDD3DD` | `#3A4452` | Hover and emphasis lines |
| `--scrim` (v1.2) | `rgba(7,12,20,.72)` | `rgba(0,0,0,.72)` | Behind sheets and modals |

News category label colours (text on card, always next to the word): Transfer `#1D4ED8` · Suspension/Injury `#D7263D` · Interview `#0B7C7A` · Preview/Match report `#1A8548`. Dark mode (v1.2): Transfer `#6A8AE5` · Suspension/Injury `#E26373` · Interview `#419997` · Preview/Match report `#489D6D` (all ≥ 4.86:1 on dark `--card`). Every pair the app uses is listed with its ratio in `tests/theme.test.js`.

Rules:
- Navy is the only brand colour. No second accent. Gold appears only on the navy band and the captain badge.
- Colour never carries meaning alone: W/D/L are letters in chips, LIVE is a word, captain is "C", categories are words.
- All text ≥ 4.5:1 against its background, including 10–11px labels. (The mockups' green `#22A35A` and teal `#0E8C8A` fail on white; the values above are the corrected ones.)
- The club's own colour appears only as its crest. No club-coloured cards or buttons (tested and rejected). **One exception (v1.2): the one-club news tile (§6)** may carry a light tint of the club's colour behind the crest, because there it is content, not chrome.
- Dark mode: ground is charcoal, never `#000`; the band is a lighter navy so it still reads as a band. Profile → Preferences offers System / Light / Dark. **Default (v1.2): DARK for everyone with no saved choice until Sequence 2 commit 4b** (the screens are converted one commit at a time), **then it follows the device** (`prefers-color-scheme`).

## 2. Type
- **Numbers and the wordmark:** a condensed face with lowercase and tabular figures. Used for kick-off times, countdowns, scores, points, table positions, ranks. This is the signature — every number a fan cares about is set in it. **Decision: add Barlow Condensed 600 + 700** (OFL, self-hosted, latin + latin-ext, about 40 KB per weight pair), after confirming inside the files that they carry tabular figures; if they do not, propose the nearest condensed face that does. Not DM Mono: a monospace reads as code, not as a scoreboard. Bebas Neue is removed once nothing uses it.
- **Everything else:** **DM Sans** (already vendored, variable 300–700). Headlines 700 with −0.02em tracking; body 400–500; labels 10–11px, 700, uppercase, +1.2px tracking. The mockups were drawn in Inter and Oswald; DM Sans and Barlow Condensed are the real faces.
- Sizes (phone): band numbers 26px; screen titles 22px; card headlines 16–17px; body 13px; meta 11–12px; labels 10px. Laptop: band numbers 38px; hero headline 22px.
- Fonts are self-hosted in `public/vendor/fonts/` and precached (PWA rule).

## 3. Shape and spacing
- Cards: `--card` background, 1px `--border`, radius 12px, no shadows. The light sheet under the band has 18px top corners and overlaps the band by 22px.
- Buttons: primary = navy fill, white text, 800 weight, radius 8px, min height 44px on touch. On the band: white fill, navy text.
- Chips: height 32px, radius 999px, white with border; active = `--tint` fill, navy text, no border.
- Result chips: 18–20px square, radius 4px, white 800 letter.
- Spacing scale 4/8/12/16/24. Page gutter 16px phone, 40px laptop.
- Icons: 2px stroke line icons; active tab = navy icon + 3px navy bar above it.

## 4. Home — phone (390 wide)
Order, top to bottom:
1. **Band** (navy): wordmark · search · avatar (the avatar opens Profile). Then crest (46px, white disc) + club name (22px/800) + last-5 form chips. Then three slots separated by hairlines. *(v1.2: no notifications bell — the app has no notifications to show; no "Club" pill — there is no club page yet.)*
2. **Sheet** (light, rounded top): picks row (stacked avatars with captain "C", "Your 5 are in", captain line, **Edit picks**).
3. Room line: chat icon, room name, follower count (`club_chat_overview.member_count`), last message preview, "Open". **No "online" count**: the app has no presence tracking and none is being built for this.
4. "News" + filter chips (For you · Top · club · Transfers …).
5. Lead news card: visual on top (132px, see §6), then category label · source · age, then headline **under** it, then comment count when > 0.
6. Following news: 56px visual left (see §6), label line + headline right.
7. Bottom bar: Home · Clubs · Scout · Matches · Rooms (v1.2: Rooms is a small screen listing the rooms of your clubs, from `club_chat_overview`; Profile opens from the avatar). Icons are inline-SVG line icons (Tabler, MIT, self-hosted), never emoji.

### The three band slots — state rules
Each slot = 10px label, big number, one 11px line. Slots never show invented data; if a slot has nothing true to say it shows the fallback, not a placeholder.

| Slot | Normal | Other states |
|---|---|---|
| 1 Table | "TABLE" · `11th` · "42 pts" | League split into groups (Argentina) → the club's rank **within its group**. No standings row for the club → hidden and the other two widen. *(v1.2: every club we carry is in a league with a table, so "rank in the user's main league" never applies.)* |
| 2 Match | "NEXT" · `16:30` · "Sat · vs Palmeiras" | Live → "LIVE 64'" · `2–1` · opponent · Finished today → "FULL TIME" · `1–0` · opponent · No fixture scheduled → "NEXT" · `—` · "No match scheduled" |
| 3 Round | "ROUND 35 CLOSES" · `1d 04h` (gold) · "3rd in <league>" | Locked, matches running → "ROUND 35 LIVE" · points **from fixtures already scored**, else `—` with "points after full time" (points arrive a few hours after full time) · Final → "ROUND 35" · `<points>` · rank · No open round → "NEXT ROUND" · the next round's first kick-off date when its fixtures are known, else `—` · "No round scheduled" *(v1.2: rounds open the moment they exist, so there is no "opens in")* · User has no picks yet → same countdown, line reads "No picks yet" and the sheet row becomes **Pick your 5** |

Every slot reserves two label lines, so the three numbers stay aligned when a Portuguese label wraps.

No club followed → the band shows the existing "choose your club" nudge instead of the crest row, and slots 1–2 are hidden.

Scout Game copy rules still apply everywhere: points only, never money words.

## 5. Home — laptop (≥ 1100px)
- Band spans the full width: top row = wordmark, tabs (Home · Clubs · Scout Game · Matches · Rooms — v1.2, same name as on phone), search, avatar. Second row = crest + name + form on the left, the three slots (38px numbers) in the middle, picks avatars + **Edit picks** on the right.
- Below: three columns, 300 / fluid / 320, 24px gaps.
  - Left: Your leagues · Your captain / picks summary (this column must not be half empty — move picks detail here).
  - Centre: News header + chips; lead card (visual, headline under) beside two stacked secondary cards; then thumbnail rows.
  - Right: room (last 3 messages + input, follower count) · Today's matches · table slice centred on the user's club.
- 700–1099px: two columns (centre + right), left column content moves under the band as a row.

## 6. News visuals
Every news card has one **visual slot**. What fills it is decided per item, in this order. The layout is identical whichever source fills it.

1. **Publisher's own image, hot-linked (source A) — built now, switched OFF.** The image URL the publisher puts in its feed, loaded from the publisher's server, never downloaded, stored, resized or proxied by us. Always shown with the publisher's name and a link to the article. Controlled by one global switch plus a per-source switch; both default to off. It stays off until the lawyer answers the question in Open items. A source can be turned off individually, and an item's image hidden, without a deploy (takedown path).
2. **Images we are entitled to use (source B) — ON from day one.**
   - Player headshot from API-Football when the item is tagged to a player we hold a photo for.
   - Free-licence photo (Wikimedia Commons: CC BY, CC BY-SA, CC0, public domain only) for a tagged player, club or stadium, with the author and licence shown as a small credit on the card and stored with the image reference. Fetched and reviewed by a script into a curated table; never looked up live at request time, never "fair use" or unlicensed files.
3. **Crest tile (always available, and the visual most cards show at launch — designed as a first-class tile, not a fallback).** Every crest sits on a white disc so dark crests stay visible in both modes. v1.2 rules:
   - **Lead card:** `--navy` tile, whatever the case below.
   - **One club:** a light tint of the club's colour behind the crest (about 15% in light, 25% in dark), read from the crest in the browser; `--tint` when the colour cannot be read or is near white/black. News tiles only — nowhere else takes a club colour.
   - **Two clubs:** `--tint` tile, the two crests overlapping, the club named first in the headline on the left. **No split of the two clubs' colours** (that is the component D was withdrawn for).
   - **Three or more:** `--tint` tile, the first two crests overlapping plus a "+N" chip.
   - **No club tagged:** `--tint` tile with the source's name set in the condensed face. Never the publisher's logo. (Leagues carry no logo, only a flag emoji, which §8 rules out — so no "competition mark".)

Category labels (v1.2), from the tagger's categories: transfer and contract → **Transfer**; rumour → **Rumour** (transfer colour); match → **Match**; general → no label. Suspension/Injury and Interview appear only once the tagger can tell them; preview and match report cannot be told apart today.

Rules:
- **Rule 17 is amended** (Felipe, 16 Nov 2026): from "no article images" to "article images are never stored or proxied; they may be hot-linked from the publisher only when the source switch is on, always with credit and link; anything else on a card must be an image we are entitled to use, with its credit." Claude Code to update the rule text wherever the rules live.
- Never an empty rectangle, never a stock or generated image, never a photo of the wrong person: a headshot is used only on an exact player tag.
- Publisher name always visible in the meta line. Category label only when the tagger assigned one.
- A broken or blocked image falls back to the crest tile silently.

## 7. Applying it beyond Home
Same tokens, type and shapes on every screen; each screen gets one band-style header where a number matters:
- **Scout Game:** band = countdown (gold), season rank, round. Picks list rows: position label, photo, name, opponent line, the **real** tier chip (`T1 ×1.00` … `T5 ×1.40`; unranked `×1.40` — the ladder in `game_config`), and **the player's points once the round is scored**, in the scoreboard face. Nothing else (v1.2: no "average" — none is defined). Captain = navy disc with gold "C". Sticky **Save picks**.
- **Match detail:** band = crests, score in 44px scoreboard face, status line. Events with icons/letters, not colour. *(v1.2: no "ScoutMind rating" — we hold none. API-Football's rating keeps its normal style, credited to API-Football.)*
- **Clubs / Matches / Profile / Rooms:** light header (no band), same cards, chips and number face.
- **Emoji (v1.2):** replaced screen by screen with inline-SVG line icons (Tabler, MIT, self-hosted) in commits 2–4; league flags become the league's name as text.
- Auth, privacy, terms, offline, about pages: tokens and type only.

## 8. Do not
- No gradients on chrome, no shadows, no emoji, no confetti or pulsing urgency. One exception: the LIVE dot may pulse gently.
- No split team-colour match hero, no square quick-tile row, no black-outline filter pills (these were OneFootball's and are why D was withdrawn).
- No fake data to fill a layout: no online counts (we have no presence tracking); form comes from `match_form()`, comment counts from the comment rows, images only from the three sources in §6.
- No colour-only meaning.

## 9. Acceptance checks
- Home at 390, 768, 1280, 1440 widths, light and dark, with: club + open round + picks; club + no picks; club + round locked/live; no club; no fixture.
- Contrast check of every token pair in both modes.
- i18n: all new strings in en and pt-BR; band labels fit in Portuguese ("RODADA 35 FECHA EM" wraps to two lines at most).
- Service worker version bumped; fonts precached; offline page still works.
- "Nothing fake" audit of the new Home.

## Open items
- Theme preference is stored on the device (`localStorage` key `sm_theme`: system | light | dark), like the language choice. No database column. **Rollout (v1.2):** no saved choice = dark until commit 4b, then system.
- Notifications (no bell until there is something to notify), a club page (no "Club" pill until it exists) and a ScoutMind player rating are not built; each is a separate decision.
- **Lawyer question (add to the pending Terms/Privacy review):** may ScoutMind display, without storing, the image a publisher includes in its own RSS/OG feed, shown with the publisher's name and a link to the article, for users in Brazil and the US? What takedown wording should the Terms carry? Source A stays off until this is answered.
- Landing page for logged-out visitors (separate step after Home ships).
- App icon and OG image in the new identity (navy, wordmark, scoreboard numerals).
- Dark-mode band colour to be confirmed on a real phone.
