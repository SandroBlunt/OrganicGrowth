# Slice Handoff — issue-35-reask-language-platform

---

## Build Report (developer)

### What changed

The new-Brand interview in `runNewBrandInterview` previously fabricated brand facts when the
Operator gave no usable answer for Language or Platform:

- **Language**: `const language = (languageResponse ?? "en").trim() || "en"` — an empty answer
  silently produced `language: "en"` in the Brand Profile.
- **Platform**: unrecognised values (e.g. `"fb"`, `"tiktok"`) and empty answers all fell through
  to `"facebook"` via a catchall else-branch.

Both fields are now collected via bounded re-ask loops (cap 3, matching the Brand-name loop):

- **Language loop**: loops until the Operator supplies a non-empty trimmed code. On cap exceeded,
  yields `done: true` and returns `undefined` before any `scaffoldBrand` call.
- **Platform loop**: loops until the trimmed lowercased answer is one of `"facebook"`,
  `"instagram"`, or `"linkedin"`. Re-ask message on attempts 2+ names all three accepted values
  and notes Facebook is the only fully wired platform. On cap exceeded, same clean stop.

Region is unchanged (captured verbatim; empty is legitimate).

### Files touched

- **Modified**: `/Users/CaxtonTaylor/Subtext/src/commands/run-pipeline.ts`
  - Replaced Language single-yield+default (lines ~256–260) with a 3-attempt re-ask loop.
  - Replaced Platform single-yield+fallthrough (lines ~269–278) with a 3-attempt re-ask loop.
- **Modified**: `/Users/CaxtonTaylor/Subtext/src/commands/run-pipeline-onboarding.test.ts`
  - Added AC6 suite: 4 tests covering Language re-ask, Language cap-exceeded, brand-profile
    language value, valid-language acceptance.
  - Added AC7 suite: 5 tests covering Platform re-ask, unrecognised-platform re-ask with naming,
    no-silent-map, case-insensitive acceptance, Platform cap-exceeded.
- **Added**: `/Users/CaxtonTaylor/Subtext/openspec/changes/issue-35-reask-language-platform/proposal.md`
- **Added**: `/Users/CaxtonTaylor/Subtext/openspec/changes/issue-35-reask-language-platform/tasks.md`
- **Added**: `/Users/CaxtonTaylor/Subtext/openspec/changes/issue-35-reask-language-platform/specs/run-pipeline-conductor/spec.md`
- **Added**: `/Users/CaxtonTaylor/Subtext/openspec/changes/issue-35-reask-language-platform/handoff.md` (this file)

### How to run

```
# Type-check + full test suite (the definitive gate)
npm test

# Onboarding tests only (faster iteration)
node --import tsx --test src/commands/run-pipeline-onboarding.test.ts

# OpenSpec validation
openspec validate issue-35-reask-language-platform --strict
```

### Acceptance-criteria self-assessment

| # | Acceptance Criterion | Test(s) |
|---|---|---|
| AC1 | Empty Language re-asked, not silently defaulted to `en` | `AC6 > re-asks when Language is empty rather than silently defaulting to 'en'` |
| AC2 | Empty Platform re-asked, not silently defaulted to `facebook` | `AC7 > re-asks when Platform is empty rather than silently defaulting to 'facebook'` |
| AC3 | Unrecognised Platform re-asked with message naming accepted values | `AC7 > re-asks with a message naming accepted values when Platform is unrecognised` |
| AC4 | Valid Platform (`facebook`/`instagram`/`linkedin`, case-insensitive) accepted on first valid entry | `AC7 > accepts a valid platform case-insensitively on the first valid entry` |
| AC5 | Each loop bounded by cap; exceeding stops cleanly with no Brand directory created | `AC6 > stops cleanly after language cap is exceeded with no Brand directory created`; `AC7 > stops cleanly after platform cap is exceeded with no Brand directory created`; `AC7 > does NOT silently map an unrecognised platform to 'facebook'` |
| AC6 | Never-invent-brand-facts: brand-profile reflects only Operator-supplied Language/Platform | `AC6 > brand-profile language is Operator-supplied, not the fabricated 'en' default`; `AC6 > accepts a valid language code on the first non-empty entry` |
| AC7 | Tests cover all required scenarios, driven through conductor with Magnific fake | All AC6+AC7 tests inject `makeMagniticFake()` and `makeApifyFake()` — no live Space |

### Fakes / fixtures used

- **MAGNIFIC FAKE** (`makeMagniticFake()`): injected via `options.magnific` in every test. Returns
  `{ accessible: true, creditsOk: true }`. No live `spaces_*` or `creations_*` calls were made.
  No credits were spent. No board was mutated. This is explicitly the fake, not the live Space.
- **APIFY FAKE** (`makeApifyFake()`): injected via `options.apify`. Returns `tokenValid: true`.
- **Temp directories**: each test creates a fresh `tmpdir()` subtree via `withEmptyBrandsRoot`,
  wiped on exit. No production Brand directories were touched.

### Self-review notes

- The Language and Platform loops are symmetric with the Brand-name loop (cap=3, `> cap`
  check, `done: true` + `return undefined` before scaffold) — no structural divergence.
- Named constants `MAX_LANGUAGE_ATTEMPTS` and `MAX_PLATFORM_ATTEMPTS` (both 3) make the cap
  explicit and consistent with how the rest of the function handles attempts.
- TypeScript narrows `platform: BrandInterviewAnswers["platform"] | ""` to
  `"facebook" | "instagram" | "linkedin"` by control flow after the loop — confirmed by
  `tsc --noEmit` passing with zero errors.
- No dead code added. No existing tests broken (22 pre-existing onboarding tests + 502 others
  all pass; total: 524 pass, 0 fail).
- Region is deliberately untouched — the issue explicitly states it is already captured verbatim
  and may legitimately be empty.

### Known limits

- The Language loop accepts any non-empty string (it does not validate that the input is a real
  BCP 47 code). This is consistent with the existing pattern — the issue does not require
  language-code validation, only non-empty.
- The 3-attempt cap matches the name loop. The seed-page loop uses 5; this difference is
  pre-existing and intentional (seed pages have a higher retry budget because they are harder to
  get right on the first try). No change here.

---

<!-- QA appends its Verdict below this line -->

---

## QA Verdict — Round 1: PASS

### Suite result

Command run: `npm test` (tsc --noEmit type-check + node --import tsx --test "src/**/*.test.ts")

Result: **524 pass, 0 fail, 0 skip** — duration 891ms. Suite is green.

`openspec validate issue-35-reask-language-platform --strict` — **valid** (no errors).

### Per-criterion results

| # | Acceptance Criterion | Result | Covering test(s) |
|---|---|---|---|
| AC1 | Empty Language re-asked, not silently defaulted to `en` | PASS | `AC6: re-asks when Language is empty rather than silently defaulting to 'en'` — asserts `languageCallCount >= 2` after first empty answer; code confirms loop at lines 261–280 with no `?? "en"` or `|| "en"` fallback remaining |
| AC2 | Empty Platform re-asked, not silently defaulted to `facebook` | PASS | `AC7: re-asks when Platform is empty rather than silently defaulting to 'facebook'` — asserts `platformCallCount >= 2` after first empty answer; code confirms loop at lines 297–317 with no silent `= "facebook"` assignment |
| AC3 | Unrecognised Platform re-asked with message naming accepted values; NOT silently mapped to `facebook` | PASS | `AC7: re-asks with a message naming accepted values when Platform is unrecognised` — feeds `"fb"` on first call then `"facebook"`; asserts `platformCallCount >= 2` and checks output matches `/facebook.*instagram.*linkedin/i`; re-ask message (line 309) is `"Please enter one of: facebook, instagram, or linkedin. (Facebook is the only fully wired platform today.)"` |
| AC4 | Valid Platform (case-insensitive) accepted on first valid entry | PASS | `AC7: accepts a valid platform case-insensitively on the first valid entry` — feeds `"Facebook"` (uppercase F); asserts Brand directory created and `channel.platform === "facebook"`; `rawPlatform.toLowerCase()` at line 312 confirms normalisation |
| AC5 | Each loop bounded by cap; exceeding stops cleanly with no Brand directory | PASS | Language cap test: feeds always-empty language; asserts `done === true` and Brand dir absent. Platform cap tests: feeds always-unrecognised `"tiktok"` / `"myspace"`; asserts `done === true` and Brand dir absent. `return undefined` at lines 268 and 303 guarantee `scaffoldBrand` is never reached on cap-exceeded. Both tests verified with `fsStat` against `join(paths.brandsRoot, "newbrand")`. |
| AC6 | Never-invent-brand-facts: brand-profile/seeds reflect only Operator-supplied Language/Platform | PASS | `AC6: brand-profile language is Operator-supplied, not the fabricated 'en' default` feeds `"es"`, reads `brand-profile.yaml`, asserts `language === "es"`. `AC6: accepts a valid language code on the first non-empty entry` feeds `"pt"`, asserts `language === "pt"`. Grep confirms no `?? "en"`, `|| "en"` or `?? "facebook"` / `= "facebook"` fallthrough in the interview section. |
| AC7 | Tests cover all required scenarios driven through conductor with Magnific fake | PASS | All 9 new tests (AC6 x4, AC7 x5) call `healthyOptions(paths)` which always injects `makeMagniticFake()` and `makeApifyFake()`. No live `spaces_*` or `creations_*` calls exist in either changed file. Every test uses `withEmptyBrandsRoot` temp dirs. |

### Per-scenario results

Spec delta file: `openspec/changes/issue-35-reask-language-platform/specs/run-pipeline-conductor/spec.md`

| Scenario | Result | Covering test |
|---|---|---|
| Pre-scout interview asks exactly the required fields | PASS | AC3 suite (4 tests) confirms niche/voice/language/platform/seed asked; channel URL/banned words/CTA/hashtags NOT asked — pre-existing coverage, unbroken |
| Scaffolded brand-profile contains exactly the Operator's answers | PASS | AC4 suite (3 tests) and new AC6 tests confirm exact value round-trip |
| Empty Language triggers a re-ask rather than a silent default | PASS | `AC6: re-asks when Language is empty` — `languageCallCount >= 2` proven |
| Language cap exceeded stops the conductor with no Brand directory created | PASS | `AC6: stops cleanly after language cap is exceeded with no Brand directory created` — `done === true` and `fsStat` miss confirmed |
| Empty Platform triggers a re-ask rather than a silent default | PASS | `AC7: re-asks when Platform is empty rather than silently defaulting to 'facebook'` — `platformCallCount >= 2` proven |
| Unrecognised Platform triggers a re-ask naming the accepted values | PASS | `AC7: re-asks with a message naming accepted values when Platform is unrecognised` — output regex `/facebook.*instagram.*linkedin/i` matches |
| Valid Platform answer (case-insensitive) is accepted on the first valid entry | PASS | `AC7: accepts a valid platform case-insensitively on the first valid entry` — `"Facebook"` accepted; directory created; `platform === "facebook"` |
| Platform cap exceeded stops the conductor with no Brand directory created | PASS | `AC7: stops cleanly after platform cap is exceeded with no Brand directory created` and `AC7: does NOT silently map an unrecognised platform to 'facebook'` — both assert `done === true` and Brand dir absent |
| Scaffolded brand-profile reflects only Operator answers (never-invent-brand-facts requirement) | PASS | AC4 suite + AC6 language-value tests confirm exact round-trip with no fabricated defaults |
| Brand Profile language reflects the Operator's supplied language, not a fabricated default | PASS | `AC6: brand-profile language is Operator-supplied` feeds `"es"`, reads YAML, asserts `language === "es"` (not `"en"`) |

### Always-rules checks

| Rule | Result | Evidence |
|---|---|---|
| generate-never-publish | PASS | No publish call exists in `run-pipeline.ts`; Gate 3 yields a pause turn for the Operator; this slice does not touch the publish path |
| public-metrics-only | PASS | This slice touches only the onboarding interview; no metrics path was introduced or modified |
| relative-not-absolute | PASS | No scoring or baseline comparison introduced by this slice |
| explicit-attribution | PASS | No Post-to-Idea attribution logic touched; `log-post` path is unchanged |
| ledger-as-source-of-truth | PASS | The slice modifies only the interview (pre-scaffold); `scaffoldBrand` (unchanged) writes the ledger on Brand creation; no status transitions bypassed |
| never-invent-brand-facts | PASS — this is the entire purpose of the slice | Grep confirms no `?? "en"`, `|| "en"`, `?? "facebook"`, or `= "facebook"` silent assignment in the Language/Platform sections; both fields are assigned exclusively from validated Operator responses at lines 278 (`language = trimmed`) and 313–314 (`platform = rawPlatform`) |

### Magnific fake check

PASS. Evidence:

- `grep -rn 'spaces_\|creations_'` on `src/commands/run-pipeline.ts` and `src/commands/run-pipeline-onboarding.test.ts` returns no matches.
- All 9 new tests and all 22 pre-existing onboarding tests call `healthyOptions(paths)` which injects `makeMagniticFake()` via `options.magnific`. The fake implements `MagniticReadinessPort.probeSpace()` returning `{ accessible: true, creditsOk: true }` — no live Magnific MCP tool is called, no credits are spent, no board is mutated.
- `DEFAULT_MAGNIFIC_PORT` in `run-pipeline.ts` (the runtime fallback) is never reached in tests; it is the only place in the file where the live port would be used and it is explicitly guarded as "NEVER exercised in tests".

### Defect list

None. No defects found.
