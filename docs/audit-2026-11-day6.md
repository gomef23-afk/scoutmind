# 375px audit — Day 6 (November 2026)

Every screen at **375×812**, on production's public data with a simulated
signed-in reader (nothing written to production). Each screen was measured by
a script in the page, then fixed, then measured again:

- **sideways-scroll**: `documentElement.scrollWidth` > the viewport
- **overflow**: an element past the right edge, outside a horizontal scroller
- **tap<44**: a button, link, input or clickable element under 44×44. Links
  inside running text are exempt (WCAG 2.5.8 inline exception) and listed as such
- **clipped**: text cut off with no ellipsis
- **overlap**: fixed bars covering content or each other
- **input<16px**: a field iOS Safari zooms into on focus
- **keyboard**: needs a real phone; the cause and the mitigation are listed

Screenshots are in the gitignored `audit/day6/before/` and `audit/day6/after/`
(same file names). Some later captures were cropped by the hidden browser
pane, so the "after" column is the measurement, with a screenshot where one
was taken.

## Defects

| ID | Screen / state | Type | Element | Measured before | Before | Fix | After |
|---|---|---|---|---|---|---|---|
| D6-01 | Home, news cards | tap<44 | reactions, comment toggle, "Read ↗", sort chips, feed tabs | 39×28, 95×28, 41×21, 50×26, 59×34 | `01-home.jpg` | invisible 44px hit area (`::after`), look unchanged; comment actions spaced 18px so Report and Delete never share a box | 0 under 44 |
| D6-02 | Home, sidebar | tap<44 | "Your club" lines, match rows, "My clubs" rows, "Change my clubs" | 317×27, 317×43, 317×37, 102×23 | `01-home.jpg` | rows `min-height:44px`; button hit area | 0 under 44 |
| D6-03 | Clubs, "Your club" card | clipped / crowded | five stat cells, "lg avg" lines | lines ran together, last one touching the edge | `02-clubs.jpg` | cells `min-width:0` + side padding, "lg avg" may wrap to two lines | readable, nothing touching |
| D6-04 | Chat overlay | tap<44 | back button, Send, message field | 36×36, 61×34, field 24 tall | `05-chat.jpg` | back 44×44; Send hit area; a tap anywhere in the compose box focuses the field | `05-chat.jpg` |
| D6-05 | Chat overlay | text | "Ctrl + Enter to send" on a phone | shown | `05-chat.jpg` | hidden below 900px; Send kept at the right | `05-chat.jpg` |
| D6-06 | Chat overlay, match panel | keyboard (device check) | `position:fixed; inset:0` keeps full height when the iOS keyboard opens, so the composer can sit under it | — | — | the overlay follows `visualViewport` (height and offset) while open | **check on iPhone**: open a room, tap the field, the composer must stay above the keyboard |
| D6-07 | Scout, final round | clipped | "Picked by under 5%" tag on a long name | cut to "Picked …" | `07-scout-final.jpg` | Captain / under-5% tags moved to the second line | `07-scout-final.jpg` |
| D6-08 | Scout, round matches | tap<44 | match rows (open the match panel) | 343×33 | `07-scout-final.jpg` | `min-height:44px` | `07-scout-final.jpg` |
| D6-09 | Scout, rankings | clipped | rank column with a 4-digit rank | 30px column, "1057" against the edge | `08-scout-rankings.jpg` | `min-width` instead of a fixed width | aligned |
| D6-10 | Matches | overflow (state) | selected day chip off the right edge; the strip never showed which day was open | active chip at x > 375 | `10-matches.jpg` | strip scrolled to the selected chip on render (`scrollLeft`, the page does not jump) | chip at 209–281 |
| D6-11 | Matches | tap<44 | date chips | 72×43 | `10-matches.jpg` | `min-height:44px` | 0 under 44 |
| D6-12 | Match panel | tap<44 | back button | 36×36 | `11-match-panel.jpg` | 44×44 (shared with the chat) | 0 under 44 |
| D6-13 | Profile | tap<44 | back link, Edit, language pills, "Change / manage clubs", Danger-zone buttons, Download, "Also show news…" toggle | 87×16, 40×23, 65×27, 166×29, 75×29, 67×23, 282×36 | `12-profile.jpg` | hit areas; toggle `min-height:44px` | 0 under 44 |
| D6-14 | Delete-account sheet | input<16px | "Type DELETE" field | 13px, 32 tall (a global `input[type=text]{13px}` beat `.club-search`) | `13-delete-sheet.jpg` | every text / email / password / search / number field and select: 16px and 44px on phones, 13px from 900px | 16px, 44 tall |
| D6-15 | Delete-account sheet | keyboard (device check) | centred sheet ~500px tall: the keyboard can cover the confirm field | — | `13-delete-sheet.jpg` | sheet top-aligned and scrollable on phones | **check on iPhone**: type the password, then DELETE; both fields stay visible |
| D6-16 | Onboarding | tap<44 | club rows ×332, search, Skip, "I'll do this later" (a 14px-tall text span) | 143×40, 292×40, 292×43, 73×14 | `14-onboarding.jpg` | rows and search `min-height:44px`; "I'll do this later" is a real button | `14-onboarding.jpg` |
| D6-17 | auth.html, all six panels | input<16px | every field | 14px (iOS zoomed on each tap) | `15-auth-login.jpg` | 16px, 44px tall | `15-auth-login.jpg` |
| D6-18 | auth.html | tap<44 | tabs, buttons, demo, "Forgot password?", "Back to scoutmind.app", resend / back links | 41, 43, 38, 28, 16 tall | `15-auth-login.jpg` | 44px minimum | 0 under 44 (2 exempt: "Terms", "Privacy Policy" inside the sign-up sentence) |
| D6-19 | community.html | crowded nav | name badge + avatar + "Sign out" pushed the nav onto two lines | 2 lines | `03-community.jpg` | badge and Sign out hidden below 900px, as index.html already does (the avatar opens Profile, which has Sign out) | one line |
| D6-20 | community.html | input<16px | league selector, team search | 12px / 33 tall, 13px / 34 tall | `03-community.jpg` | 16px, 44px | 0 |
| D6-21 | community.html, a club | **sideways-scroll** | `#comm-main`: a grid item (default `min-width:auto`) forced to 479px by the tab row; 4th stat card cut off | page 493px wide at 375 | `04-community-club.jpg` | `.two-col>*{min-width:0}`, `minmax(0,1fr)`; the tab row scrolls in place, scrollbar hidden | 375 = 375, `04-community-club.jpg` |
| D6-22 | community.html, a club | tap<44 | tabs, "+ Create a Poll", Groups link button, empty-state button | 38, 42, 37, 35 tall | `04-community-club.jpg` | 44px minimum | 0 |
| D6-23 | community.html, Wishlist | input<16px | player / club / position fields | 13px | — | 16px, 44px | 0 |
| D6-24 | community.html | copy | "Pick a team from the **left**" (it is above on a phone) | — | `03-community.jpg` | "from the list" | — |
| D6-25 | Every page | tap<44 | footer links, nav logo, avatar | 52×28, 88×27, 32×32 | all | hit areas / 44px links | 0 |
| D6-26 | Privacy, Terms | — | no defect beyond D6-25 | — | `16-terms.jpg` | — | — |

**Not defects:** the headline links in news cards (full-width text links inside
a card, read as prose), and the in-sentence links on auth.html. Clubs showed a
2px sideways scroll once; it was the emulated window being 377px wide, and the
page matched it.

## Checks only a phone can do

1. **Chat keyboard (D6-06):** open a club room, tap the message field. The
   composer stays above the keyboard; the header stays on screen.
2. **Delete sheet keyboard (D6-15):** Profile → Delete my account, tap the
   password field, then the DELETE field. Both stay visible.
3. **Comment composer:** under a news card, tap "Comment", then the field. The
   page scrolls the field into view.
4. **No zoom on focus:** tap any field on auth.html, the onboarding search and
   the Scout search. The page does not zoom.
