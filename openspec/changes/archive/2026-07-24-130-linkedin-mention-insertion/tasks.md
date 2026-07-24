## 1. Ground the decision + map today's shape

- [x] 1.1 Read issue #130 in full, parent epic #120, ADR-0019, and confirm blockers #125/#126/#129 are
  CLOSED/COMPLETED (`gh issue view 125 126 129 --json state,stateReason`).
- [x] 1.2 Read `src/copy/compose.ts`'s `composeCopyForChannels` (#129), `src/copy/validate.ts`'s
  `validateCopyForPlatform`/`scanAtHandleMentionSyntax` (#128), `src/copy/platform-shape.ts`'s
  `platformCopyShapeFor`/`supportsMentions` (#128), and `src/linkedin-handle/store.ts`'s
  `resolveLinkedInHandle` + `lookup.ts`'s `resolveHandle` (#126).
- [x] 1.3 Read `CopyInput.companies` (`src/copy/draft.ts`, #125) and `CopySlideBeat.companies`
  (`src/copy/draft.ts`, PR #122), and their two wiring functions
  (`character-explainer-companies.ts`/`news-carousel-slide-narrative.ts`) — the ONLY structured sources
  of company/product names this slice is allowed to mention.
- [x] 1.4 Read `src/asset/output-bundle.ts`'s `cloneCopy`/`captionText`/`generatePostJson` — where an
  unresolved-mention flag needs to surface for Operator review.
- [x] 1.5 Read `.claude/skills/write-social-copy/SKILL.md` and `.claude/agents/producer.md`'s Copy-phase
  section, and `src/copy/write-social-copy-skill.docs-test.ts`'s "defers ... to issue #130" pinned test
  — all need updating now that #130 is built.
- [x] 1.6 Run `npm test` to capture the exact baseline pass count and `npm run test:docs` before any
  change.

## 2. `src/copy/linkedin-mentions.ts` — the pure mention-resolution module (test-first)

- [x] 2.1 Add `src/copy/linkedin-mentions.test.ts` FIRST (failing): `companiesFromCopyInput` merges
  `input.companies` + every `slideNarrative[].companies` beat, deduped case-insensitively, in order,
  ignoring free-prose fields entirely; `buildLinkedInMentionResolutions` builds `@Name`/`resolved: true`
  for a resolved handle and plain-name/`resolved: false` for an unresolved one, from a given
  name→handle map; `injectLinkedInMentions` appends missing mentions as one trailing sentence, dedupes
  an already-present mention (case-insensitive), and returns the caption UNCHANGED for zero
  resolutions; `unresolvedMentionNames` extracts exactly the unresolved names; `weaveLinkedInMentions`
  (async, against a temp `linkedin-handles.yaml`) resolves + weaves + reports unresolved names, and
  short-circuits BEFORE any file read when there are zero companies.
- [x] 2.2 Implement `companiesFromCopyInput`, `LinkedInMentionResolution`,
  `buildLinkedInMentionResolutions`, `injectLinkedInMentions`, `unresolvedMentionNames`,
  `weaveLinkedInMentions` in `src/copy/linkedin-mentions.ts`. Run 2.1: green.

## 3. `src/copy/contract.ts` — CopyVariant.unresolvedMentions (additive)

- [x] 3.1 Add `CopyVariant.unresolvedMentions?: readonly string[]`, optional, additive, documented as
  present only when non-empty and only ever populated for a mentions-supporting platform.

## 4. `src/copy/compose.ts` — wire mention weaving into composeCopyForChannels (test-first)

- [x] 4.1 Add tests to `src/copy/compose.test.ts` FIRST (failing), against a fixture
  `linkedin-handles.copy-tests.yaml`: every Spec company resolves → the LinkedIn variant's caption
  names each one as `@Name`, `unresolvedMentions` absent; some resolve/some don't → resolved ones as
  `@Name`, unresolved ones as plain text, `unresolvedMentions` lists exactly the unresolved names; zero
  companies → the LinkedIn variant is byte-for-byte identical to #129's baseline (no `Mentions:` text,
  no `unresolvedMentions` field); every OTHER targeted platform's variant is completely unaffected by
  the identical `CopyInput.companies`/fixture data (proves the insertion is LinkedIn-only); a company
  absent from the Spec's own companies data is never mentioned even when the fixture lookup resolves
  it (grounded, never invented).
- [x] 4.2 Add `linkedInHandlesPath?: string` to `ComposeCopyOptions`. Inside
  `composeCopyForChannels`'s per-Channel loop, after `injectRequiredParts`, call `weaveLinkedInMentions`
  when `platformCopyShapeFor(channel.platform)?.supportsMentions` is `true`, and carry the resulting
  `unresolvedMentions` onto that platform's `CopyVariant` (only when non-empty). `composeCopy` itself
  stays byte-for-byte unchanged. Run 4.1: green.

## 5. `src/asset/output-bundle.ts` — surface unresolved mentions for Operator review (test-first)

- [x] 5.1 Add tests to `src/asset/output-bundle.test.ts` FIRST (failing): `cloneCopy`/`generatePostJson`
  carry a variant's `unresolvedMentions` through onto `post.json`, deep-cloned (never a shared
  reference); `captionText` appends a note naming the unresolved companies under the flagged variant's
  own block; a variant with no `unresolvedMentions` (or an empty one) renders BYTE-IDENTICAL output to
  before this change.
- [x] 5.2 Implement: extend `cloneCopy` to clone `unresolvedMentions`; add a small
  `unresolvedMentionsNote` helper `captionText` calls per variant. Run 5.1: green.

## 6. Skill + agent doc updates (test-first via docs-test)

- [x] 6.1 Update the "defers LinkedIn @mention resolution to issue #130" describe block in
  `src/copy/write-social-copy-skill.docs-test.ts` FIRST (failing against the OLD prose): now pins that
  the Skill names `weaveLinkedInMentions`/`resolveLinkedInHandle`/`linkedin-handle` and states an
  unresolved name falls back to plain text, flagged for Operator review.
  `.claude/skills/write-social-copy/SKILL.md`.
- [x] 6.2 Update `.claude/skills/write-social-copy/SKILL.md`: Step 2 gains the mention-weaving
  sub-step; "what this Skill does not do" section's old "defers to #130" bullet is rewritten to
  describe the now-deterministic resolution step. Run 6.1: green.
- [x] 6.3 Update `.claude/agents/producer.md`'s Copy-phase section's "resolving a real handle is issue
  #130" line to name the now-built step. No docs-test pins this exact line (confirmed by grep); no new
  pinned assertion needed.
- [x] 6.4 Re-run the FULL `npm run test:docs` suite to confirm every pre-existing pinned assertion in
  both files still passes.

## 7. OpenSpec

- [x] 7.1 `grep -n "^### Requirement" openspec/specs/*/spec.md` to confirm which of this slice's
  Requirement titles already exist verbatim (MODIFIED) vs. are genuinely new (ADDED).
- [x] 7.2 Author `proposal.md`, this `tasks.md`, and spec deltas for `copy-composition` (ADDED: the new
  mention-resolution module + CopyVariant field; MODIFIED: `composeCopyForChannels`'s own Requirement,
  the `write-social-copy` documentation Requirement) and `asset-output-bundle` (MODIFIED: the
  variant-carrying Requirement).
- [x] 7.3 `npx openspec validate 130-linkedin-mention-insertion --strict` green.

## 8. Self-review

- [x] 8.1 `npm test` green (type-check + full suite; confirm the count grows from the baseline with
  zero regressions).
- [x] 8.2 `npm run test:docs` green (confirm the count grows from the baseline with zero regressions).
- [x] 8.3 Simplify pass: confirm every issue #130 acceptance criterion maps to a named, passing test;
  confirm `composeCopy`'s signature/body and `validateCopy`/`validateCopyForPlatform` are byte-for-byte
  unchanged; confirm no `spaces_*`/`creations_*` call anywhere in the diff; remove any dead code/unused
  import.
- [x] 8.4 Write the Build Report into `handoff.md`: what changed, files touched, how to run, per-AC
  self-assessment mapping each AC to its proving test, fakes/fixtures used (explicitly: no Magnific
  fake needed — this slice has no Space/MCP code), self-review notes, known limits.
