# Slice Handoff — issue #130: LinkedIn @mention insertion using the handle lookup

Bidirectional channel between `developer` and `qa`. developer writes the Build Report below; `qa`
appends its Verdict beneath it. Nothing here is ever overwritten — a retry appends a new `Round-N
Build` block.

---

## Build Report (Round 1)

### What changed

Wires issue #126's LinkedIn Handle Lookup into Copy composition — the LAST link in epic #120's chain.
For the LinkedIn Copy variant only (`composeCopyForChannels`, #129), every company/product named in the
chosen Recipe's own STRUCTURED companies data (News Carousel's `CopySlideBeat.companies`, PR #122;
Character Explainer's `CopyInput.companies`, #125 — never free prose) is resolved through
`resolveLinkedInHandle` (#126) and woven into the caption: the literal `@Name` text (the plain name, not
the raw handle slug — the exact string the Operator selects from LinkedIn's own compose-box dropdown at
typing time, since OrganicGrowth can never embed a functioning tag itself) for every name that resolves,
or the plain name — flagged via a new `unresolvedMentions` field, surfaced in the output bundle for
Operator review — for every name that doesn't. Zero companies is a no-op: the LinkedIn variant is
byte-for-byte identical to #129's baseline. Every other targeted platform (including the primary
Channel) is completely untouched by this step.

New pure module `src/copy/linkedin-mentions.ts` does the work (mirroring `inject.ts`'s pure-logic shape
plus a thin async I/O shell): `companiesFromCopyInput` gathers the Spec's structured companies data,
`buildLinkedInMentionResolutions` turns an already-resolved name→handle map into `@Name`/plain-text
decisions, `injectLinkedInMentions` deterministically weaves them into a caption (append-if-missing,
dedupe-if-present — mirrors `injectRequiredCta`), `unresolvedMentionNames` extracts the flag list, and
`weaveLinkedInMentions` is the async shell tying it together against the real lookup file.
`composeCopyForChannels` calls this, per-Channel, for any platform whose `PlatformCopyShape` declares
`supportsMentions: true` (today: `linkedin` alone) — after `injectRequiredParts`, before validation, so
`validateCopyForPlatform`'s existing syntax check always inspects the final, mention-woven text.

### Files touched

- `src/copy/linkedin-mentions.ts` (new) — the pure mention-resolution module + async shell.
- `src/copy/linkedin-mentions.test.ts` (new) — 25 tests.
- `src/copy/fixtures/linkedin-handles.copy-tests.yaml` (new) — a small, static fixture (`OpenAI`/
  `Anthropic` resolve; everything else doesn't) for `compose.test.ts`'s integration tests.
- `src/copy/contract.ts` — `CopyVariant` gains an optional `unresolvedMentions?: readonly string[]`.
- `src/copy/compose.ts` — `ComposeCopyOptions` gains an optional `linkedInHandlesPath`;
  `composeCopyForChannels`'s per-Channel loop calls `weaveLinkedInMentions` for a mentions-supporting
  platform and carries `unresolvedMentions` onto that platform's `CopyVariant`. `composeCopy` itself is
  completely unmodified.
- `src/copy/compose.test.ts` — 5 new tests (all resolve / some unresolved / zero companies / grounded-
  never-invented / News-Carousel `slideNarrative` companies threaded through).
- `src/asset/output-bundle.ts` — `cloneCopy` deep-clones each variant's `unresolvedMentions`;
  `captionText` gains an `unresolvedMentionsNote` helper appending a flagged note inside that variant's
  own block.
- `src/asset/output-bundle.test.ts` — 5 new tests (post.json carries + clones `unresolvedMentions`,
  `captionText` flags/doesn't-flag correctly, byte-identical when absent/empty).
- `.claude/skills/write-social-copy/SKILL.md` — documents the new deterministic mention-resolution step
  (replaces the old "defers to issue #130" language).
- `.claude/agents/producer.md` — Copy-phase section updated the same way.
- `src/copy/write-social-copy-skill.docs-test.ts` — the old "defers ... to issue #130" pinned test
  replaced with two tests pinning the new prose (names `weaveLinkedInMentions`/`resolveLinkedInHandle`/
  `linkedin-handle`, states the unresolved-fallback/flag behavior).
- `openspec/changes/130-linkedin-mention-insertion/` (this change) — `proposal.md`, `tasks.md`, spec
  deltas for `copy-composition` (1 ADDED Requirement, 3 MODIFIED) and `asset-output-bundle` (1 MODIFIED).

Not touched: `src/linkedin-handle/*` (the #126 lookup store/module — only a new CALLER was added, no
change to its own behavior), `CONTEXT.md` (the **Copy** glossary entry already names "mentions" as part
of Copy's shape since #129 — no new domain term is coined by this slice).

### How to run

```bash
npm test                                   # type-check + full unit suite
npm run test:docs                          # SKILL.md/producer.md doc-conformance suite
npx openspec validate 130-linkedin-mention-insertion --strict

# This slice's own tests in isolation:
node --import tsx --test src/copy/linkedin-mentions.test.ts
node --import tsx --test src/copy/compose.test.ts
node --import tsx --test src/asset/output-bundle.test.ts
node --import tsx --test src/copy/write-social-copy-skill.docs-test.ts
```

Results at handoff: `npm test` — **1639/1639 passing** (baseline before this slice: 1606; +33 new
tests, confirmed by diff: 25 in new `linkedin-mentions.test.ts`, +5 in `compose.test.ts`, +3 in
`output-bundle.test.ts`). `npm run test:docs` — **134/134 passing** (baseline 133; the old "defers to
#130" test was replaced by 2 new ones in `write-social-copy-skill.docs-test.ts`, net +1).
`tsc --noEmit` clean. `openspec validate 130-linkedin-mention-insertion --strict` — valid.

### Acceptance-criteria self-assessment

| # | Acceptance criterion | Proving test(s) |
|---|---|---|
| 1 | The LinkedIn Copy variant names each Spec-recorded company/product using the literal `@Name` convention when #126's lookup resolves a handle. | `src/copy/compose.test.ts` → `"names every Spec-recorded company that resolves as @Name on the LinkedIn variant ONLY"`; `src/copy/linkedin-mentions.test.ts` → `"marks a resolved company as @Name (the plain name, never the raw handle slug), resolved: true"` and `"weaves @Name for every company when all resolve, unresolvedMentions is empty"` |
| 2 | An unresolved company/product name falls back to plain text and is flagged (e.g. a note in the output bundle) for Operator review — never silently dropped, never blocking the caption. | `src/copy/compose.test.ts` → `"falls back an unresolved company to plain text and flags it — never blocks the caption"` (result is still `ok: true`); `src/asset/output-bundle.test.ts` → `"flags a variant's unresolved mentions in its OWN block, for Operator review, naming every one"` and `"carries a variant's unresolvedMentions through onto post.json, deep-cloned (issue #130)"` |
| 3 | No company/product absent from the Spec's structured data is ever mentioned (grounded, never invented — mirrors PR #122's rule). | `src/copy/compose.test.ts` → `"never mentions a company absent from the Spec's own companies data, even though the fixture lookup would resolve it"`; `src/copy/linkedin-mentions.test.ts` → `"never reads free-prose fields (title/angle/mediaContext) — only the structured companies data"` and `"never mentions a company absent from the Spec's own companies data, even if the lookup would resolve it"` |
| 4 | Tests cover: all names resolve, some unresolved, and zero companies (unchanged from #129's baseline). | All-resolve: `compose.test.ts` → `"names every Spec-recorded company that resolves..."`. Some unresolved: `compose.test.ts` → `"falls back an unresolved company..."`. Zero companies: `compose.test.ts` → `"zero companies produces the exact pre-#130 LinkedIn variant, byte for byte"` (asserted `deepEqual` against the SAME call made without `linkedInHandlesPath` at all) plus `output-bundle.test.ts` → `"renders NO note for a variant with unresolvedMentions omitted or empty (byte-identical to before issue #130)"` |

### Fakes / fixtures used

- **No Magnific fake needed.** This slice has no Space/MCP code at all — pure Copy composition + a
  plain-file lookup. Confirmed by `grep -n "spaces_\|creations_"` across every touched file: zero
  matches. No live Space, no credits, no board mutation.
- `src/copy/fixtures/linkedin-handles.copy-tests.yaml` — a small, static, committed fixture (new) used
  by `compose.test.ts`'s integration tests: resolves `OpenAI`/`Anthropic`, nothing else.
- `src/copy/linkedin-mentions.test.ts`'s `weaveLinkedInMentions` tests use `mkdtemp`-isolated temp
  `linkedin-handles.yaml` files (mirroring `src/linkedin-handle/store.test.ts`'s own pattern) — never
  touch the real, committed `data/linkedin-handles.yaml` except in two explicit "never throws against
  the real file" smoke tests (read-only, mirroring `resolveLinkedInHandle`'s own existing test
  convention in `store.test.ts`).
- `src/copy/fixtures/brand-profile.copy-rules.yaml` / `brand-profile.no-rules.yaml` — pre-existing
  fixtures, reused unchanged by the new `compose.test.ts` tests.

### Self-review notes

- Considered whether `weaveLinkedInMentions` should REPLACE an existing plain-text mention in the
  drafter's own prose rather than APPEND a new one. Rejected: the deterministic fake drafters
  (`defaultDraftCopy`/`skillDraftCopy`) never write company names into the caption at all (that's
  documented as the real `write-social-copy` Skill's own LLM judgment call), so a replace-only strategy
  would silently do nothing in the test-provable path. Appending (mirroring `inject.ts`'s own
  append-if-missing pattern) guarantees every Spec-recorded, resolvable name is genuinely named
  somewhere in the composed caption, regardless of what the drafter did on its own — and still dedupes
  against a name a real Skill run DID already write naturally.
- Considered adding `unresolvedMentions` to the top-level `Copy` type too (not just `CopyVariant`), so a
  single-Channel Brand whose ONE Channel happens to be LinkedIn wouldn't lose the flag data when the
  `variants` field is omitted. Decided against it — no current Brand has a single LinkedIn-only Channel
  (both real Brands' primary is Facebook), the multi-Channel case (the actually-configured, tested
  shape) already surfaces the flag correctly via `CopyVariant.unresolvedMentions`, and adding an unused
  top-level field would have been speculative scope beyond what the issue or either real Brand's config
  needs. Documented as a known limit below instead.
- Confirmed `composeCopy` (the single-shape function, still used directly by both wired Recipes' own
  Facebook-primary path) is byte-for-byte unchanged — `git diff` shows zero lines touched in that
  function.
- Confirmed `validateCopy`/`validateCopyForPlatform` are byte-for-byte unchanged — this slice only ever
  feeds them an already-woven caption; it never touches the checker itself.
- Removed no dead code (nothing pre-existing was made obsolete by this slice); no unused imports (`tsc
  --noEmit` with `noUnusedLocals`/`noUnusedParameters` on confirms).

### Known limits

- A single-Channel Brand whose ONE Channel is itself LinkedIn gets its caption woven with mentions (the
  per-Channel loop runs regardless of channel count), but the resulting `unresolvedMentions` flag is NOT
  surfaced at the top-level `Copy` in that specific collapsed shape (no `variants` field is emitted for
  exactly one Channel, per AC1/AC5's pre-existing contract) — see self-review note above. Neither real
  Brand is in this configuration today (both have Facebook primary); would need a small follow-up if a
  Brand is ever configured LinkedIn-primary-and-only.
- `injectLinkedInMentions`'s dedupe check and `scanAtHandleMentionSyntax`'s syntax check (#128, unmodified
  by this slice) both key off the text immediately following `@` up to the next whitespace — a
  multi-word company/product name (e.g. a hypothetical "Meta Platforms") would weave in as `@Meta
  Platforms`, but only the `"Meta"` token is what the existing syntax checker actually inspects. This is
  a pre-existing characteristic of #128's syntax checker, not something this slice changes or was asked
  to fix; the two committed real names (`OpenAI`, `Anthropic`) and the shipped `data/linkedin-handles.yaml`
  example entries (`Anthropic`, `1Password`) are all single-word/no-space names, so this has not been a
  practical problem yet.
- The appended "Mentions: ..." sentence is deterministic scaffolding proving the pipeline (draft → inject
  → weave → validate) genuinely names every resolvable company — it is NOT a claim about what the real
  `write-social-copy` Skill's own LLM prose will look like in production (the Skill is free to name a
  company naturally in its own sentence; `weaveLinkedInMentions`'s dedupe means it won't double up if the
  Skill already did).

---

## QA Verdict — Round 1: PASS

### Suite result

All commands run from the worktree root, against the working tree as handed off (no code edited by QA):

- `npm test` (type-check via `tsc --noEmit` + full `node:test` suite) — **1639/1639 passing, 0 failed**.
  Matches the Build Report's claimed count exactly.
- `npm run test:docs` — **134/134 passing, 0 failed**. Matches the Build Report's claimed count.
- `npx tsc --noEmit` — clean, no output.
- `npx openspec validate --all --strict` — **32/32 passed, 0 failed**, including
  `✓ change/130-linkedin-mention-insertion` and every archived spec (`copy-composition`,
  `asset-output-bundle`, etc.).

All four commands were actually executed in this session (not assumed) and produced the results above.

### Per-criterion results (issue #130 acceptance criteria)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | LinkedIn variant names a resolved company as literal `@Name` (plain name, not raw handle slug) | PASS | `buildLinkedInMentionResolutions` (`src/copy/linkedin-mentions.ts:87-97`) builds `mention: `@${name}`` from the plain `name`, never the handle value. Proven by `linkedin-mentions.test.ts` ("marks a resolved company as @Name... never the raw handle slug") and `compose.test.ts` ("names every Spec-recorded company that resolves as @Name on the LinkedIn variant ONLY") — asserts `@OpenAI`/`@Anthropic` present, handle slugs (`"openai"`/`"anthropic"`) never asserted or produced. |
| 2 | Unresolved name falls back to plain text AND is flagged in the output bundle for Operator review, never silently dropped | PASS | `unresolvedMentionNames` collects unresolved names; `compose.ts` carries them onto `CopyVariant.unresolvedMentions`; `output-bundle.ts`'s new `unresolvedMentionsNote` renders a note line inside that variant's own `caption.txt` block. Genuinely surfaced (not computed-and-discarded) — verified by reading `output-bundle.ts`'s diff directly and by `output-bundle.test.ts`'s "flags a variant's unresolved mentions in its OWN block, for Operator review" and "carries a variant's unresolvedMentions through onto post.json, deep-cloned". |
| 3 | Never block the caption on one unresolved handle | PASS | `compose.test.ts`'s "falls back an unresolved company to plain text and flags it — never blocks the caption" asserts `result.ok === true`. By construction `weaveLinkedInMentions` never returns an error and the woven text is always well-formed (`@Name` for resolved, plain unprefixed text for unresolved), so `validateCopyForPlatform`'s mention-syntax check never rejects it. |
| 4 | No company/product outside the Spec's structured companies list is ever mentioned; grounded strictly in structured data | PASS | `companiesFromCopyInput` (`linkedin-mentions.ts:48-64`) reads only `input.companies` and `input.slideNarrative[].companies` — never `title`/`angle`/`mediaContext`. Proven by `linkedin-mentions.test.ts`'s "never reads free-prose fields" and `compose.test.ts`'s "never mentions a company absent from the Spec's own companies data, even though the fixture lookup would resolve it" (Anthropic resolves in the fixture but is absent from that test's Idea data and never appears in the caption). |
| 5 | Zero companies produces the LinkedIn variant identical to #129's pre-#130 baseline | PASS | `injectLinkedInMentions`/`weaveLinkedInMentions` both short-circuit to the caption unchanged for zero companies (before any file I/O). `compose.test.ts`'s "zero companies produces the exact pre-#130 LinkedIn variant, byte for byte" calls `composeCopyForChannels` both with and without `linkedInHandlesPath` and asserts `deepEqual` on the whole result — genuinely proves byte-identical output, not just an eyeballed absence of `Mentions:` text. |
| 6 | This logic is LinkedIn-only; other platform variants unaffected | PASS | In `compose.ts`, `weaveLinkedInMentions` is gated by `platformCopyShapeFor(channel.platform)?.supportsMentions === true` — today true only for `linkedin` (`platform-shape.ts`, unmodified by this slice). `compose.test.ts`'s first new test explicitly asserts facebook/instagram/x/tiktok variants never carry `@OpenAI`/`@Anthropic` or an `unresolvedMentions` field for the identical companies data. |
| 7 | Tests cover all-resolve / some-unresolved / zero-companies | PASS | All three present and passing in `compose.test.ts` (see rows 1, 2, 5 above) plus mirrored coverage at the pure-function level in `linkedin-mentions.test.ts` (25 tests total). |

### Per-scenario results (OpenSpec spec deltas)

**`copy-composition` — ADDED Requirement (`linkedin-mentions.ts`):**

| Scenario | Result | Covering test |
|---|---|---|
| companiesFromCopyInput merges both grains, deduped, ignoring free prose | PASS | `linkedin-mentions.test.ts` — "returns input.companies unchanged...", "merges every slideNarrative beat's companies...", "dedupes case-insensitively...", "never reads free-prose fields..." |
| buildLinkedInMentionResolutions marks resolved as @Name, unresolved as plain text | PASS | `linkedin-mentions.test.ts` — "marks a resolved company as @Name...", "marks an unresolved company as its own plain name..." |
| injectLinkedInMentions appends missing, dedupes present, no-op for zero | PASS | `linkedin-mentions.test.ts` — "returns the caption completely unchanged for zero resolutions", "appends a resolved mention...", "does NOT duplicate a mention already present..." |
| weaveLinkedInMentions resolves/weaves/reports against the real lookup file | PASS | `linkedin-mentions.test.ts` — "weaves @Name for a resolved company and plain text for an unresolved one..." |
| weaveLinkedInMentions never touches disk for zero companies | PASS | `linkedin-mentions.test.ts` — "short-circuits BEFORE any file read for zero companies — never throws against a nonexistent path" |

**`copy-composition` — MODIFIED Requirement (`Copy carries an optional per-platform variants field...`):**

| Scenario | Result | Covering test |
|---|---|---|
| A single-Channel Copy has no variants field | PASS | Pre-existing #129 coverage, unaffected; re-confirmed green in this run. |
| A multi-Channel Copy's top-level fields mirror the primary variant | PASS | Pre-existing #129 coverage, unaffected. |
| A variant with every mention resolved carries no unresolvedMentions field | PASS | `compose.test.ts` — "names every Spec-recorded company that resolves as @Name..." asserts `"unresolvedMentions" in linkedin === false`. |
| A non-LinkedIn variant never carries unresolvedMentions, even with the same companies data | PASS | Same test — asserts every non-LinkedIn platform never carries the field for identical companies data. |

**`copy-composition` — MODIFIED Requirement (`composeCopyForChannels composes one variant per targeted Channel platform...`):**

| Scenario | Result | Covering test |
|---|---|---|
| Single-(primary)-Channel result identical to composeCopy | PASS | Pre-existing #129 coverage, re-confirmed green; `composeCopy` itself byte-for-byte unchanged (verified directly, see Always-rules section below). |
| Multi-Channel Brand composes one labeled variant per platform | PASS | Pre-existing #129 coverage. |
| Primary Channel never consults platform-shape.ts bounds | PASS | Pre-existing #128/#129 coverage, unaffected by this slice's diff (confirmed no lines touched in that branch). |
| Each non-primary variant validated against its own bounds | PASS | Pre-existing #128 coverage. |
| Every targeted platform's failures collected; partial Copy never surfaced | PASS | Pre-existing #129 coverage. |
| A malformed LinkedIn @mention fails only the LinkedIn variant | PASS | Pre-existing #128/#129 coverage — still exercises `validateCopyForPlatform` on the (now mention-woven) caption; still green. |
| An undocumented platform falls back to baseShape | PASS | Pre-existing #128 coverage. |
| Every Spec-recorded company that resolves is named @Name on the LinkedIn variant | PASS | `compose.test.ts` — "names every Spec-recorded company that resolves as @Name on the LinkedIn variant ONLY". |
| An unresolved company falls back to plain text and is flagged, never blocking | PASS | `compose.test.ts` — "falls back an unresolved company to plain text and flags it — never blocks the caption". |
| Zero companies produces the exact pre-#130 LinkedIn variant, byte for byte | PASS | `compose.test.ts` — "zero companies produces the exact pre-#130 LinkedIn variant, byte for byte". |
| A company absent from the Spec's own companies data is never mentioned, even if resolvable | PASS | `compose.test.ts` — "never mentions a company absent from the Spec's own companies data...". |

**`copy-composition` — MODIFIED Requirement (`write-social-copy documents composing one Copy variant per targeted platform`):**

| Scenario | Result | Covering test |
|---|---|---|
| The Skill instructs one distinct caption per targeted platform | PASS | Pre-existing #129 doc-test coverage. |
| The Skill documents the deterministic LinkedIn mention-resolution step | PASS | `write-social-copy-skill.docs-test.ts` — "resolves LinkedIn @mentions via issue #126's lookup, deterministically (issue #130)" and "states an unresolved company/product falls back to plain text, flagged for Operator review". Read `SKILL.md`'s own diff directly (Step 2 + "what this Skill does not do") and confirmed the pinned assertions genuinely match the prose. |

**`asset-output-bundle` — MODIFIED Requirement (`generatePostJson and captionText carry and render every Copy variant, labeled by platform`):**

| Scenario | Result | Covering test |
|---|---|---|
| post.json carries every variant, unchanged from the ledger's own Copy | PASS | Pre-existing #129 coverage. |
| An Asset's Copy with no variants field yields no variants key | PASS | Pre-existing #129 coverage. |
| captionText renders every variant, labeled, paste-ready | PASS | Pre-existing #129 coverage. |
| Absent/empty variants array renders byte-identical output | PASS | Pre-existing #129 coverage; the NEW "renders NO note for a variant with unresolvedMentions omitted or empty" test additionally re-proves byte-identical output for the specific unresolvedMentions-absent/empty case with an exact string `assert.equal` against a hand-built expected string. |
| post.json carries a variant's unresolvedMentions, deep-cloned | PASS | `output-bundle.test.ts` — "carries a variant's unresolvedMentions through onto post.json, deep-cloned (issue #130)" — asserts `deepEqual` on values AND `notEqual` on reference identity. |
| captionText flags a variant's unresolved mentions in its own block | PASS | `output-bundle.test.ts` — "flags a variant's unresolved mentions in its OWN block, for Operator review, naming every one" — asserts the note appears in the LinkedIn block and explicitly NOT in the Facebook block (no cross-variant leak). |
| A variant with no unresolvedMentions renders byte-identical to before #130 | PASS | `output-bundle.test.ts` — same test as above, second half: exact string equality against a hand-built expected block for both "omitted" and "explicit empty array" cases. |

### OpenSpec faithfulness to the issue

- The proposal, `tasks.md`, and both spec deltas accurately restate issue #130's ask: resolve every
  company/product from the chosen Recipe's own STRUCTURED companies data (never free prose) through
  #126's lookup, weave `@Name` when resolved, plain-text-plus-flag when not, never block the caption,
  LinkedIn-only. No scope creep found, no dropped criterion, no contradiction with CONTEXT.md/ADRs — the
  proposal's Non-Goals section correctly excludes a real LinkedIn API call, free-prose scanning, and
  publishing/tracking (all correctly out of scope per ADR-0002/ADR-0019).
- **MODIFIED-header convention, checked directly** (the exact mistake a previous slice in this chain
  failed archive over): `grep -n "^### Requirement" openspec/specs/copy-composition/spec.md` and
  `openspec/specs/asset-output-bundle/spec.md` (the pre-archive, currently-merged specs) confirm every
  MODIFIED Requirement title in this change's spec deltas exists **verbatim** in the archived spec:
  - `"Copy carries an optional per-platform variants field, additive to the single caption/hashtags shape"` — verbatim match, `copy-composition/spec.md:491`.
  - `"composeCopyForChannels composes one variant per targeted Channel platform, from the same underlying material"` — verbatim match, `copy-composition/spec.md:513`.
  - `"write-social-copy documents composing one Copy variant per targeted platform"` — verbatim match, `copy-composition/spec.md:591`.
  - `"generatePostJson and captionText carry and render every Copy variant, labeled by platform"` — verbatim match, `asset-output-bundle/spec.md:140`.
  - The one ADDED Requirement title (`"linkedin-mentions.ts resolves and weaves LinkedIn @mentions..."`) is confirmed genuinely NEW — absent from the existing `copy-composition/spec.md` Requirement list.
  - `npx openspec validate --all --strict` is green end-to-end (32/32), consistent with this.

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS | This slice has no publish path at all — pure Copy text composition. Confirmed no `post_url`/publish-adjacent code touched (diff limited to `copy/`, `asset/output-bundle.ts`, docs). |
| Public-metrics-only | N/A / PASS | No metrics code touched by this slice. |
| Relative-not-absolute | N/A / PASS | No scoring code touched. |
| Explicit-attribution | PASS | `generatePostJson`'s Asset→Post attribution wiring is untouched by this diff (only `cloneCopy`/`captionText` inside `output-bundle.ts` changed, both pre-`post_url` concerns); confirmed by reading the full `output-bundle.ts` diff. |
| Ledger-as-source-of-truth / never-fabricate | PASS | `unresolvedMentions` is additive-optional on `CopyVariant` only, deep-cloned like every other field; no other ledger field touched. Mentions are strictly grounded in `CopyInput.companies`/`CopySlideBeat.companies` — verified `companiesFromCopyInput` never reads `title`/`angle`/`mediaContext`, and `buildLinkedInMentionResolutions` never fabricates a resolution for a name not in its input list (`handles.get(name) ?? null`, confirmed by the "treats a company missing from the handle map the same as an explicit null" test). |
| Magnific fake / no live Space calls | PASS | `grep -n "spaces_\|creations_"` across every file in `git status --porcelain`'s changed/untracked list found matches only in `.claude/agents/producer.md`, `.claude/skills/write-social-copy/SKILL.md`, and `write-social-copy-skill.docs-test.ts` — and `git diff` on those three files contains **zero** `spaces_*`/`creations_*` occurrences (all matches are pre-existing prose elsewhere in those files, untouched by this diff). `src/linkedin-handle/store.ts` (the #126 lookup this slice calls) is a plain-file YAML reader with no network/MCP code. No credits spent, no board mutation, hermetic by construction. |

### Additional verification performed (beyond the standard checklist)

- **`composeCopy` byte-for-byte unchanged**: confirmed directly via `git diff src/copy/compose.ts | grep -E "^[+-]"` — every added/removed line falls inside `composeCopyForChannels`, its own JSDoc, `ComposeCopyOptions`, or the new import lines; zero lines touched inside `composeCopy` itself.
- **`validateCopy`/`validateCopyForPlatform` byte-for-byte unchanged**: `git diff src/copy/validate.ts` — empty (file untouched).
- **`src/copy/draft.ts`, `src/copy/inject.ts`, `src/copy/platform-shape.ts`, `src/linkedin-handle/*` untouched**: `git diff` on each — empty, confirming the developer's claim that only a new caller was added, no change to #126's own lookup module.
- **Multi-word company name / `@Name` syntax-checker interaction** (flagged in the Build Report's Known
  Limits): read `scanAtHandleMentionSyntax` (`src/copy/validate.ts`) directly — it matches `@(\S*)`, so a
  hypothetical multi-word resolved name (`"@Multi Word Company"`) would only have its first token
  (`@Multi`) inspected by the syntax checker; this is a pre-existing characteristic of #128's checker
  (unmodified here), not a defect introduced by this slice, and does not affect any currently-committed
  handle-table entry (all real entries are single-word). Documented accurately as a known limit, not
  hidden.
- **Epic #120 chain composition**: `npm test` (1639/1639) and `openspec validate --all --strict` (32/32)
  run against the fully merged history through `f7f0ebc`–`281d7be` (#132–#137) plus this slice's own
  changes — the whole chain's suite is green with this slice on top, no regression surfaced anywhere in
  the 431 test suites. This is the last issue in the #120 chain; no follow-on issue depends on it.

### Defect list

None. No defects found in this round.
