# Slice Handoff — issue #143 (Schedule Batch: per-Brand Zoho Social Brand config in the Brand Profile)

One bidirectional doc: `developer` writes the Build Report below; `qa` appends a QA Verdict beneath it.
Nothing here is ever overwritten; a retry appends a new `Round-N Build` block.

---

## Build Report (Round 1)

### What changed

Added a typed, never-throwing reader for a Brand's **Zoho Social Brand** configuration to the existing
Brand Profile store (`src/production-spec/brand-profile.ts`), and shipped Straw Motion's real, Zoho
config into its committed `brand-profile.yaml`. This is the data-model slice PRD #140 (Schedule Batch)
calls for: which platforms group into which future CSV file (one per Zoho Social Brand), each
platform's EXACT Zoho channel label, and the IANA timezone that file's schedule times will be written
in — read through the existing store boundary, per-Brand, with nothing about straw-motion hardcoded in
the reader itself.

New exports on `src/production-spec/brand-profile.ts`:

- `ZohoChannelMapping` (`{ platform, label }`), `ZohoSocialBrand` (`{ name, timezone, channels }`).
- `ZohoConfigLookup` — a discriminated union, `ZohoConfigFound | ZohoConfigNotConfigured`, mirroring
  `src/format/baseline-prompt.ts`'s `BaselinePromptLookup` never-throwing convention:
  - `configured: true` — the full validated `zohoBrands` list.
  - `configured: false, reason: "not_configured"` — no `zoho` key at all (the ordinary, expected shape
    for a Brand that hasn't wired this yet — MundoTip today). Not an error.
  - `configured: false, reason: "malformed"` — a `zoho` key IS present but broken; `errors` lists EVERY
    problem found (never just the first).
- `zohoConfigFrom(raw, brand)` (pure) / `loadZohoConfig(path, brand)` (the async I/O shell). `brand` is
  an explicit, caller-supplied identity (mirrors `parseFormatFile(raw, slug)`) used only to name the
  Brand in the returned message.

**Design call (delegated to me by the issue): IANA timezone identifiers, not fixed offsets.** Each
Zoho Social Brand entry carries its own `timezone` (e.g. `"Europe/Berlin"`), validated at read time via
`Intl.DateTimeFormat` (Node's standard-library, ICU-backed timezone database — no new dependency): a
typo'd zone string is caught immediately as a `"malformed"` result rather than silently accepted and
only discovered later at export time. IANA zones were chosen because they need no new dependency and
because Zoho's own account settings present timezones by representative city, which map directly onto
IANA zone names. Each Zoho Social Brand keeps its OWN clock field (rather than one Brand-wide clock)
because PRD #140 records the Operator's two real Zoho Social Brands had actually drifted onto
different clocks before being manually aligned — the shape has to allow that, even though both are
`"Europe/Berlin"` today.

Also added: a defensive duplicate-platform check across all of one Brand's Zoho Social Brands (the same
platform can't be assigned to two different CSV files) — not explicitly named in the issue's acceptance
criteria, but a direct instance of "never a guess" (AC1): letting a platform silently belong to two
files would leave a downstream export to guess which one wins.

### Files touched

- `src/production-spec/brand-profile.ts` — new Zoho config types + `zohoConfigFrom`/`loadZohoConfig`
  (module doc updated to describe the addition).
- `src/production-spec/brand-profile.test.ts` — new test suites for both functions (18 new tests).
- `src/production-spec/fixtures/brand-profile.zoho.yaml` — new fixture, deliberately using DIFFERENT
  strings than the real Straw Motion config, to prove genuine parameterization.
- `data/brands/straw-motion/brand-profile.yaml` — real `zoho:` block added (two Zoho Social Brands, see
  below).
- `openspec/changes/issue-143-zoho-brand-config/{proposal.md,tasks.md,handoff.md,specs/production-spec/spec.md}`
  — this OpenSpec change.
- **Not touched:** `data/brands/mundotip/brand-profile.yaml` (deliberately — MundoTip's real Zoho
  wiring is out of scope per the issue; its profile carrying no `zoho` key is itself the "not
  configured" test case), `CONTEXT.md`, any command/CLI surface.

Straw Motion's real `zoho:` block (`data/brands/straw-motion/brand-profile.yaml`):

```yaml
zoho:
  brands:
    - name: "Straw Motion"
      timezone: "Europe/Berlin"
      channels:
        - platform: facebook
          label: Facebook
        - platform: instagram
          label: Instagram
        - platform: tiktok
          label: TikTok
    - name: "Straw Motion Personal"
      timezone: "Europe/Berlin"
      channels:
        - platform: linkedin
          label: LinkedInProfile
        - platform: x
          label: X
```

### How to run

```bash
# Type-check + full suite
npm test

# Just this slice's tests
node --import tsx --test src/production-spec/brand-profile.test.ts

# Docs suite (unaffected by this slice, run for completeness)
npm run test:docs

# OpenSpec validation
npx openspec validate issue-143-zoho-brand-config --strict
```

Results at handoff: `npm test` → **1657 pass / 0 fail (433 suites)** (baseline before this slice: 1639
pass / 0 fail / 430 suites — this slice adds 18 tests, 0 regressions). `npm run test:docs` → 134 pass /
0 fail, unaffected. `openspec validate --strict` → valid.

### Acceptance-criteria self-assessment

| # | Acceptance criterion | Proving test(s) |
|---|---|---|
| 1 | A typed loader reads the Zoho config defensively — missing or malformed config yields a clear error naming the Brand, never a crash or a guess | `src/production-spec/brand-profile.test.ts`: "a Brand with no zoho key gets a clear not-configured result, naming the Brand"; "a non-object zoho value is malformed, naming the Brand"; "missing/empty zoho.brands is malformed"; "a missing/blank timezone is malformed and named by index"; "an unrecognized IANA timezone string is malformed"; "missing/empty channels is malformed"; "a channel entry missing platform or label is malformed"; "a platform assigned to more than one Zoho Social Brand is malformed, naming the platform"; "never a guess: multiple independent problems are ALL reported, not just the first"; "never throws for any malformed shape"; `loadZohoConfig`'s "a missing Brand Profile file loads as not-configured, never crashes" |
| 2 | Straw Motion's committed profile carries the real grouping, labels, and clock, and the loader returns them | `loadZohoConfig` — "straw-motion's REAL committed brand-profile.yaml carries the real Zoho grouping/labels/clock" (asserts the exact facebook/instagram/tiktok + linkedin/x grouping, the exact `"LinkedInProfile"` label — never `"LinkedIn"` — and both Zoho Brands sharing one non-empty timezone, read from the actual on-disk file, not an inline literal) |
| 3 | A Brand without Zoho config gets a clear "not configured for Schedule Batch" result (MundoTip stays out of scope) | `loadZohoConfig` — "mundotip's REAL committed brand-profile.yaml is not configured for Schedule Batch (out of scope)" (reads the real, untouched MundoTip file and asserts `reason: "not_configured"`, message naming `"mundotip"`) |

### Fakes / fixtures used

- `src/production-spec/fixtures/brand-profile.zoho.yaml` — a plain-file YAML fixture (test-only, not
  read by any command).
- `src/production-spec/fixtures/nope.yaml` (pre-existing, non-existent path) — reused to prove a
  missing file degrades to `not_configured`.
- The REAL, committed `data/brands/straw-motion/brand-profile.yaml` and
  `data/brands/mundotip/brand-profile.yaml` — read directly in two tests, not fixtures, to prove the
  shipped config and the "not configured" case against the actual files the pipeline uses.
- **No Magnific fake used or needed.** This slice is plain-file YAML reading and pure data
  transforms only — no Space/MCP call of any kind appears anywhere in the diff (confirmed by grep for
  `spaces_*`/`creations_*` across the changed files: none found).

### Self-review notes

- Collapsed what could have been three separate string-shape checks (`platform`, `label`,
  `timezone`) into one small `nonEmptyString` helper, and reused the module's existing `isObject`
  guard rather than re-declaring one — kept the new code inside the file's existing idiom (local-var-
  first narrowing, mirroring `channelsFrom`'s style) rather than introducing a different pattern.
  There is no separate `str()`-with-default helper reused from elsewhere: this validator specifically
  needs to know WHETHER a field failed (to report it), not silently default it, so a distinct
  `nonEmptyString` (returns `null` on failure) was worth keeping separate from any silently-defaulting
  helper.
  - `Intl.DateTimeFormat` guard, mirroring the `try { } catch { return false }` shape.
- Confirmed `errors` collection never short-circuits: a Zoho Social Brand entry with both a bad
  `timezone` and empty `channels` reports both problems in one pass (tested explicitly).
- Confirmed no dead code / unused imports (`tsc --noEmit` and the full suite are both clean).
- Considered and rejected building `zohoConfigFrom`/`loadZohoConfig` in a new module — the issue
  explicitly asks to extend the existing profile shape + loader, and the existing module's own
  banned-words/CTA/hashtags/watermark/Channel readers already share this exact pure-function +
  async-I/O-wrapper convention, so extending it in place is the right call for module boundaries too.

### Known limits

- **No cross-validation against the Brand's own `channel` list.** A Zoho `platform` value is read as a
  free string; this slice does not check it's actually one of the Brand's configured Channels
  (`channelsFrom`'s list). Documented as a deliberate scope limit in the proposal — a later slice
  (likely the Schedule Batch export itself) can add that check if it proves necessary.
- **MundoTip's real Zoho wiring is not built** — explicitly out of scope per the issue; its profile is
  left untouched and simply reads as `not_configured`.
- **No CONTEXT.md glossary entry for "Zoho Social Brand"** — PRD #140 itself flags this term as a
  future "glossary candidate," not a requirement of this data-model slice; deferred to whichever slice
  next needs it (likely the export command).
- **The Schedule Batch export command itself does not exist yet** — this slice only builds the
  configuration this future command will read; it is not wired into any command/CLI surface.

---

## QA Verdict — Round 1: PASS

### Suite result

- Command run: `npm test` (type-checks via `tsc --noEmit` then runs the full Node-test-runner suite).
- Result: **1657 pass / 0 fail / 433 suites**, actually executed (full output observed, not taken on
  faith). Baseline before this slice was 1639 pass / 0 fail / 430 suites — this slice adds exactly 18
  new tests (all under `zohoConfigFrom`/`loadZohoConfig`) with zero regressions elsewhere.
- `npm run test:docs` → 134 pass / 0 fail (unaffected by this slice, run for completeness — matches
  Build Report).
- `npx openspec validate issue-143-zoho-brand-config --strict` → `Change 'issue-143-zoho-brand-config'
  is valid`.
- `npx openspec list --changes` → shows the change `✓ Complete`.

### Per-criterion results

| # | Acceptance criterion | Result | Evidence |
|---|---|---|---|
| 1 | A typed loader reads the Zoho config defensively — missing or malformed config yields a clear error naming the Brand, never a crash or a guess | PASS | Code: `zohoConfigFrom` (`src/production-spec/brand-profile.ts:366-455`) never throws for any input shape (`isObject`-guarded, no unguarded property access, no thrown errors in the function body); `zohoConfigMalformed` always sets `message` to a string interpolating `brand` (line 338) and `errors` to the full itemized list (never short-circuits — `errors.push` calls continue for every check per entry, e.g. lines 407-444 all run even after an earlier push). Tests: "a Brand with no zoho key gets a clear not-configured result, naming the Brand" (line 265), "a non-object zoho value is malformed, naming the Brand" (383), "missing/empty zoho.brands is malformed" (393), "a missing/blank timezone is malformed and named by index" (402), "an unrecognized IANA timezone string is malformed" (420 — independently verified `Intl.DateTimeFormat` genuinely rejects `"Not/AZone"` and accepts `"Europe/Berlin"` via a standalone `node -e` check), "missing/empty channels is malformed" (442), "a channel entry missing platform or label is malformed" (457), "a platform assigned to more than one Zoho Social Brand is malformed, naming the platform" (484), "never a guess: multiple independent problems are ALL reported, not just the first" (511, asserts `errors.length >= 2` for one entry with two independent problems), "never throws for any malformed shape" (529, covers `null`/`undefined`/`{}`/`{ zoho: null }`/`{ zoho: 7 }`/`{ zoho: { brands: "nope" } }`), and `loadZohoConfig`'s "a missing Brand Profile file loads as not-configured, never crashes" (546). All 18 zoho tests observed passing in the live `npm test` run. |
| 2 | Straw Motion's committed profile carries the real grouping, labels, and clock, and the loader returns them | PASS | `data/brands/straw-motion/brand-profile.yaml` carries exactly the grouping the issue specifies: main file `facebook`/`instagram`/`tiktok` (labels `Facebook`/`Instagram`/`TikTok`), second file `linkedin`/`x` (labels `LinkedInProfile`/`X`), both `timezone: "Europe/Berlin"`. Test: "straw-motion's REAL committed brand-profile.yaml carries the real Zoho grouping/labels/clock" (`brand-profile.test.ts:555`) reads the actual on-disk file via `loadZohoConfig(STRAW_MOTION_PROFILE, "straw-motion")` (not an inline literal — `STRAW_MOTION_PROFILE = join("data","brands","straw-motion","brand-profile.yaml")`), asserts the exact platform grouping per file, asserts the `linkedin` channel's `label` is exactly `"LinkedInProfile"` (never `"LinkedIn"`), and asserts both Zoho Social Brands share one non-empty timezone. Observed passing. |
| 3 | A Brand without Zoho config gets a clear "not configured for Schedule Batch" result (MundoTip stays out of scope) | PASS | `data/brands/mundotip/brand-profile.yaml` confirmed to carry no `zoho` key at all (read directly) — deliberately untouched. Test: "mundotip's REAL committed brand-profile.yaml is not configured for Schedule Batch (out of scope)" (`brand-profile.test.ts:582`) reads the real file via `loadZohoConfig(MUNDOTIP_PROFILE, "mundotip")`, asserts `reason: "not_configured"` and `message` matches `/mundotip/`. The code's actual message text (`zohoConfigFrom` lines 375-377) literally reads "...not configured for Schedule Batch...", matching the issue's exact wording. Observed passing. |

### Per-scenario results (spec deltas, `specs/production-spec/spec.md`)

| Scenario | Result | Covering test |
|---|---|---|
| A Brand with no zoho key gets a clear not-configured result, naming the Brand | PASS | `brand-profile.test.ts:265` + `:582` (real MundoTip file) |
| A well-formed two-Zoho-Brand config is read in full | PASS | `:283` "reads a well-formed two-Zoho-Brand config" |
| A missing name defaults to '' without being a validation problem | PASS | `:336` "defaults a Zoho Social Brand's missing name to '' — not an error" |
| A non-object zoho value is malformed, naming the Brand | PASS | `:383` |
| Missing or empty zoho.brands is malformed | PASS | `:393` |
| A missing or unrecognized timezone is malformed | PASS | `:402` + `:420` |
| Missing or empty channels, or a channel missing platform/label, is malformed | PASS | `:442` + `:457` |
| A platform assigned to more than one Zoho Social Brand is malformed, naming the platform | PASS | `:484` |
| Multiple independent problems are ALL reported, never just the first | PASS | `:511` |
| The function never throws for any malformed shape | PASS | `:529` |
| loadZohoConfig degrades a missing file to not_configured, never crashes | PASS | `:546` |
| Straw Motion's real, committed Brand Profile carries the real grouping, labels, and clock | PASS | `:555` |
| MundoTip's real, committed Brand Profile is not configured for Schedule Batch | PASS | `:582` |

Additionally checked but not separately itemized as its own Scenario in the spec: string-trimming
(`name`/`timezone`/`platform`/`label`) is covered by "trims platform, label, name, and timezone"
(`:356`) — matches the Requirement's closing paragraph ("Every string field read ... SHALL be trimmed
of surrounding whitespace").

### OpenSpec faithfulness to the issue (job c)

- Read `proposal.md`, `tasks.md`, and `specs/production-spec/spec.md` against the issue verbatim and
  against parent issue #140 (fetched via `gh issue view 140`). The grouping, exact labels
  (`LinkedInProfile`/`X`, never `LinkedIn`), and clock (`Europe/Berlin`, CEST) all match both the issue
  and #140's "Implementation Decisions" section verbatim (#140 explicitly says "both Zoho Brands stay
  on the Operator's clock (CEST today)" and "the Zoho-Brand clock is per-Brand configuration alongside
  the channel grouping").
- The IANA-timezone-identifier design call is explicitly flagged in the proposal as delegated by the
  issue (the issue only says "Zoho Brand clock (timezone)", no specific format) — #140 doesn't mandate
  a format either, so this is a reasonable, well-documented design choice, not a misread.
- The extra duplicate-platform-across-files check is additive and consistent with AC1's "never a
  guess" language and with #140 story 11 ("platform→CSV-file grouping ... per-Brand configuration") —
  does not contradict or narrow anything the issue asked for.
- Non-Goals section correctly scopes out the export command itself, the Media Host port (#144), ledger
  `scheduled_at` round-tripping (#141), the X 280-char cap (#142), and MundoTip's actual wiring — all
  consistent with the issue's "Blocked by: None" (independently buildable) and #140's own "Out of
  Scope" list ("MundoTip wiring — ... its own later task").
- No scope creep found: no command/CLI surface was touched (`grep -rl` for the new exports outside
  `brand-profile.ts`/its test found nothing), `CONTEXT.md` untouched, `data/queue.json` /
  `data/brands/*/ledger.json` untouched (confirmed via `git status` — this branch's diff is exactly
  `data/brands/straw-motion/brand-profile.yaml`, `src/production-spec/brand-profile.{ts,test.ts}`, the
  new fixture, and the OpenSpec change folder).
- Verdict: the spec is green against itself AND green against the issue and its parent #140 — no
  misread, no self-consistent-but-wrong spec found.

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS (N/A, correctly unaffected) | No publish-path code touched; no command/CLI surface wired to this reader yet (`grep -rl "zohoConfigFrom\|loadZohoConfig\|ZohoConfigLookup\|ZohoSocialBrand" src --include="*.ts"` outside `brand-profile.ts`/its test returns nothing). |
| Public-metrics-only | PASS (N/A, correctly unaffected) | No metrics/Apify code touched. |
| Relative-not-absolute | PASS (N/A, correctly unaffected) | No scoring/baseline code touched. |
| Explicit-attribution | PASS (N/A, correctly unaffected) | No Post/`post_url` code touched. |
| Ledger-as-source-of-truth | PASS (N/A, correctly unaffected) | No ledger-write path touched; `data/brands/*/ledger.json` and `data/queue.json` do not appear in this branch's diff. |
| ISO-8601 timestamps | PASS (N/A, correctly unaffected) | No timestamp field introduced by this slice (`timezone` is an IANA zone identifier, not a timestamp). |
| Magnific fake / no live-Space calls | PASS | `grep -rn "spaces_\|creations_" src/production-spec/brand-profile.ts src/production-spec/brand-profile.test.ts src/production-spec/fixtures/brand-profile.zoho.yaml data/brands/straw-motion/brand-profile.yaml` → no matches (grep exit 1). This slice is plain-file YAML reading + pure data transforms only; no Magnific fake was needed or used, matching the Build Report's own claim. |

### Defect list

None.

### Overall

**PASS.** The suite is fully green (1657/0/433, 18 new tests, zero regressions), every acceptance
criterion is backed by a real test that exercises the actual on-disk Straw Motion/MundoTip Brand
Profiles (not synthetic-only fixtures), every spec-delta Scenario is covered, the OpenSpec change
faithfully matches both issue #143 and its parent #140, no live-Space/Magnific calls exist anywhere in
the diff, and the always-rules are correctly untouched by this pure-data-model slice.
