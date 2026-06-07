## 1. Spec delta (before any code)

- [ ] 1.1 Write the spec delta for `brand-resolver` under
  `openspec/changes/issue-25-new-brand-interview-scaffolder/specs/brand-resolver/spec.md`
  — ADDED requirements for slug validation, pure builders (answers→profile, answers→seeds,
  empty-ledger shape), round-trip guarantee, and the `scaffoldBrand` write shell.
- [ ] 1.2 Write the spec delta for `run-pipeline-conductor` under
  `openspec/changes/issue-25-new-brand-interview-scaffolder/specs/run-pipeline-conductor/spec.md`
  — ADDED requirements for unknown-slug onboarding, no-argument new-vs-existing prompt, staged
  interview (pre-scout fields only), and never-invent-brand-facts guardrail.
- [ ] 1.3 Run `openspec validate issue-25-new-brand-interview-scaffolder --strict` and confirm
  the spec is well-formed.

## 2. Failing tests — pure builders (test-first)

- [ ] 2.1 Create `src/brand/scaffolder.test.ts` with failing tests covering:
  - `validateSlug`: valid names pass; all-non-alphanumeric is rejected with a clear message;
    long names are truncated to 64 chars and still valid.
  - `buildBrandProfile`: every answer field maps to the correct output key; deferred fields
    are absent unless supplied; result serialises to YAML and parses back with the same values
    (round-trip).
  - `buildSeeds`: seed pages appear correctly; platform selects the right Apify actor block;
    result serialises to YAML and parses back (round-trip).
  - `buildEmptyLedger`: shape has an empty `ideas` array and a `baseline` with all-null metric
    fields and a null `updated_at`.
- [ ] 2.2 Run `node --import tsx --test src/brand/scaffolder.test.ts` — expect failures (no
  implementation yet).

## 3. Pure builder module `src/brand/scaffolder.ts`

- [ ] 3.1 Create `src/brand/scaffolder.ts` with:
  - `BrandInterviewAnswers` interface (name, niche, voice, language, region, platform,
    seedPages; deferred: channelUrl, bannedWords, requiredCta, requiredHashtags).
  - `BrandProfileContent` type (the YAML-serialisable shape).
  - `SeedsContent` type.
  - `EmptyLedger` type.
  - `deriveSlug(name)` — delegates to `slugify`.
  - `validateSlug(slug)` — rejects empty slug with a message.
  - `buildBrandProfile(answers)` — pure mapping; never invents values.
  - `buildSeeds(answers)` — pure mapping; includes platform-specific Apify actor block.
  - `buildEmptyLedger()` — returns the canonical empty ledger shape.
- [ ] 3.2 Run `node --import tsx --test src/brand/scaffolder.test.ts` — expect all passing.

## 4. Failing tests — thin write shell (test-first)

- [ ] 4.1 Create `src/brand/scaffold-brand.test.ts` with failing tests covering:
  - Scaffolding creates `data/brands/<slug>/` with brand-profile.yaml, seeds.yaml,
    ledger.json, ideas/ dir, your-data/ dir.
  - After scaffolding, `listBrands(brandsRoot)` includes the new slug.
  - brand-profile.yaml and seeds.yaml contain the values from the builders.
  - Calling `scaffoldBrand` on an existing slug throws with a clear message.
- [ ] 4.2 Run `node --import tsx --test src/brand/scaffold-brand.test.ts` — expect failures.

## 5. Thin write shell `src/brand/scaffold-brand.ts`

- [ ] 5.1 Create `src/brand/scaffold-brand.ts` with `scaffoldBrand(slug, content, options)`.
  Reads `templates/brand-skeleton/`, copies structure, writes built files, does not overwrite.
- [ ] 5.2 Run `node --import tsx --test src/brand/scaffold-brand.test.ts` — expect all passing.

## 6. Failing tests — conductor extensions (test-first)

- [ ] 6.1 Add to `src/commands/run-pipeline.test.ts` (or a new companion file) failing tests for:
  - Unknown slug: conductor offers to create Brand; Operator accepts → interview runs → scaffold →
    pipeline continues; Operator declines → done with a clear message.
  - No argument: conductor asks new-vs-existing, lists existing Brands; Operator picks existing
    → pipeline continues; Operator picks new → interview runs → scaffold → pipeline continues.
  - Staged interview: only pre-scout fields are asked (niche, voice, language/region, platform,
    seed pages); deferred fields are NOT asked before scouting.
  - Never-invent: the scaffolded brand-profile contains exactly what the Operator supplied.
  - Slug validation in conductor: an all-non-alphanumeric name is rejected with a clear message
    without creating any directory.
- [ ] 6.2 Run `node --import tsx --test src/commands/run-pipeline.test.ts` — expect failures.

## 7. Conductor extensions `src/commands/run-pipeline.ts`

- [ ] 7.1 Add `getExistingBrands` and `templatePath` to `RunPipelineOptions`.
- [ ] 7.2 Extend `conductorTurns` to accept `brand: string | undefined`.
  - `undefined` → new-vs-existing prompt with `listBrands` output.
  - Unknown slug → offer-to-create prompt.
  - Both paths route into a shared staged interview.
- [ ] 7.3 After a successful interview, call `buildBrandProfile`, `buildSeeds`, `buildEmptyLedger`,
  then `scaffoldBrand`; set the resolved slug as the Brand and continue the normal loop.
- [ ] 7.4 Run `node --import tsx --test src/commands/run-pipeline.test.ts` — expect all passing.

## 8. Self-review

- [ ] 8.1 `openspec validate issue-25-new-brand-interview-scaffolder --strict` green.
- [ ] 8.2 `npm test` green (all prior tests + new tests).
- [ ] 8.3 `npm run build` clean (no TypeScript errors).
- [ ] 8.4 Simplify / dead-code pass: each AC maps to named test(s); no dead branches; module
  boundaries are clean; pure builders have no I/O; the write shell has no business logic.
- [ ] 8.5 Write the Build Report into `handoff.md`.
