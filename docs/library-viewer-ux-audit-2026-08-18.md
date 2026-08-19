# Library viewer UX/UI audit — 2026-08-18

Scope: `src/library/**` — the local, read-only Library viewer (`npm run library`, issue #210), as it
stands after commit `7eae314` ("Library viewer: status filter, new-tab idea links, Material Design 3
UI"). This audit is grounded in the real running server (`data/organicgrowth.db`, 54 Assets / 66 Jobs /
61 Ideas, straw-motion brand) — every finding below cites either the real rendered HTML pulled with
`curl` or the exact source line that produces it. No code was changed for this audit.

**Read-only invariant confirmed intact.** `src/library/server.ts` refuses every non-`GET` method before
any route is consulted, and the one `<form>` on the whole viewer (`render/library.ts`'s filter form) is
`method="get"`. Nothing in this audit proposes a write path — every task below is presentation-only.

## How this was checked

- Read every file under `src/library/` end to end (`server.ts`, `read-model.ts`, `filter-sort.ts`,
  `types.ts`, all five `render/*.ts` modules, `html.ts`, `vendor-assets.ts`, `queue-classify.ts`).
- Started the real server (it was already running on `127.0.0.1:4173` against `data/organicgrowth.db`)
  and pulled real rendered HTML with `curl` for: `/` (unfiltered and `?status=posted`), an Asset detail
  page, `/queue`, `/chart`, `/top`, a 404 (`/assets/does-not-exist`), and the two vendor JS entry files
  the import map points at.
- Verified `@material/web`'s `filled-button`/`text-button` are genuinely form-associated (checked
  `node_modules/@material/web/button/internal/button.js`: it composes
  `mixinFormSubmitter(mixinFormAssociated(mixinElementInternals(LitElement)))`) — confirming the filter
  form's `<md-filled-button type="submit">` is a legitimate functional use of a Material Web component,
  not a native-vs-Material violation. No Playwright/headless browser exists in this repo, so this is a
  source-level confirmation, not a live-render confirmation — noted as a standing, inherited trade-off
  below rather than something newly introduced.

## Top findings, in one paragraph each

**1. The "Material Design 3 UI" restyle only touched two buttons.** Of the five render modules, only
`render/library.ts` emits any `@material/web` markup at all — the filter form's `<md-filled-button>`
Apply and `<md-text-button>` Reset (`render/library.ts:62`). `render/asset.ts`, `render/queue.ts`,
`render/chart.ts`, and `render/top.ts` are 100% plain HTML/CSS, unchanged in spirit from before the
restyle. Worse, the two MD3 buttons that DO exist have no custom color tokens set anywhere in
`render/html.ts`'s shared `<style>` block — no `--md-sys-color-primary` or any other `--md-sys-color-*`
custom property — so they render in Material's stock default palette, which has no relationship to the
page's own near-black header (`#1a1a1a`) and gray/white body. Confirmed live: `curl http://127.0.0.1:4173/`
shows the `<style>` block is the same plain hand-rolled CSS (`.badge`, `.bucket-*`, `header`, `table`) on
every one of the five pages, word for word.

**2. The Idea Brief and "Operator production notes" render as one flattened wall of text.**
`render/asset.ts:86` dumps the entire markdown Brief — headings (`## Angle`), bullet lists (`- Qwen…`),
bold markers (`**Brand:**`) — inside a single `<p>` tag. HTML collapses newlines inside `<p>` by default,
so the browser will NOT show the paragraph/heading/list breaks that exist in the raw text; a real page
pull confirms the literal markdown syntax (`##`, `-`, `**`) sits inline, unbroken, exactly where the
literal source's newlines are. This is the single worst readability regression on the page that is meant
to be the "everything about one Asset, together" screen (AC4).

**3. New-tab behavior for Asset links is inconsistent across the three screens that link to one.**
`render/library.ts:71` opens `/assets/:id` with `target="_blank" rel="noopener"`. `render/queue.ts:29`'s
"view" link and `render/top.ts:13`'s Idea-title link go to the exact same kind of destination
(`/assets/:id`) with no `target` attribute at all — same tab. Confirmed in the real `/queue` and `/top`
HTML pulls: neither contains a single `target="_blank"`. The commit that introduced "new-tab idea links"
only reached one of the three screens that link to an Asset.

**4. Wide tables have no local scroll — a narrow viewport scrolls the whole page horizontally.**
`render/html.ts`'s shared CSS gives `.spec-grid` and `pre` their own `overflow-x: auto`, but the plain
`<table>` rule has none, and neither `render/library.ts`'s 11-column table nor `render/queue.ts`'s
9-column tables are wrapped in any scrollable container. At a laptop side-panel width this pushes the
whole `<body>` into horizontal scroll instead of scrolling just the table — a common, avoidable pattern
break, and directly relevant since this viewer's own agent brief calls out "viewed on a laptop in a side
panel" as a real usage mode.

**5. The Asset page repeats the exact same title as both `<h1>` and `<h2>`.** `render/html.ts`'s `page()`
already renders the Asset's title as the page's `<h1>` (from the title `server.ts:135` passes in), and
`render/asset.ts:78` immediately renders the identical string again as `<h2>`. Confirmed in the real pull:
`<h1>53.4 to 45.4: the free model is ahead…</h1>` is followed four lines later by
`<h2>53.4 to 45.4: the free model is ahead…</h2>`, verbatim. A screen-reader user hears the same heading
twice at two different levels; a sighted user sees redundant duplication.

## Full findings by the audit's own dimensions

**Information hierarchy / layout.** Library and Queue are dense flat tables — reasonable for a
data-review tool — but every column gets equal visual weight; nothing distinguishes the Idea title (the
one thing a human actually reads) from the metadata columns beside it. The Asset page interleaves Idea
metadata, the full raw Brief, the full raw Production Spec JSON (multi-KB `image_prompt` strings
included, uncollapsed), Media, Copy, and Post history top-to-bottom with no way to jump or collapse — a
single Asset's page in the sample data is genuinely very long (the one pulled ran to 200+ rendered lines,
almost entirely the Spec's `image_prompt` text). Top 5 and Chart are the leanest, best-hierarchy pages.

**Navigation / wayfinding.** The shared header nav (`render/html.ts:36`) is present on all five pages but
never marks which page is current — no `aria-current`, no active-state styling — so the only way to know
where you are is to read the `<h1>`. The Asset page's one "&larr; back to Library" link is the only
breadcrumb-equivalent anywhere; Queue/Top/Chart have none (acceptable for a flat 4-page app, but worth
noting there is genuinely no path back from Chart/Top/Queue except the shared nav). See Finding 3 above
for the new-tab inconsistency.

**MD3 component consistency.** See Finding 1. Additionally, the plain `.badge` spans (hookType, theme)
and `.bucket-*` highlight colors use ad hoc hex values (`#eee`, `#d4f4dd`, `#fff3cd`, `#f8d7da`,
`#e2e3e5`) with no relationship to any MD3 color token, so even a fully "MD3-styled" button sits beside
badges/highlights from an entirely different, untokenized palette.

**Filter/sort UX.** The status filter (this round's headline feature) works correctly and combines
sensibly with the other four filters (`applyLibraryFilter` ANDs every set field — verified in
`filter-sort.ts` and via `curl '/?status=posted'`, which correctly returned only `posted` rows). Two real
inconsistencies: (a) `hookType`/`theme` filter option labels and table badges show raw snake_case
(`counter_intuitive`, `surprising_number`) while the new `status` filter's options are already humanized
(`.replace(/_/g, " ")` — `render/library.ts:48`) — the newest filter is the only one that got the
humanization treatment; (b) the default sort is `"performance"` (`server.ts:64`), which is a total no-op
against the real database right now — every one of the 54 Assets shows "not yet tracked," confirmed live
(`grep -c "not yet tracked"` on the unfiltered pull = 54/54) — so a first-time visitor's default ordering
is silently just the title tie-break, dressed up as "sorted by measured performance." This is a real,
data-grounded observation, not a code bug — flagged as a product decision below (Task 13), not prescribed.

**Empty / loading / error states.** These are handled honestly and are one of the app's strengths: Top 5's
empty state explains exactly what has to happen for it to populate
(`No Asset has a Performance Score yet… once /track-performance has run…`); Chart's empty/partial states
correctly refuse to plot an unscored Idea at `(x, 0)` and instead list it in a separate, honestly-labeled
table (confirmed live: 61 Ideas awaiting a score, 0 plotted); the 404 page (`curl -w
"%{http_code}" /assets/does-not-exist` → `404`) renders inside the same shared shell, not a raw Node
error. The one gap: when the Chart has zero scored points, no SVG/axes render at all (Finding-level detail
in Task 11 below) — everything else here is solid.

**Data density / readability.** See Findings 2 and 4. Additionally, Idea titles are full sentences (the
sample data's titles run 60-110 characters) with no column width cap or truncation, so they visually
dominate every table row. The Production Spec's per-slide `image_prompt` strings are, by design, several
hundred to a few thousand characters of prose each — entirely reasonable content, but dumped raw and
uncollapsed on both the Asset page and every column of the Top 5 comparison grid.

**Accessibility basics.** Positives: every filter `<select>` has a proper `<label for>`
(`render/library.ts:56-61`); all external links carry `rel="noopener"`; images have `alt` text (though
generic — `alt="slide 0"`, not idea-specific); the SVG chart has `role="img"` and an `aria-label`
(`render/chart.ts:44`); heading levels are used, not just styled `<div>`s. Gaps: no `<th scope="col">` or
table `<caption>` anywhere (five render modules' worth of tables), the nav's current-page state is
unmarked (screen-reader users get no `aria-current` either), and the duplicate `<h1>`/`<h2>` on the Asset
page (Finding 5) is a real screen-reader redundancy, not just a visual one. No focus-order or
contrast-ratio testing was possible without a real browser (none exists in this stack) — the CSS values
read as plausible for contrast (white-on-`#1a1a1a`, black-on-light-badges) but this is unverified.

**Responsiveness.** See Finding 4. The filter form itself is fine (`flex-wrap: wrap`). No `<meta
name="viewport">` tag exists in `render/html.ts`'s `<head>` at all — for a page that may genuinely be
viewed in a narrow browser window this is a minor but real gap (mobile-scale rendering isn't the target,
but a laptop side panel plausibly is, per this viewer's own brief).

**Leftover / pre-restyle inconsistency.** The restyle's own `render/library.ts` is itself split down the
middle: the filter/sort `<select>` controls are correctly left native (per the native-vs-Material judgment
call — a `<select>` is functional, and an unloaded custom element would silently break it), but the two
buttons beside them are MD3 while every visual affordance elsewhere on the same row (labels, table,
badges) is untouched plain CSS. This isn't wrong per se (native-for-function is the right call), but
nothing in the shared page shell currently makes the MD3 pieces look like they belong to the same design
system as the plain-CSS pieces — that gap is Finding 1's color-token point again, viewed from the
single-page angle.

---

## Prioritized task list

14 items. Tiers 1-2 are "fix broken/inconsistent"; Tier 3 is density/readability polish; Tier 4 is
explicitly a product decision to confirm with the Operator before any subagent builds it — do not build
Tier 4 without that confirmation. **File-conflict note up front:** Tasks 1-3 and Task 4 all touch
`render/asset.ts` and/or `render/queue.ts` — hand these to subagents **sequentially**, not in parallel,
in the numbered order below. Tasks 5-8 all touch `render/html.ts`'s shared `<style>` block and/or
`render/library.ts` — also sequential, in numbered order. Task 12 touches every render module the other
tasks touch and should run **last**, after every other content/markup change in this list has landed, to
avoid repeated merge conflicts on the same `<table>`/`<th>` lines. Task 11 (`render/chart.ts` only) and
Task 13 (`server.ts` only) are the only two genuinely safe to run in parallel with everything else.

### Tier 1 — broken or inconsistent, fix first

**1. Make Asset links open in a new tab consistently on every screen that has one.**
- Files: `src/library/render/queue.ts`, `src/library/render/top.ts` (and each file's own `.test.ts`).
- Not parallel-safe with: Task 4 (also edits `queue.ts`). Safe in parallel with everything else.
- Change: give `render/queue.ts`'s "view" link (`queue.ts:29`) and `render/top.ts`'s Idea-title link
  (`top.ts:13`) `target="_blank" rel="noopener"`, matching `render/library.ts:71`'s existing behavior for
  the same `/assets/:id` destination.
- Acceptance criteria: rendered `/queue` HTML's every `<a href="/assets/...">view</a>` includes
  `target="_blank" rel="noopener"`; rendered `/top` HTML's every Idea-title link does too. Add/extend a
  `node:test` assertion in `queue.test.ts` and `top.test.ts` asserting `target="_blank"` is present for
  these links (mirroring `library.test.ts`'s existing pattern for the same attribute).

**2. Remove the duplicated Asset title (`<h1>` + identical `<h2>`).**
- Files: `src/library/render/asset.ts`, `src/library/render/asset.test.ts`.
- Not parallel-safe with: Task 3 (same file). Run this one first, then Task 3.
- Change: `render/asset.ts:78`'s `<h2>${escapeHtml(idea.title)}</h2>` repeats the exact string
  `render/html.ts`'s `page()` already used as `<h1>` (via the title `server.ts:135` passes). Replace the
  `<h2>` with either nothing (let the metadata `<p>` sit directly under the shared `<h1>`) or a genuinely
  different sub-heading (e.g. an `<h2>` reading "Asset overview" if a section label is wanted) — never the
  same title text twice.
- Acceptance criteria: for a rendered Asset page, the idea title string appears exactly once across every
  `<h1>`/`<h2>` on the page (assert via `node:test` string-count on the rendered `renderAssetBody` output
  plus a check against `page()`'s own `<h1>` in `server.test.ts`'s existing asset-route coverage).

**3. Give the Idea Brief and Operator production notes real paragraph/list structure instead of one
flattened block.**
- Files: `src/library/render/asset.ts`, `src/library/render/asset.test.ts`.
- Not parallel-safe with: Task 2 (same file, run after it). Not parallel-safe with Task 4 or Task 9/10
  (also touch `asset.ts`) — run in the numbered order given here.
- Change: add one small, pure, unit-testable helper (in `asset.ts` or a new colocated function) that turns
  a blank-line-separated markdown-ish string into real block-level HTML: each blank-line-separated chunk
  becomes its own `<p>` (or `<h4>`/`<ul><li>` when the chunk starts with `##`/`- `); every leaf string
  still goes through the existing `escapeHtml`. This does not need to be a general markdown parser — the
  Brief/notes format is fixed and known (`docs/` briefs, `idea-strategist` output) — a minimal, purpose-
  built splitter is enough and keeps this module dependency-free. Apply it to both the Brief
  (`asset.ts:86`) and the "Operator production notes" text embedded in the same field.
- Acceptance criteria: for a Brief string containing `"para one\n\n## Angle\npara two\n\n- item one\n-
  item two"`, the rendered HTML contains distinct `<p>`/`<h4>`/`<li>` elements (not one `<p>` holding the
  whole string) — assert this with a `node:test` case using exactly this kind of fixture string, plus a
  regression assertion that the existing real Brief content is still fully present (no text silently
  dropped).

**4. Wrap the Library and Queue tables in a horizontally-scrollable container instead of letting the
whole page scroll.**
- Files: `src/library/render/html.ts` (add a `.table-scroll { overflow-x: auto; }` rule beside the
  existing `.spec-grid`/`pre` rules), `src/library/render/library.ts`, `src/library/render/queue.ts` (wrap
  each `<table>...</table>` in `<div class="table-scroll">…</div>`), plus each file's `.test.ts`.
- Not parallel-safe with: Task 1 (`queue.ts`), Task 6/7/8 (`html.ts`/`library.ts`) — run after those in
  this tier, or bundle as one session since all are small.
- Acceptance criteria: rendered `/` and `/queue` HTML wraps every data `<table>` in a
  `<div class="table-scroll">`; a `node:test` string-match confirms the wrapper is present around the
  table markup in `library.test.ts`/`queue.test.ts`. (Real narrow-viewport behavior — table scrolls
  independently of the page — is a CSS claim that can't be asserted by `node:test`; note this plainly as
  unverified-by-CI, same as any other CSS-only claim in this stack.)

### Tier 2 — design-system consistency

**5. Give the shared page shell one real MD3 color-token palette, and make the existing MD3 buttons plus
the plain badge/bucket colors draw from it.**
- Files: `src/library/render/html.ts` only, plus `render/html.test.ts`.
- Not parallel-safe with: Tasks 4, 6, 7, 8 (all touch `html.ts`'s `<style>` block) — run after Task 4 in
  this list, before 6-8, or combine into one styling pass.
- Change: consult the `material-3` skill for the correct token names/relationships (don't invent hex
  values freestyle) and define `--md-sys-color-*` custom properties on `:root` inside `html.ts`'s
  `<style>` block, chosen to read coherently with the page's existing near-black header (`#1a1a1a`).
  `@material/web` components pick these up automatically with no JS change needed. Redefine `.badge` and
  `.bucket-*` to reference the same custom properties (e.g. `background: var(--md-sys-color-...)`) instead
  of their current standalone hex values, so the two MD3 buttons and the plain-CSS badges/highlights read
  as one palette rather than two unrelated ones.
- Acceptance criteria: `html.ts`'s shipped `<style>` block contains a `:root { --md-sys-color-primary: …
  }` block (and related tokens); `.badge`/`.bucket-*` rules reference `var(--md-sys-color-…)` rather than
  bare hex; a `node:test` case in `html.test.ts` asserts the custom-property block is present in `page()`'s
  output. State plainly in the handoff report that final on-screen color harmony is a visual judgment call
  this repo cannot verify without a real browser — a manual `npm run library` + browser check is still
  warranted before calling this done.

**6. Humanize hookType/theme text everywhere it's shown, matching the status filter's existing treatment.**
- Files: `src/library/render/library.ts`, `src/library/render/library.test.ts`.
- Not parallel-safe with: Tasks 4, 5, 7, 8 (`html.ts`/`library.ts`) — sequential in this list.
- Change: apply the same `.replace(/_/g, " ")` (or a small shared label helper, if it turns out to be
  reused a third time) to hookType and theme wherever they're displayed as text — the filter dropdown
  option labels (`library.ts:31-38`) and the table badges (`library.ts:72-73`). The underlying `value`
  attribute (used for the query string) must stay the raw enum value — only the visible label changes.
- Acceptance criteria: rendered `/` HTML's hookType/theme `<option>` labels and `<span class="badge">`
  text contain spaces instead of underscores (e.g. "counter intuitive", not "counter_intuitive"), while
  `<option value="counter_intuitive">` itself is unchanged; `node:test` assertions cover both the option
  label and the badge text for a fixture row using a multi-word enum value.

**7. Mark the current page in the shared nav header.**
- Files: `src/library/render/html.ts` (widen `page()`'s signature with an optional `activePath?: string`
  parameter, defaulting to no highlight so existing two-arg call sites keep compiling), `src/library/
  server.ts` (pass the current `url.pathname` at each of the five `page(...)` call sites), plus
  `render/html.test.ts` and `server.test.ts`.
- Not parallel-safe with: Tasks 4, 5, 6, 8 (`html.ts`) — sequential, run after 4-6.
- Acceptance criteria: for a `GET /queue` request, the response HTML's `<a href="/queue">` nav link
  carries `aria-current="page"` (and/or an `.active` class) and the other three nav links do not; repeat
  for the other three routes. Cover with new `node:test` cases in `html.test.ts` (unit, passing
  `activePath` directly) and at least one `server.test.ts` case confirming the real route wiring.

**8. Cap the Idea-title column's width with a full-text tooltip, so one long title doesn't force every
other column into a sliver.**
- Files: `src/library/render/html.ts` (a `max-width`/`text-overflow: ellipsis` rule for the Idea-title
  cell), `src/library/render/library.ts` (add a `title="…"` attribute carrying the full text on the
  anchor).
- Not parallel-safe with: Tasks 4, 5, 6, 7 (`html.ts`/`library.ts`) — run last in this html.ts/library.ts
  group.
- Acceptance criteria: the rendered Idea-title `<a>` carries a `title` attribute equal to the full,
  unescaped-for-display Idea title; a `node:test` assertion confirms the `title="…"` attribute is present
  and matches the row's `ideaTitle`. (Visual truncation itself is a CSS claim, same caveat as Task 4.)

### Tier 3 — density / readability polish

**9. Collapse each Production Spec's raw JSON behind a native, closed-by-default disclosure.**
- Files: `src/library/render/asset.ts`, `src/library/render/top.ts`, their `.test.ts` files.
- Not parallel-safe with: Tasks 2, 3 (`asset.ts`) — run after those land.
- Change: wrap the existing `<pre>${JSON.stringify(spec, null, 2)}</pre>` block in
  `<details><summary>Production Spec (raw JSON)</summary>…</details>` on both the Asset page
  (`asset.ts:90`) and each Top 5 column (`top.ts:11`) — native HTML, no JS, no write path. Leave it
  collapsed by default given how large a real Spec's `image_prompt` text runs (confirmed: one real Asset's
  Spec block alone ran to well over 100 lines of rendered HTML).
- Acceptance criteria: rendered Asset/Top HTML wraps the Spec `<pre>` in a `<details>` element without a
  `open` attribute (closed by default); `node:test` assertions confirm the `<details>`/`<summary>`
  wrapper is present and the full JSON text is still fully contained inside it (nothing dropped, just
  collapsed).

**10. Give the "Post URLs and metric history" section the same card treatment as Media and Copy variants.**
- Files: `src/library/render/asset.ts`, `src/library/render/asset.test.ts`.
- Not parallel-safe with: Tasks 2, 3, 9 (all touch `asset.ts`) — run after those.
- Change: `postsHtml` (`asset.ts:59-72`) currently renders bare `<div>`s separated by `<hr>`, unlike
  `mediaHtml`/`copyVariantsHtml` which both use the `.spec-col` card class. Give each Post entry the same
  `.spec-col` wrapper for visual consistency within the same page.
- Acceptance criteria: rendered Asset HTML's Post entries are each wrapped in `class="spec-col"` (or a
  clearly related card class), verified by a `node:test` string match.

**11. Always render the Fit-vs-Performance chart's axes/frame, even with zero scored points.**
- Files: `src/library/render/chart.ts`, `src/library/render/chart.test.ts`.
- Parallel-safe with everything else in this list (no other task touches `chart.ts`).
- Change: today, `renderChartBody` only calls `svgFor` when `scored.length > 0`
  (`chart.ts:75-78`); with zero scored points it falls back to a bare `<p class="muted">` with no visual
  chart at all. Extract the axis-lines/dashed-diagonal/labels into their own small helper and always
  render them (an "empty chart frame"), plotting zero circles rather than showing no `<svg>` at all — so
  the page reads as "a real chart, no data yet" instead of "nothing rendered here."
- Acceptance criteria: `renderChartBody` with an empty `scored` array still contains an `<svg` element
  with the axis lines and axis labels present; `node:test` covers this exact case (today's suite already
  covers the populated case — extend, don't replace, the existing assertions).

**12. Add `<th scope="col">` and a `<caption>` to every data table across all render modules — run last.**
- Files: `src/library/render/library.ts`, `src/library/render/queue.ts`, `src/library/render/asset.ts`,
  `src/library/render/chart.ts`, and each file's `.test.ts`.
- Not parallel-safe with anything else in this list — every other task in this document edits at least
  one table in one of these four files. Run this task last, after every other Tier 1-3 task has landed,
  to avoid repeated conflicts on the same `<table>`/`<th>` lines.
- Acceptance criteria: every `<th>` in every one of these four render modules' output carries
  `scope="col"` (or `scope="row"` where applicable), and every `<table>` has an immediate `<caption>`
  describing its contents (e.g. "Assets matching the current filter", "Metric history"); `node:test`
  assertions cover at least one representative table per file.

### Tier 4 — product decisions to confirm with the Operator before scoping a build task

**13. (Decision needed) Reconsider the Library screen's default sort.**
- Files if approved: `src/library/server.ts` (the `parseSort` fallback, `server.ts:64`), plus
  `server.test.ts`.
- Parallel-safe with everything else (touches only `server.ts`) — but **do not build this without
  confirming with the Operator first**: this changes what every visitor sees by default, and the current
  behavior (`"performance"`) is not a bug — the code is correctly telling the truth that nothing is
  tracked yet. The finding is that this makes the default view's ordering meaningless at this project's
  current stage (real data: 0 of 61 Ideas have a Performance Score yet), not that the code is wrong.
  Confirm the desired default (e.g. `"produced"`, most-recent-first) before any subagent implements it.
- Acceptance criteria (once confirmed): `GET /` with no `sort` query param returns rows ordered by the
  agreed default; `server.test.ts` asserts the new default explicitly, and the existing explicit-`sort=`
  test cases are unaffected.

**14. (Decision needed, no task scoped yet) Should repeated Job-history rows for the same Asset be
grouped or collapsed on the Run & Queue screen?** Real data shows the same Idea+Recipe pair appearing 2-3
times in the same bucket at different timestamps/gates (e.g. a Cast-gate leg followed by its resume leg),
which is correct Job history but has no on-screen explanation distinguishing "three different jobs" from
"one Asset's history across three phases." This may be entirely fine as-is (the Job grain is real and
arguably useful to see) or may warrant a "collapse to latest per Asset" toggle — that's a product call, not
a rendering defect, and no file-scoped task is proposed until the Operator decides which reading is
correct.
