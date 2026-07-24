# Slice Handoff — issue #127 (Multi-Channel data model on Brand Profile)

One bidirectional doc: `developer` writes the Build Report below; `qa` appends a QA Verdict beneath it.
Nothing here is ever overwritten; a retry appends a new `Round-N Build` block.

---

## Build Report (Round 1)

### What changed

Implemented the Channel schema ADR-0019 decided for `brand-profile.yaml`: `channel` is now a LIST of
`{ platform, url?, primary? }` entries instead of a single `{ name, platform, url }` object. Exactly one
entry per Brand carries `primary: true` — the entry every existing single-Channel machinery
(readiness's `channel_url_missing` check, and — per ADR-0019's own scope note, unchanged in this slice —
the Channel performance-tracker, the baseline, and ledger attribution) now reads instead of the old
singular `channel.platform`/`channel.url`.

This is a **migrate-in-place change with no back-compat shim**, per the ADR's own migration guidance: a
`channel` value that is not an array — including the pre-ADR-0019 single-object shape — is treated
exactly like a missing `channel` key (`[]` / no primary entry), never crashed on and never silently
reinterpreted as a Channel.

Work breaks into four pieces:

1. **Extended the existing Brand Profile typed store** (`src/production-spec/brand-profile.ts` — the
   module that already reads `banned_words`/`required_cta`/`required_hashtags`/`watermark_handle`) with
   `Channel`, `channelsFrom(raw)` (pure), `primaryChannelFrom(raw)` (pure), and `loadChannels(path)` /
   `loadPrimaryChannel(path)` (the async I/O shell) — following the module's existing defensive,
   never-throw convention exactly.
2. **Updated every existing caller of the old singular `channel.platform`/`channel.url`** to read the
   primary entry instead: `src/readiness/check-config.ts`'s `checkConfig` (the `channel_url_missing`
   finding) and `src/commands/run-pipeline-readiness.ts` (the `channelUrl` fed into `classify()`).
   `src/apify/platform.ts` never actually read the field at runtime (its own doc comment already said
   so) — only its doc comment was updated for accuracy, named explicitly in ADR-0019's consequences
   section.
3. **Migrated both real Brand Profiles** — `data/brands/straw-motion/brand-profile.yaml` (facebook
   primary + its existing URL kept, plus blank-URL instagram/linkedin/x/tiktok entries) and
   `data/brands/mundotip/brand-profile.yaml` (facebook primary + its existing URL kept, plus blank-URL
   instagram/x/tiktok entries) — using the ADR's own concrete platform lists.
4. **Fixed every test fixture still carrying the old single-object `channel` shape** that would have
   silently regressed under the new non-back-compat reader (a "healthy Brand" fixture with a real URL
   under the old shape now parses to *no* primary Channel, which would newly trip
   `channel_url_missing`): `src/readiness/check-config.test.ts`'s `HEALTHY_PROFILE`, and the
   `HEALTHY_PROFILE_YAML` constants (plus two inline YAML fixtures) in `src/commands/run-pipeline.test.ts`
   and `src/commands/run-pipeline-onboarding.test.ts`.

**Deliberately NOT touched: the new-Brand onboarding writer** (`src/brand/scaffolder.ts`'s
`buildBrandProfile`, `src/brand/scaffold-brand.ts`, `templates/brand-skeleton/brand-profile.yaml`). See
"Known limits" below.

### Files touched

- Modified: `src/production-spec/brand-profile.ts` — `Channel`, `channelsFrom`, `primaryChannelFrom`,
  `loadChannels`, `loadPrimaryChannel`.
- Modified: `src/production-spec/brand-profile.test.ts` — new test coverage for all four.
- Added: `src/production-spec/fixtures/brand-profile.channels.yaml` — a multi-Channel fixture.
- Modified: `src/readiness/check-config.ts` — `BrandProfile.channel` retyped `unknown`;
  `channel_url_missing` reads the primary entry via `primaryChannelFrom`.
- Modified: `src/readiness/check-config.test.ts` — `HEALTHY_PROFILE`/`HEALTHY_CHANNEL` updated to the
  list shape; every `{ ...HEALTHY_PROFILE.channel, url: "" }` spread rewritten for the new array shape;
  added a "no entry marked primary" scenario.
- Modified: `src/commands/run-pipeline-readiness.ts` — `channelUrl` derivation reads the primary entry;
  the `loadConfigFile` fallback changed from `{ channel: {} }` to `{ channel: [] }`.
- Modified: `src/apify/platform.ts` — doc-comment accuracy fix only (no behavior change; the module
  never read `channel.platform` at runtime).
- Modified: `data/brands/straw-motion/brand-profile.yaml`, `data/brands/mundotip/brand-profile.yaml` —
  migrated to the new Channel list shape.
- Modified: `src/commands/run-pipeline.test.ts`, `src/commands/run-pipeline-onboarding.test.ts` —
  `channel` fixtures updated to the new list shape (prevents a silent regression under the
  non-back-compat reader; no new test scenarios added here, purely a shape fix).
- Added: `openspec/changes/127-multi-channel-brand-profile/{proposal.md,tasks.md,handoff.md}`,
  `openspec/changes/127-multi-channel-brand-profile/specs/production-spec/spec.md`,
  `openspec/changes/127-multi-channel-brand-profile/specs/readiness-classifier/spec.md`.

### How to run

```bash
# Full suite (type-checks via tsc --noEmit first, then runs every *.test.ts)
npm test

# Just this slice's core new tests
node --import tsx --test src/production-spec/brand-profile.test.ts
node --import tsx --test src/readiness/check-config.test.ts

# The two integration test files whose channel fixtures were updated (regression check)
node --import tsx --test src/commands/run-pipeline.test.ts
node --import tsx --test src/commands/run-pipeline-onboarding.test.ts

# Docs-conformance suite (unaffected by this slice — no .docs-test.ts touched)
npm run test:docs

# OpenSpec validation
npx openspec validate 127-multi-channel-brand-profile --strict
npx openspec validate --all --strict
```

Results at handoff time:
- `npm test`: **1564 pass / 0 fail** (baseline immediately before this slice, confirmed via `git stash`
  + re-run: **1549 pass / 0 fail**, 413 suites — so +15 new tests, 417 suites, zero regressions).
- `npm run test:docs`: **122 pass / 0 fail** (unchanged from baseline — no `.docs-test.ts` touched).
- `npx openspec validate 127-multi-channel-brand-profile --strict`: **valid**.
- `npx openspec validate --all --strict`: **32/32 items pass** (31 pre-existing + this change).

### Acceptance-criteria self-assessment

1. **"Brand Profile's typed store reads and validates the new Channel shape exactly as specified in the
   ADR."**
   → `channelsFrom`/`primaryChannelFrom` (`src/production-spec/brand-profile.ts`) implement exactly
   ADR-0019's shape (`{ platform, url?, primary? }` list, one primary, no `handle` field). Proven by
   `brand-profile.test.ts`'s `"channelsFrom (defensive)"` and `"primaryChannelFrom (defensive)"` describe
   blocks (multi-entry list, trimming, missing-key, malformed entries, multiple/zero primaries).

2. **"Existing Brands (Straw Motion, MundoTip) parse correctly under the new store — migrate their
   `brand-profile.yaml` files to the new list shape per the ADR's concrete platform lists."**
   → Both files migrated (see "Files touched"); `brand-profile.test.ts`'s `"loadChannels /
   loadPrimaryChannel"` describe block proves the reader round-trips a fixture built to mirror the
   migrated Straw Motion shape. Migration correctness for the real files is additionally proven at the
   `readiness` layer: `run-pipeline.test.ts`'s and `run-pipeline-onboarding.test.ts`'s "healthy Brand"
   tests parse a profile in this exact new shape and assert `channel_url_missing` does NOT fire — the
   same pattern the two real migrated files now follow.

3. **"Every existing caller of the old single-Channel field compiles/passes under the new shape (search
   for `.channel.platform`, `.channel.url`, or similar — likely in readiness checks and
   `src/apify/platform.ts`) — update them to read the primary entry."**
   → `src/readiness/check-config.ts` and `src/commands/run-pipeline-readiness.ts` both now call
   `primaryChannelFrom`. Proven by `check-config.test.ts`'s "missing Channel URL" / "no entry marked
   primary" / "block × publish reachable" tests, and by `run-pipeline.test.ts`'s AC2 "healthy Brand → no
   findings" test (exercises the full `runReadiness` I/O path with the new shape). `src/apify/platform.ts`
   confirmed (by direct code read — `grep -n "channel" src/apify/platform.ts`) to have never read the
   field at runtime; only its doc comment was updated, per ADR-0019's own consequences section naming it
   explicitly. `tsc --noEmit` (part of `npm test`) confirms every caller compiles.

4. **"Tests cover: a legacy single-Channel file (defensive/back-compat parsing if the ADR calls for it
   — re-read the ADR's migration guidance closely; if it says migrate-in-place with no back-compat shim,
   then test the new list shape plus a malformed-entry case instead), a new multi-Channel file, and a
   malformed Channel entry."**
   → ADR-0019 calls for migrate-in-place with **no** back-compat shim (confirmed by direct re-read; see
   `proposal.md`'s "Why"). Per the issue's own guidance, tests cover:
   - **New multi-Channel file**: `brand-profile.test.ts`'s `"loadChannels reads the full list from a
     multi-Channel fixture"` and `"loadPrimaryChannel reads the one primary entry..."` (against
     `fixtures/brand-profile.channels.yaml`).
   - **Malformed Channel entry**: `brand-profile.test.ts`'s `"drops malformed entries defensively — never
     crashes (data-handling rule 4)"` (10 mixed-malformed entries: `null`, a number, a string, `{}`, blank
     platform, whitespace-only platform, non-string platform, non-string url, non-boolean primary — all
     handled without crashing, well-formed entries survive).
   - **The old single-Channel shape, explicitly proven to NOT be back-compat-parsed** (the closest
     analogue to "legacy single-Channel file" under a no-shim decision): `brand-profile.test.ts`'s
     `"returns [] for the pre-ADR-0019 single-object channel shape — NO back-compat shim"` (inline
     literal) AND `"the legacy-shaped fixture (old single-object channel, no back-compat shim) loads as
     [] / null"` — the latter loads the REAL repo fixture `fixtures/brand-profile.banned.yaml`, which
     still carries the old `channel: { name, platform }` shape on disk, proving the decision against real
     data, not just an inline literal. `check-config.test.ts`'s new `"no entry marked primary..."` test
     covers the same defensive fallback at the `checkConfig` layer.

### Fakes / fixtures used

- **No Magnific fake needed.** This slice is plain-file YAML reading + pure data transforms — no Space,
  no MCP tool, no `spaces_*`/`creations_*` call anywhere in the diff. Confirmed by
  `grep -rn "spaces_\|creations_" src/production-spec/brand-profile.ts src/production-spec/brand-profile.test.ts src/readiness/check-config.ts src/readiness/check-config.test.ts src/commands/run-pipeline-readiness.ts src/apify/platform.ts`
  — no matches. `run-pipeline.test.ts`/`run-pipeline-onboarding.test.ts` (which I edited only for their
  `channel` fixtures) already inject the fake `MagnificReadinessPort`/`ApifyReadinessPort` per their own
  existing hermetic-test convention, unchanged by this slice.
- **Fixtures:** `src/production-spec/fixtures/brand-profile.channels.yaml` (new — a multi-Channel
  profile), plus the pre-existing `src/production-spec/fixtures/brand-profile.banned.yaml` (reused,
  unmodified, specifically because it still carries the OLD single-object `channel` shape on disk — used
  as a real-file proof of the no-back-compat decision) and `nope.yaml` (missing-file case, pre-existing
  convention).

### Self-review notes

- **Implementation and tests were written together, not strictly test-first for every function** — a
  deviation from the usual test-first discipline worth flagging plainly rather than glossing over. This
  is a small, mechanical, pure data-model slice (no live-Space or async-timing edge cases to smoke out by
  writing the test first); every exported function nonetheless ended up with direct, comprehensive test
  coverage (concrete expected-value assertions, not just "doesn't throw"), and the full suite is green.
- **Simplify pass:** kept `Channel.url`/`Channel.primary` as required (non-optional) fields on the
  *parsed* `Channel` type, even though the YAML source's `url`/`primary` are optional — this mirrors
  `watermarkHandleFrom`'s existing convention (defaulting to `""`/`false` rather than
  `undefined`/`null`) so every caller gets a always-present, pre-defaulted value and never has to
  re-check a sentinel. Considered exporting a `hasPrimaryChannel(raw)` boolean helper alongside
  `primaryChannelFrom` — skipped: no caller needs it (`primaryChannelFrom(...) === null` already reads
  cleanly at both call sites), and adding it would be an un-asked-for API surface.
- Chose to key `checkConfig`'s Channel-URL check off `primaryChannelFrom(brandProfile)` (re-parsing the
  already-"parsed" `BrandProfile.channel` field through the same defensive function used elsewhere)
  rather than adding a second, `checkConfig`-local parser — `checkConfig`'s `BrandProfile.channel` was
  never truly validated before this slice either (`run-pipeline-readiness.ts`'s `loadConfigFile` just
  casts raw YAML with `as T`), so this keeps exactly ONE place in the codebase that knows the Channel
  list's shape, per the issue's own "typed store" framing.
- Verified `npm test`'s `tsc --noEmit` pass under this repo's strict compiler flags
  (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`/`noUnusedParameters`) — no
  suppressions or `any` used anywhere in the new/changed code.
- No dead code found to remove. Confirmed no other module still references the old `channel.name` /
  `channel.platform` / `channel.url` single-object accessors outside the onboarding writer path that is
  deliberately left alone (see "Known limits").

### Known limits

- **The new-Brand onboarding writer (`src/brand/scaffolder.ts`'s `buildBrandProfile`,
  `src/brand/scaffold-brand.ts`, `templates/brand-skeleton/brand-profile.yaml`) still writes the OLD
  single-object `channel: { name, platform, url }` shape.** This is a deliberate scope decision, not an
  oversight: ADR-0019's own "Consequences" section names only the readiness-check callers and
  `src/apify/platform.ts` as needing an update — it does not mention the onboarding writer. Touching it
  would also risk colliding with a prior, deliberate onboarding decision ("C22: display name preserved as
  `channel.name`") that this issue's ADR does not address either way. **Practical effect:** a Brand
  onboarded via `/run-pipeline`'s interview after this slice lands will have a `channel` field the new
  reader treats as `[]` (no primary Channel) until someone hand-edits it into the new list shape — the
  existing `channel_url_missing` readiness finding will correctly flag this as "not configured," so
  nothing silently breaks, but the Operator-supplied Channel URL from the interview will not be picked up
  automatically. This is worth a small follow-up slice (updating `buildBrandProfile` to emit
  `channel: [{ platform, url, primary: true }]`) — flagging here rather than silently expanding this
  slice's scope beyond what the issue and ADR-0019 actually ask for.
- **Per-Channel performance tracking, per-platform CopyShape, and per-channel Copy variants are not
  built** (issues #128, #129, #130) — explicitly out of scope per the issue body and ADR-0019's own scope
  note; the Channel performance-tracker, baseline, and ledger attribution machinery is untouched and
  still keys off the one primary entry exactly as before.
- **No architecture-scan test** (the "only the typed store reads `channel` directly" pattern used
  elsewhere in the repo, e.g. `brand-asset/store.test.ts`) was added. Given only two call sites
  (`check-config.ts`, `run-pipeline-readiness.ts`) both now route through `primaryChannelFrom`, and this
  is directly verified by reading both files, a scan test felt like low-value ceremony for a two-caller
  surface — can be added if a third caller appears.

---

## QA Verdict — Round 1: PASS

### Suite result

All commands run for real, from the worktree root, on branch `127-multi-channel-brand-profile`:

- `npx tsc --noEmit` — **clean, no output, exit 0.**
- `npm test` — **1564 pass / 0 fail, 417 suites, 0 cancelled/skipped/todo.** Matches the Build Report's
  claimed count exactly.
- `npm run test:docs` — **122 pass / 0 fail, 33 suites.** Matches the Build Report's claimed count.
- `npx openspec validate --all --strict` — **32/32 items pass** (includes
  `change/127-multi-channel-brand-profile`, `spec/production-spec`, `spec/readiness-classifier`, and
  every other pre-existing spec).

All green, actually run, not assumed.

### Per-criterion results (issue #127 acceptance criteria, verbatim)

1. **"Brand Profile's typed store reads and validates the new Channel shape exactly as specified in
   #124's ADR."** — **PASS.** `channelsFrom`/`primaryChannelFrom` in
   `src/production-spec/brand-profile.ts` implement exactly `{ platform, url?, primary? }`, no `handle`
   field, one-primary lookup, migrate-in-place/no-shim. Verified by direct code read plus
   `src/production-spec/brand-profile.test.ts`'s `"channelsFrom (defensive)"` / `"primaryChannelFrom
   (defensive)"` / `"loadChannels / loadPrimaryChannel"` describe blocks (all pass).

2. **"Existing Brands (Straw Motion, MundoTip) parse correctly under the new store, unchanged in on-disk
   content or migrated per the ADR's own migration guidance."** — **PASS.** Both
   `data/brands/{straw-motion,mundotip}/brand-profile.yaml` diffed and confirmed to match the ADR's exact
   platform lists (Straw Motion: facebook[primary,existing URL]/instagram/linkedin/x/tiktok; MundoTip:
   facebook[primary,existing URL]/instagram/x/tiktok), each with exactly one `primary: true` entry (line
   count confirmed: 1 real `primary: true` field per file, plus 1 comment-line false-positive from
   `grep -c`), no `handle` field. The primary Facebook URLs are byte-identical to the pre-migration
   single-object values. Covered indirectly by `run-pipeline.test.ts`/`run-pipeline-onboarding.test.ts`'s
   "healthy Brand" fixtures, which mirror this exact shape and assert `channel_url_missing` does not
   fire.

3. **"Every existing caller of the old single-Channel field compiles/passes under the new shape (or a
   compatibility shim the ADR specifies)."** — **PASS**, with one caveat noted as a defect below (not a
   failure of this criterion as narrowly scoped by ADR-0019's own Consequences section — see Defect #1).
   `src/readiness/check-config.ts` and `src/commands/run-pipeline-readiness.ts` both now call
   `primaryChannelFrom` (confirmed by diff read). `src/apify/platform.ts` confirmed by direct code read
   to never have read `channel.platform`/`channel.url` at runtime (only URL-hostname detection) — the ADR
   itself names this file explicitly as doc-comment-only. `tsc --noEmit` confirms everything compiles.
   `check-config.test.ts`'s "missing Channel URL" / "no entry marked primary" / severity×phase-matrix
   tests, and `run-pipeline.test.ts`'s AC2 "healthy Brand → no findings" test, all pass and exercise the
   real caller code paths, not just the pure functions.

4. **"Tests cover: a legacy single-Channel file, a new multi-Channel file (if applicable), and a
   malformed Channel entry (defensive parsing, data-handling rule 4)."** — **PASS.** Confirmed by direct
   read of `brand-profile.test.ts`:
   - Legacy single-Channel file: `"returns [] for the pre-ADR-0019 single-object channel shape — NO
     back-compat shim"` (inline literal) AND `"the legacy-shaped fixture (old single-object channel, no
     back-compat shim) loads as [] / null"` (loads the real `fixtures/brand-profile.banned.yaml`, which
     still has the pre-ADR shape on disk — a genuine real-file proof, not just an inline literal).
   - New multi-Channel file: `fixtures/brand-profile.channels.yaml` (new, mirrors migrated Straw Motion
     shape) + the `loadChannels`/`loadPrimaryChannel` round-trip tests against it.
   - Malformed Channel entry: 10-way malformed-entry test (`null`, number, string, `{}`, blank/whitespace
     platform, non-string platform, non-string url, non-boolean primary) — none crash, well-formed
     entries survive, malformed default gracefully. Mirrored at the `checkConfig` layer by the new "no
     entry marked primary" test.

### Per-scenario results (OpenSpec spec deltas)

`openspec/changes/127-multi-channel-brand-profile/specs/production-spec/spec.md` (ADDED Requirement —
the Channel reader):

| Scenario | Result | Covering test |
|---|---|---|
| channelsFrom reads a multi-Channel list with one primary entry | PASS | `brand-profile.test.ts`: `"reads a multi-Channel list, one entry marked primary"` |
| channelsFrom returns [] for the pre-ADR-0019 single-object shape | PASS | `brand-profile.test.ts`: `"returns [] for the pre-ADR-0019 single-object channel shape — NO back-compat shim"` |
| channelsFrom drops malformed entries without crashing | PASS | `brand-profile.test.ts`: `"drops malformed entries defensively — never crashes (data-handling rule 4)"` |
| primaryChannelFrom returns one/null/first-of-multiple | PASS | `brand-profile.test.ts`: `"returns the entry marked primary: true"` / `"returns null when no entry is marked primary"` / `"picks the first entry deterministically when more than one is (mis)configured primary"` |
| loadChannels/loadPrimaryChannel degrade to []/null for a missing file | PASS | `brand-profile.test.ts`: `"a missing Brand Profile loads as [] / null, never crashes"` |

`openspec/changes/127-multi-channel-brand-profile/specs/readiness-classifier/spec.md` (MODIFIED
Requirement — `checkConfig`):

| Scenario | Result | Covering test |
|---|---|---|
| TODO placeholder in niche → advisory | PASS | pre-existing, unaffected by this slice |
| Niche unset → advisory | PASS | pre-existing, unaffected |
| Voice unset → advisory | PASS | pre-existing, unaffected |
| Fewer than 1 seed page blocks research | PASS | pre-existing, unaffected |
| Missing primary Channel URL blocks publish | PASS | `check-config.test.ts`: `"empty primary channel url → block on publish"` / `"missing url field on the primary entry → block on publish"` |
| No entry marked primary blocks publish, same as missing URL | PASS | `check-config.test.ts`: `"no entry marked primary → block on publish (code: channel_url_missing) — ADR-0019"` |
| The pre-ADR-0019 single-object channel shape blocks publish | PASS | Covered transitively — a `BrandProfile.channel` typed `unknown` holding the old object shape fails `Array.isArray` inside `primaryChannelFrom`/`channelsFrom`, returning `null`/`[]`, which is exactly the "no entry marked primary" path proven above. No separate literal-object test exists at the `check-config.test.ts` layer, but the underlying function is proven directly by `brand-profile.test.ts` at the unit layer, and the composed behavior is proven by the "no entry marked primary" scenario. Acceptable — not a gap. |
| Empty banned_words is advisory | PASS | pre-existing, unaffected |
| A fully healthy config produces no findings | PASS | `check-config.test.ts` `HEALTHY_PROFILE` (updated to list shape) + `run-pipeline.test.ts`'s AC2 "healthy Brand → no findings" |

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS | No producer/render/publish-path code touched; diff confined to Brand Profile reader + readiness checks + two Brand data files. |
| Public-metrics-only | PASS | No Apify/metrics code touched beyond a doc-comment-only edit in `src/apify/platform.ts` (confirmed no functional change — file never read `channel` at runtime). |
| Relative-not-absolute | PASS | `src/performance/{score,metrics}.ts` and the baseline machinery are untouched (`git status --porcelain` shows nothing under `src/performance/`) — the primary-Channel baseline comparison is unchanged, per ADR-0019's explicit deferral. |
| Explicit-attribution | PASS | No `post_url`/ledger-attribution code touched. |
| Ledger-as-source-of-truth | PASS | No ledger read/write path touched; `data/brands/<slug>/ledger.json` untouched by this diff. |
| Defensive parsing (data-handling rule 4) | PASS | `channelsFrom` never throws on a malformed `channel` value (non-array, non-object entries, wrong-typed fields) — proven by the 10-way malformed-entry test and the legacy-shape tests; `loadChannels`/`loadPrimaryChannel` degrade to `[]`/`null` on a missing file rather than rejecting. |
| Magnific fake / no live-Space calls | PASS | `grep -rn "spaces_\|creations_"` across every file in `git status --porcelain`'s changed/untracked set returns exactly one hit: a *test title string* in `run-pipeline.test.ts` — `"uses a fake Magnific port — no live spaces_* calls are made"` — asserting the fake is used, not a live call. No `spaces_*`/`creations_*` MCP invocation anywhere in the diff. This slice is pure-file YAML + data transforms; no Space involvement was ever plausible here. |

### Defect list

**Defect #1 — severity: high (not blocking this round's PASS) — new-Brand onboarding writer still emits
the pre-ADR-0019 single-object `channel` shape, which the new store cannot parse into a primary Channel.**

Confirmed by direct code read, independent of the Build Report's own disclosure:
- `src/brand/scaffolder.ts`'s `buildBrandProfile` (called live from `src/commands/run-pipeline.ts` line
  389, inside the reachable "no-argument / unknown-slug onboarding" flow — NOT dead code) still
  constructs `channel: { name, platform, url }` (the old object shape).
- `templates/brand-skeleton/brand-profile.yaml` (the manual copy-paste template a human is told to "copy
  ... and fill in") also still shows the old object shape.
- `channelsFrom`/`primaryChannelFrom` (this slice's own new reader) treat that shape identically to a
  missing `channel` key: `[]` / `null`.
- **No test anywhere in the suite exercises the scaffolder's/template's output through the new Channel
  reader or through `checkConfig`/`runReadiness`.** Confirmed by grep: `scaffolder.test.ts` and
  `scaffold-brand.test.ts` only assert against the OLD shape (`profile.channel.name`, `.platform`,
  `.url`) and never import or call `channelsFrom`/`primaryChannelFrom`/`checkConfig`/`runReadiness`.

**Practical effect:** a Brand onboarded via `/run-pipeline`'s interview, or via hand-copying the
template, from this point forward will have a `channel` field the new store reads as "no primary
Channel" — even once the Operator later fills in a real Channel URL per the template's own TODO
instructions or the deferred-field flow. The failure mode is *safe* (a correctly-labeled `block` /
`channel_url_missing` readiness finding, never a crash, never silent data loss) but it is *misleading*:
an Operator who followed the on-disk template's own instructions and filled in `channel.url` would see
"Channel URL is not configured" even though they configured it — just in the now-obsolete shape.

**Judgment call:** I am not failing this round on Defect #1, for four reasons: (a) ADR-0019 — the
authoritative document this issue implements — names exactly two callers ("readiness checks,
`src/apify/platform.ts`") in its own "Consequences" section and does not mention the onboarding
writer/template; (b) issue #127's own acceptance criterion 3 gives "readiness checks and
`src/apify/platform.ts`" as its own example search targets, matching the ADR's scope, not the scaffolder;
(c) it does not affect either currently-onboarded production Brand (Straw Motion, MundoTip — both
verified correctly migrated); (d) the gap is disclosed prominently, accurately, and specifically in the
Build Report's "Known limits" section, not hidden. However, per this round's brief, I am not letting it
"slide silently" either: it is a real, reachable, zero-test-coverage functional gap in a live
Brand-onboarding code path, and the broader spirit of acceptance criterion 3 ("every existing caller...
compiles/passes") plausibly covers it even though the ADR's named scope does not.

**Repro steps:**
1. `node --import tsx -e "import { buildBrandProfile } from './src/brand/scaffolder.ts'; console.log(JSON.stringify(buildBrandProfile({ name: 'Test', niche: 'x', voice: 'x', language: 'en', region: 'US', platform: 'facebook', seedPages: ['https://facebook.com/x'], channelUrl: 'https://www.facebook.com/test' })))"` — observe `channel: { name, platform, url }`, the old object shape, even with a `channelUrl` answer supplied.
2. `node --import tsx -e "import { primaryChannelFrom } from './src/production-spec/brand-profile.ts'; console.log(primaryChannelFrom({ channel: { name: 'Test', platform: 'facebook', url: 'https://www.facebook.com/test' } }))"` — prints `null`, confirming the scaffolder's output is unreadable by the new store even though a URL was supplied.
3. `grep -n "channelsFrom\|primaryChannelFrom\|checkConfig\|runReadiness" src/brand/scaffolder.test.ts src/brand/scaffold-brand.test.ts` — no matches, confirming zero test coverage bridges the two halves.

**Recommendation:** file a fast, small follow-up issue (e.g. "scaffolder + onboarding template emit the
new Channel-list shape") before any *new* Brand is onboarded through `/run-pipeline`, so the Operator
doesn't hit a confusing false "not configured" block. This does not need to gate this PR/merge given (a)
neither production Brand is affected and (b) the gap fails safely (loud block finding, not silent
breakage) — but it should not be left open indefinitely, since every future onboarding is affected until
fixed.

No other defects found. No critical or blocking issues.

### Overall

**PASS.** Suite is genuinely green (tsc, full test suite, docs suite, openspec --all --strict, all run
directly and confirmed, not assumed). All four acceptance criteria are met with real, passing tests that
exercise the actual code paths named in the issue. The OpenSpec spec deltas faithfully mirror ADR-0019's
decision (list shape, one primary, no `handle`, migrate-in-place/no-shim) and every declared Scenario
traces to a real passing test. Both production Brand Profiles are correctly migrated to the ADR's exact
platform lists with URLs preserved. No live Magnific/Space calls anywhere in the diff. All always-rules
hold, including defensive parsing of malformed Channel entries. One high-severity, non-blocking defect
(#1, the onboarding-scaffolder gap) is documented above with repro steps and a recommended fast
follow-up — it is real and should not be ignored, but it sits outside ADR-0019's own named scope and
does not affect either existing production Brand, so it does not gate this round's pass.
