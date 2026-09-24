# RSS fixtures

Ten real feeds captured on **24 September 2026**, 505 items. They back the
parser and tagger tests in `tests/tagger.test.js`.

**These are not verbatim copies.** Each feed's article-body elements
(`description`, `content:encoded`, `summary`, `content`) are clamped to 600
characters. ge's feed ships whole articles — untouched it was 430 KB of
copyrighted text, which we must not store anywhere, fixtures included. 600
characters is comfortably longer than the 300-character snippet the pipeline
actually keeps, so the clamp in `clipSummary()` is still exercised.

Everything else is exactly as the publishers served it, on purpose — the parser
has to survive the real mess:

- ge mixes plain and CDATA `<description>`, and uses `<atom:subtitle>`
- ESPN Brasil wraps `<link>` in CDATA and ships the literal string `null` as a description
- Olé marks `guid isPermaLink="true"`, ESPN marks it `"false"` with a non-URL id
- kicker carries both `<description>` and `<content:encoded>`
- Gazzetta includes one item with an empty title and a self-closing `<link/>`
  (the parser skips it — that is why the count is 505, not 506)
- pubDate timezones include `EST`, which `Date.parse` does not always accept

## Refreshing

Re-capturing changes the corpus, so the exact per-source counts pinned in
`tests/tagger.test.js` will move. Update them deliberately and re-check the
common-word club matches by hand — that list is the precision guard.
