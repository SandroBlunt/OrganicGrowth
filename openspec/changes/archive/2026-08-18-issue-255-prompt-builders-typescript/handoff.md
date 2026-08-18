# Slice Handoff — issue-255-prompt-builders-typescript

Bidirectional channel for `developer` ⇄ `qa`. Developer writes the Build Report below; `qa` appends its
Verdict beneath it. Retries append `Round-N Build` blocks — nothing here is ever overwritten.

## Build Report

### What changed

Ported all 11 model-prompting Skills' `scripts/build-prompt.py` (prompt assembler + validator) and
`scripts/test_build_prompt.py` (its test suite) to TypeScript, so all 244 tests run inside this
repository's own `npm test` for the first time. Corrected issue #212's parent-ticket premise per issue
#255's own text: the Python was never untested (4,077 lines of script behind 2,501 lines of passing
tests) — the defect was that nothing in CI ever ran those tests. The port removes that gap and the
`python3` runtime dependency at the same time, exactly as `docs/catalogue-manifest-format.md` (issue
#212) already predicted this change would do.

Skills ported (all 11, none deferred — the full set fit in one coherent slice): `chatgpt-image-2`,
`grok-imagine`, `grok-imagine-1-5`, `happy-horse`, `kling-3-0`, `kling-3-0-omni`, `nano-banana-2`,
`seedance-2-0`, `seedream-4-5`, `seedream-5-0-pro`, `veo-3-1`.

Toolchain changes to make `.claude/skills/**/*.test.ts` a first-class part of `npm test`:
- `package.json`'s `test` script glob gained `".claude/skills/**/*.test.ts"`.
- `tsconfig.json`'s `include` gained `.claude/skills/**/*.ts`; its `rootDir: "src"` was removed (a
  single `rootDir` cannot legally span two disjoint trees — proven with a scratch `tsc` experiment
  before touching the real config; TS6059 fires even under `--noEmit`).
- `tsconfig.build.json` gained an explicit `rootDir: "src"` override plus `.claude/skills/**` in its
  `exclude`, so `npm run build`'s `dist/` output is completely unaffected — the ported scripts run only
  via `npx tsx`, exactly like every other Skill script in the catalogue, needing no build step.

Each of the 11 `SKILL.md`'s "Closing — validation" section and each `metadata.yaml`'s `scripts:` /
`evals:` entries now name the TypeScript entry points; each `metadata.yaml`'s `tools:` array is now `[]`
(no runtime-interpreter dependency declared). All 22 `.py` files were deleted, only after every port's
tests passed, the identical-output comparisons were done, and the non-vacuousness proof was done.

### Files touched

**Added (22 new files):**
```
.claude/skills/{chatgpt-image-2,grok-imagine,grok-imagine-1-5,happy-horse,kling-3-0,kling-3-0-omni,
nano-banana-2,seedance-2-0,seedream-4-5,seedream-5-0-pro,veo-3-1}/scripts/build-prompt.ts
.claude/skills/{...same 11...}/scripts/build-prompt.test.ts
```

**Modified:**
```
package.json                    (test script glob)
tsconfig.json                   (include, rootDir removed)
tsconfig.build.json             (rootDir override, exclude)
.claude/skills/<all 11>/SKILL.md        (Closing — validation section only)
.claude/skills/<all 11>/metadata.yaml   (scripts:, evals:, tools: fields only)
```

**Deleted (22 files):**
```
.claude/skills/<all 11>/scripts/build-prompt.py
.claude/skills/<all 11>/scripts/test_build_prompt.py
```

**OpenSpec:**
```
openspec/changes/issue-255-prompt-builders-typescript/proposal.md
openspec/changes/issue-255-prompt-builders-typescript/tasks.md
openspec/changes/issue-255-prompt-builders-typescript/specs/prompt-builder-scripts/spec.md
openspec/changes/issue-255-prompt-builders-typescript/handoff.md   (this file)
```

**Untouched, deliberately:** every file under `.claude/references/` (issue #252); `docs/catalogue-
manifest-format.md` (its own text already predicted this change's `tools: []` outcome); `src/claude-
skills/manifest-completeness-scan.ts`, `reference-citation-scan.ts`,
`reference-citation-guard.docs-test.ts` (the existing guards already accept this change's shape with no
code change); every other file under `src/`; the 5 workflow Skills without a `metadata.yaml`.

### How to run

```bash
# Full suite (type-check + all tests, including the 244 ported ones)
npm test

# Docs-tests only
npm run test:docs

# Build (proves .claude/skills is excluded from dist/)
npm run build

# One skill's ported tests directly
node --import tsx --test .claude/skills/chatgpt-image-2/scripts/build-prompt.test.ts

# One skill's ported script directly (matches the old `python3 scripts/build-prompt.py ...` shape)
cd .claude/skills/chatgpt-image-2 && npx tsx scripts/build-prompt.ts --mode T2I --subject "..." \
    --action "..." --setting "..." --style "..." --camera "..."

# OpenSpec
npx openspec validate issue-255-prompt-builders-typescript --strict
npx openspec validate --all --strict
```

### Per-skill test-count table (ported count vs issue's Python count)

| Skill | Python tests (issue #255) | Ported tests | Match |
|---|---:|---:|:---:|
| chatgpt-image-2 | 10 | 10 | ✓ |
| grok-imagine | 21 | 21 | ✓ |
| grok-imagine-1-5 | 35 | 35 | ✓ |
| happy-horse | 26 | 26 | ✓ |
| kling-3-0 | 26 | 26 | ✓ |
| kling-3-0-omni | 13 | 13 | ✓ |
| nano-banana-2 | 26 | 26 | ✓ |
| seedance-2-0 | 12 | 12 | ✓ |
| seedream-4-5 | 22 | 22 | ✓ |
| seedream-5-0-pro | 33 | 33 | ✓ |
| veo-3-1 | 20 | 20 | ✓ |
| **Total** | **244** | **244** | **✓** |

No count changed, split, or dropped — every ported test is a 1:1 translation of its Python original (one
Node `describe` per Python `unittest.TestCase` class, one `it` per `test_*` method; a Python `subTest`
loop inside one test method stays one `it` with an internal loop, matching `unittest`'s own "tests run"
counter, which does not inflate on `subTest` — confirmed by directly running the original
`python3 scripts/test_build_prompt.py` for `grok-imagine-1-5` before porting: `Ran 35 tests in 0.005s /
OK`, matching the issue's table and my ported count exactly).

Full-suite confirmation: baseline on `main` at `cdb68a0` was **3662 tests / 953 suites / 0 fail**.
After this change: **3906 tests / 1045 suites / 0 fail** — a delta of exactly **+244 tests, 0 fail**,
confirming the total lands precisely on the required count with nothing silently dropped or duplicated.

### Acceptance-criteria self-assessment

| Acceptance criterion (issue #255) | Proof |
|---|---|
| Port all 11 `build-prompt.py` to `build-prompt.ts`, runnable with `npx tsx` | 11 files at `.claude/skills/<entry>/scripts/build-prompt.ts`; each runs via `npx tsx scripts/build-prompt.ts ...` — demonstrated live for `chatgpt-image-2`, `kling-3-0`, `seedream-5-0-pro`, `veo-3-1` (transcripts below) |
| Port all 11 `test_build_prompt.py` to Node's test runner, running inside `npm test` | 11 files at `.claude/skills/<entry>/scripts/build-prompt.test.ts`; `package.json`'s `test` glob extended; `npm test` output shows +244/0 fail (above) |
| Update each `SKILL.md` and `metadata.yaml` to name the TS entry point | `grep -rln "python3\|build-prompt\.py\|test_build_prompt\.py" .claude/` → **zero matches** (verified after every doc edit) |
| Delete the 22 `.py` files once green, not before | Deleted only in step 4.5 of `tasks.md`, after §3 (all 11 ports green) and §4.1–4.4 (full suite, guard, identical-output, non-vacuousness) — see commit-order reasoning in `tasks.md` |
| No `python3` reference survives anywhere in `.claude/` | `grep -rn "python3" .claude/` → **no output** (shown below) |
| Port tests before script, per-skill | Demonstrated live for `chatgpt-image-2`: test file written and run first, observed `ERR_MODULE_NOT_FOUND` (module doesn't exist yet), then the script was written and the same test file re-run to green — same order followed for the other 10 |
| Per-skill test count reported, matches Python, 244 total | Table above |
| Identical output for ≥3 skills of differing size | 4 transcripts below (10-test, 26-test, 33-test, 20-test skills) |
| Prove ported tests are not vacuous | Live break/fix demonstration below (`chatgpt-image-2`'s negation guard) |
| Cross-ticket manifest interaction (issue #212) honoured | `evals[].path` renamed alongside `scripts[].path` so they stay mutually consistent; `tools: []` satisfies the guard's "present array" check; guard re-run green with zero code change (shown below) |

### Fakes / fixtures used

**None required.** This slice is pure text-in/text-out CLI script logic and its unit tests — no Magnific
Space, no Apify call, no filesystem beyond reading/writing the ported `.ts` files themselves and running
Node's `child_process`-free in-process test runner. **No Magnific fake was needed and none was used** —
there is nothing in this slice that touches the Producer runtime, a Space, or any brand's `data/`
directory. Fully hermetic by construction; confirmed no `spaces_*`/`creations_*` symbol appears anywhere
in the diff.

### Self-review notes

- Removed a stray `__pycache__/` directory that `python3 scripts/test_build_prompt.py` created under
  `grok-imagine-1-5/scripts/` while re-deriving its test count for the ground-truthing step (§1.3) —
  caught by `git status` before committing; not part of the port.
- Fixed one incidental `python3` mention inside a doc-comment in the ported
  `grok-imagine-1-5/scripts/build-prompt.test.ts` (a provenance note explaining the `subTest`-count
  parity) so the literal string does not appear anywhere under `.claude/`, per the issue's own "grep and
  show it" instruction — reworded to describe the fact without naming the runtime.
- Confirmed no cross-skill code sharing was introduced: each of the 11 ported scripts is fully
  self-contained (its own `PromptValidationError`, its own negation/validation helpers, its own CLI
  parser), matching the "copy `.claude/skills/<entry>/` alone and it still works" packaging model issue
  #212 already established — a shared `src/`-side helper module would have broken that model.
- Kept every CLI flag name, JSON reference-object shape (`{"kind": ..., "role": ...}`,
  `{"type": ..., "role": ...}`, `{"duration_s": N, "text": ...}`, `{"start_s": N, "end_s": N, ...}`) on
  the wire identical to the Python original — only the *internal* TypeScript property names use
  camelCase (`durationS`, `startS`); a thin CLI-boundary conversion (`toShotSpecs` in `kling-3-0`,
  `toTimestampSegments` in `veo-3-1`) keeps external JSON snake_case and internal TS camelCase without
  leaking either convention into the other.
- Removed no validation rule, added none — the only behavioural difference disclosed below (argparse's
  own auto-generated multi-line usage/`choices` error banner for `--mode`/`--aspect-ratio` vs this port's
  own `PromptValidationError` text) is presentation-only, not a rule change, and is called out explicitly
  rather than glossed over.

### Known limits

- **CLI-level `argparse` `choices=` error text is not reproduced verbatim.** Python's `argparse` itself
  intercepts an invalid `--mode`/`--aspect-ratio`/etc. value (any flag declared with `choices=`) before
  `build_prompt()` is ever called, printing its own multi-line `usage: ...` banner. This port's CLI
  parser instead lets every flag through and relies on `buildPrompt()`'s own validation (the same
  function the 244 tests exercise) to reject it, printing `PromptValidationError: ...` — same exit code
  (2), same practical outcome (the value is rejected), different wording. This is deliberate: the 244
  tests test `build_prompt`'s own validation, not `argparse`'s presentation layer, so no test coverage is
  lost, and reproducing `argparse`'s banner verbatim would have meant re-implementing a separate,
  untested error-formatting layer. Demonstrated live in the identical-output transcripts below by
  choosing arguments that exercise `buildPrompt`'s own errors (negation guard, mode/reference-count
  violations) rather than a bare `choices=` mismatch.
- **`--help` output is not byte-identical to argparse's auto-generated help text**, for the same reason —
  it is hand-written prose describing the same flags, not a line-for-line reproduction of argparse's
  formatter. No test in the ported 244 covers `--help` output (the Python suite didn't test it either).
- Nothing else deferred — all 11 skills, all 244 tests, both doc references per skill, and the guard
  cross-check are complete in this one slice.

---

## Transcripts

### 1. Test-first order, demonstrated live (`chatgpt-image-2`)

```
$ node --import tsx --test .claude/skills/chatgpt-image-2/scripts/build-prompt.test.ts
...
ERR_MODULE_NOT_FOUND
url: '…/chatgpt-image-2/scripts/build-prompt.ts'
not ok 1 - .claude/skills/chatgpt-image-2/scripts/build-prompt.test.ts
# tests 1
# pass 0
# fail 1
```

(build-prompt.ts written)

```
$ node --import tsx --test .claude/skills/chatgpt-image-2/scripts/build-prompt.test.ts
# tests 10
# pass 10
# fail 0
```

### 2. Identical-output transcripts (Python vs TypeScript, same CLI arguments)

**chatgpt-image-2 (smallest — 179/189 lines, 10 tests), T2I:**
```
$ python3 scripts/build-prompt.py --mode T2I --subject "A barista pulling an espresso shot." \
    --action "The barista's hands rest on the portafilter." \
    --setting "A small Melbourne specialty cafe at 7:30 am." \
    --style "35 mm photograph, Kodak Portra 400 palette." \
    --camera "Medium close-up at 50 mm, key from window camera-left." --aspect-ratio 3:2 > /tmp/py_out_1.txt
$ npx tsx scripts/build-prompt.ts --mode T2I --subject "A barista pulling an espresso shot." \
    --action "The barista's hands rest on the portafilter." \
    --setting "A small Melbourne specialty cafe at 7:30 am." \
    --style "35 mm photograph, Kodak Portra 400 palette." \
    --camera "Medium close-up at 50 mm, key from window camera-left." --aspect-ratio 3:2 > /tmp/ts_out_1.txt
$ diff /tmp/py_out_1.txt /tmp/ts_out_1.txt && echo IDENTICAL
IDENTICAL
```
Output (both):
```
A barista pulling an espresso shot.
The barista's hands rest on the portafilter.
A small Melbourne specialty cafe at 7:30 am.
35 mm photograph, Kodak Portra 400 palette.
Medium close-up at 50 mm, key from window camera-left.

[aspect_ratio=3:2]
```
Also compared the negation-guard error path (same script) — both emit the identical
`PromptValidationError: prompt is dominated by negation tokens (no/not/without/avoid). Rephrase to
positive description; ChatGPT Image 2 does not honour negation reliably in prose.` on stderr, exit 2.

**kling-3-0 (medium — 395/264 lines, 26 tests), T2V custom Multi-Shot:**
```
$ python3 scripts/build-prompt.py --mode T2V --subject "A dancer." --action "Stands." \
    --setting "Empty stage." --style "Painterly cinematic." --camera "Wide medium, 50 mm." \
    --motion "Dancer raises both arms overhead." --multi-shot-mode custom \
    --shot '{"duration_s": 3, "text": "wide"}' --shot '{"duration_s": 5, "text": "medium"}' \
    --total-duration-s 8 > /tmp/py_kling.txt
$ npx tsx scripts/build-prompt.ts [same args] > /tmp/ts_kling.txt
$ diff /tmp/py_kling.txt /tmp/ts_kling.txt && echo IDENTICAL
IDENTICAL
```

**seedream-5-0-pro (largest script — 445/316 lines, 33 tests), Edit mode with target/color/layers/text:**
```
$ python3 scripts/build-prompt.py --mode Edit --subject "Recolour the car body to a deep metallic blue." \
    --action "" --setting "" --camera "" --style "Keep the original commercial-product look." \
    --reference "a red sports car in a studio" \
    --target "the box around the body panels, not the windows" --color "#1E3A8A" --layers \
    --in-image-text 'the plate "SD5"' --text-language en --aspect-ratio 4:5 --resolution 2K \
    > /tmp/py_seedream5.txt
$ npx tsx scripts/build-prompt.ts [same args] > /tmp/ts_seedream5.txt
$ diff /tmp/py_seedream5.txt /tmp/ts_seedream5.txt && echo IDENTICAL
IDENTICAL
```

**veo-3-1 (20 tests, timestamp-segment JSON), T2V with 4 bracket segments + negative prompt:**
```
$ python3 scripts/build-prompt.py --mode T2V --subject "A barista pulls an espresso shot." \
    --action "Hands rest on the portafilter." --setting "A small Melbourne specialty cafe at 7:30 am." \
    --style "Cinematic photograph, neutral grade." --camera "Medium close-up at 50 mm." \
    --motion "Barista lifts portafilter, locks it, presses brew." \
    --audio 'A woman says, "We have to leave now."' --duration-s 8 \
    --timestamp-segment '{"bracket": "[00:00-00:02]", "text": "Medium shot"}' \
    --timestamp-segment '{"bracket": "[00:02-00:04]", "text": "Reverse shot"}' \
    --timestamp-segment '{"bracket": "[00:04-00:06]", "text": "Tracking shot"}' \
    --timestamp-segment '{"bracket": "[00:06-00:08]", "text": "Wide crane"}' \
    --negative-prompt "blurriness, distortion, extra limbs" > /tmp/py_veo.txt
$ npx tsx scripts/build-prompt.ts [same args] > /tmp/ts_veo.txt
$ diff /tmp/py_veo.txt /tmp/ts_veo.txt && echo IDENTICAL
IDENTICAL
```
Also verified veo-3-1's `{"start_s": N, "end_s": N, "text": ...}` segment shape (the alternative to
`bracket`) separately — also byte-identical.

### 3. Non-vacuousness proof (`chatgpt-image-2`)

```
$ # build-prompt.ts's negation guard temporarily disabled:
$ #   if (allNegation(...Object.values(clauses))) {
$ #   ->
$ #   if (false && allNegation(...Object.values(clauses))) {

$ node --import tsx --test .claude/skills/chatgpt-image-2/scripts/build-prompt.test.ts
not ok 1 - negation-only subject raises
not ok 2 - negation guard
# tests 10
# pass 9
# fail 1

$ # guard restored to: if (allNegation(...Object.values(clauses))) {

$ node --import tsx --test .claude/skills/chatgpt-image-2/scripts/build-prompt.test.ts
# tests 10
# pass 10
# fail 0

$ grep -n "false &&" .claude/skills/chatgpt-image-2/scripts/build-prompt.ts
(no output — clean)
```

### 4. `python3` grep across `.claude/` (after all 22 `.py` files deleted)

```
$ grep -rn "python3" .claude/
(no output)

$ find .claude/skills -name "*.py"
(no output)
```

### 5. Full suite, docs, build, and OpenSpec validation

```
$ npm test
tsc -p tsconfig.json --noEmit  (0 errors)
# tests 3906
# suites 1045
# pass 3906
# fail 0

(baseline at cdb68a0 was 3662 tests / 953 suites / 0 fail — delta: +244 tests, 0 fail)

$ npm run test:docs
# tests 351
# suites 94
# pass 351
# fail 0

$ npm run build
tsc -p tsconfig.build.json  (0 errors; dist/ contains no .claude/skills output)

$ npx openspec validate issue-255-prompt-builders-typescript --strict
Change 'issue-255-prompt-builders-typescript' is valid

$ npx openspec validate --all --strict
Totals: 69 passed, 0 failed (69 items)
```

### 6. Manifest guard re-run, unmodified, against the ported tree

```
$ node --import tsx --test src/claude-skills/reference-citation-guard.docs-test.ts
ok 1 - dangling reference-citation guard (issue #252)
ok 2 - catalogue entry manifest completeness (issue #212)
# tests 3
# pass 3
# fail 0
```

---

## QA Verdict — Round 1: PASS

### Suite result

All commands re-run independently by QA, in the worktree, from scratch:

| Command | Result |
|---|---|
| `npm test` | `tsc -p tsconfig.json --noEmit` 0 errors, then **3906 tests / 1045 suites / 0 fail** |
| `npm run test:docs` | **351 tests / 94 suites / 0 fail** |
| `npm run build` | `tsc -p tsconfig.build.json` — 0 errors |
| `npx openspec validate issue-255-prompt-builders-typescript --strict` | `Change 'issue-255-prompt-builders-typescript' is valid` |
| `npx openspec validate --all --strict` | `Totals: 69 passed, 0 failed (69 items)` |

Baseline arithmetic independently corroborated (not merely trusted): `git diff cdb68a0 --name-status -- src/`
returns **nothing** — `src/` is untouched by this diff, so the entire +244 delta can only have come from
the 22 new `.claude/skills/**/*.test.ts` files. Re-running each of the 11 ported test files individually
and summing `# tests` gives **244** exactly (see per-skill table below), so 3906 − 244 = 3662 matches the
Build Report's claimed baseline without relying on it.

### Per-criterion results (issue #255)

| Acceptance criterion | Result | Evidence |
|---|:---:|---|
| Port all 11 `build-prompt.py` → `build-prompt.ts`, runnable with `npx tsx` | PASS | All 11 files present at `.claude/skills/<entry>/scripts/build-prompt.ts`; ran live for 2 skills not in the Build Report's own transcripts (`grok-imagine` edit mode, `happy-horse` I2V+dialogue), both exit 0 |
| Port all 11 `test_build_prompt.py` → Node's test runner, running inside `npm test` | PASS | `npm test`'s glob includes `.claude/skills/**/*.test.ts`; full suite green, +244 confirmed above |
| Update each `SKILL.md`/`metadata.yaml` to name the TS entry point | PASS | All 11 `SKILL.md` "Closing — validation" sections invoke `npx tsx scripts/build-prompt.ts`; all 11 `metadata.yaml` `scripts:`/`evals:` name `.ts` paths; `tools: []` in all 11 |
| Delete the 22 `.py` files only once green | PASS | `find .claude/skills -name "*.py"` → zero; `git diff cdb68a0 --name-status` shows exactly 22 `D` entries (11 `build-prompt.py` + 11 `test_build_prompt.py`), 22 `A` (the `.ts` pairs) + 4 openspec files, 25 `M` (11 SKILL.md + 11 metadata.yaml + package.json + 2 tsconfigs) — matches the Build Report's file list exactly |
| No `python3` reference survives anywhere in `.claude/` | PASS | `grep -rn "python3" .claude/` → no output (re-run by QA) |
| Port tests before script, per-skill | PASS (process claim, not independently re-derivable) | Single squashed commit on this branch (`git log cdb68a0..HEAD` → 1 commit), so QA cannot replay the intra-slice ordering from history; taken on the Build Report's live transcript, which is plausible and consistent with every port's current shape |
| Per-skill test count reported, matches Python, 244 total | PASS | QA independently ran all 11 ported files and summed counts: 10/21/35/26/26/13/26/12/22/33/20 = **244**, matching the issue's own table exactly; spot-checked 3 Python originals not in the Build Report's own ground-truthing note (`grok-imagine`: 21, `seedream-4-5`: 22, `kling-3-0-omni`: 13) by running `python3 test_build_prompt.py` from `git show cdb68a0:...` — all match |
| Identical output for ≥3 skills of differing size | PASS | Build Report showed 4 (`chatgpt-image-2`, `kling-3-0`, `seedream-5-0-pro`, `veo-3-1`); QA independently reproduced `chatgpt-image-2`'s T2I transcript live and extended to 2 skills the Build Report never touched — `nano-banana-2` (T2I + MR with JSON references) and `seedance-2-0` (T2V + MR error path) — all `diff` clean |
| Prove ported tests are not vacuous | PASS | Build Report demonstrated `chatgpt-image-2`'s negation guard; QA independently reproduced on a **different skill and different rule** — `veo-3-1`'s timestamp-segment-sum-must-equal-duration check — disabling it flipped exactly 1 of 20 tests red (`segments not summing raises`), restoring returned 20/20, md5 of the restored file matched the pre-edit md5 exactly, `git status` clean throughout |
| Cross-ticket manifest interaction (#212) honoured | PASS | Read `src/claude-skills/manifest-completeness-scan.ts` directly: confirmed its `evals[].path` check only verifies membership in the entry's own `scripts[].path` set, never disk existence of `scripts[].path` itself — the exact gap QA was asked to hunt. Checked all 11 `metadata.yaml`'s declared `scripts:`/`evals:` paths against the real filesystem: **every declared path resolves to a real file** — no dangling declaration found. This is a live near-miss (the guard alone would not have caught it if the developer had forgotten a rename), but not an actual defect in this build. See Defect list, item D1 (informational, not blocking). |

### Per-scenario results (spec deltas vs issue)

| Requirement / Scenario | Result | Covering test / evidence |
|---|:---:|---|
| Byte-identical stdout, ≥3 skills | PASS | 4 in Build Report + 2 more by QA (`nano-banana-2`, `seedance-2-0`), all `diff` clean |
| Validation failure raises same error class | PASS | Confirmed live for `chatgpt-image-2` negation guard (both Python/TS), and for `seedance-2-0`'s MR mix-budget heuristic — error text byte-identical between languages |
| `npm test` runs and passes all 244 ported tests alongside existing suite | PASS | 3906/1045/0 fail, delta +244 exactly (see Suite result) |
| A broken validation rule is caught by its own ported test, not vacuous | PASS | Both the developer's (`chatgpt-image-2`) and QA's own (`veo-3-1`) independent reproduction |
| Ported script's own type-checking is included in `npm test`'s pretest step | PASS | `.claude/skills/**/*.ts` is in `tsconfig.json`'s `include`; `tsc -p tsconfig.json --noEmit` (the same invocation `npm test` runs) covers it — confirmed no `@ts-nocheck`/`@ts-ignore` anywhere under `.claude/skills/*/scripts/*.ts` and no per-directory override `tsconfig`/`jsconfig` exists there |
| `npm run build` excludes `.claude/skills`, `dist/` unaffected | PASS | `npm run build` exits 0; `find dist -path "*claude*"` shows only `dist/claude-agents`, `dist/claude-commands`, `dist/claude-skills` (the pre-existing `src/claude-*` guard modules) — **no** `dist/.claude` or any compiled `build-prompt.js` anywhere |
| Every `metadata.yaml` declares `tools: []` and `.ts` scripts/evals paths | PASS | Confirmed for all 11 |
| Grepping `.claude/` for `python3` finds nothing | PASS | Re-run by QA, no output |
| Existing manifest/dangling-citation guard stays green, unmodified | PASS | `git diff cdb68a0 --stat -- src/claude-skills/` → empty (file byte-for-byte unmodified); re-run directly, 3/3 pass |
| No `.py` file remains under `.claude/skills` | PASS | `find .claude/skills -name "*.py"` → empty |

### Test-by-test fidelity check (job (b), "matching counts are necessary, not sufficient")

Compared the Python original (`git show cdb68a0:...`) against the TypeScript port test-by-test, full text,
for **three** skills — one more than the minimum requested:

- **`chatgpt-image-2`** (10 tests): every `test_*` method ported 1:1 — same fixture values, same
  `assertIn`/`assertRaises` → `assert.match`/`assert.throws` mapping, same ordering assertions
  (`idx_subject < idx_setting < idx_camera`). No weakening found.
- **`kling-3-0`** (26 tests): every class (`TestT2V`, `TestI2V`, `TestMR`, `TestFL`, `TestMultiShot`,
  `TestAudio`, `TestMotionIntensity`, `TestNegativePrompt`, `TestAspect`, `TestDuration`) ported with
  identical fixtures (the same `base()` helper, same overrides per test), identical assertions including
  every `assertRaises(PromptValidationError)` → `assert.throws(..., PromptValidationError)`. No weakening
  found.
- **`nano-banana-2`** (26 tests): every class ported 1:1 including the variant-aware MR-cap boundary tests
  (Flash 10 objects passes / 11 raises, Pro 6 characters raises at exactly the boundary, the 14-total-cap
  test), the frame-sequence 2/4/9-frame boundary tests, and the resolution/grounding per-variant tests. No
  weakening found.

No test in any of the three sampled skills had an assertion dropped, an exact-output check downgraded to
a substring check, or a `raises` expectation downgraded to a truthiness check. All three are faithful
1:1 ports, not merely count-matched.

### Always-rules + hermeticity checks

| Rule | Result | Evidence |
|---|:---:|---|
| Generate-never-publish | N/A (out of scope) | This slice touches no Producer/Space/publish code path at all |
| Public-metrics-only | N/A | No metrics code touched |
| Relative-not-absolute | N/A | No scoring code touched |
| Explicit-attribution | N/A | No ledger/attribution code touched |
| Ledger-as-source-of-truth | N/A | `src/` entirely untouched (`git diff cdb68a0 --name-status -- src/` empty); no ledger/store write anywhere in this diff |
| Magnific fake / no live-Space calls | PASS | `grep -rln "spaces_\|creations_\|apify\|Apify\|APIFY" .claude/skills/*/scripts/*.ts` → no matches; the 244 tests exercise pure `buildPrompt()` string logic only, no network, no credits, no board mutation |
| No new runtime dependency | PASS | `package.json`'s `dependencies` unchanged (`jpeg-js`, `yaml` — both pre-existing in base `cdb68a0`, confirmed via `git show cdb68a0:package.json`); `package-lock.json` has zero diff |
| Five shared craft references untouched | PASS | `git diff cdb68a0 --stat -- .claude/references/` → empty |

### `tsconfig.json` scrutiny (job 4)

- **`dist/` unaffected**: confirmed no `.claude/skills` output and no `build-prompt.js` anywhere under
  `dist/` after a real `npm run build`.
- **No strictness lost, and it applies to the new skill scripts too**: `tsconfig.json`'s
  `compilerOptions` (which `tsconfig.build.json` extends, unmodified) retains `strict`,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`,
  `noImplicitOverride` unchanged; `.claude/skills/**/*.ts` is in the same `include` list as `src/**/*.ts`
  and is type-checked by the same single `tsc -p tsconfig.json --noEmit` invocation `npm test` runs — no
  `@ts-nocheck`/`@ts-ignore` escape hatch and no per-directory override config exists anywhere under
  `.claude/skills`.
- **`TS6059` claim reproduced live, not merely accepted**: QA copied `tsconfig.json`, added back
  `rootDir: "src"`, saved it as a sibling file `tsconfig.rootDir-test.json` inside the repo root (required
  for its relative `include` globs to resolve), and ran `npx tsc -p tsconfig.rootDir-test.json --noEmit`
  directly. It failed with `TS6059: File '.../.claude/skills/.../build-prompt.test.ts' is not under
  'rootDir' '.../src'` for every one of the 11 skills' test files. The temp config file was deleted
  immediately after; `git status` confirmed clean.

### Non-vacuousness proof reproduced independently (job 5)

Done on `veo-3-1` (not used by the developer) and its timestamp-segment-duration-sum rule (not
`chatgpt-image-2`'s negation guard). Full detail in the Per-criterion table above. `md5` before/after
edit: `07170b6751ab8261a428ab775127d7c5` both times; `git status` clean after restore.

### Doc-as-written check (job 6)

Followed two `SKILL.md` "Closing — validation" code blocks literally, verbatim, substituting only the
`"..."` placeholders with real values:

- `grok-imagine`'s documented edit-mode invocation → ran, exit 0, correct output.
- `happy-horse`'s documented I2V + dialogue invocation → ran, exit 0, correct output, byte-identical to
  the Python original run on the same arguments (the `Camera: Static..` double-period is a pre-existing
  Python quirk, reproduced faithfully, not a porting bug — confirmed by running the recovered Python
  original on the same input).

### Defect list

**D1 — informational, not blocking (severity: low).** The manifest-completeness guard
(`src/claude-skills/manifest-completeness-scan.ts`) checks `evals[].path` for membership in the entry's
own declared `scripts[].path` set, but never checks that a declared `scripts[].path` (or `evals[].path`)
actually exists on disk. In this build that gap is **not exercised** — QA independently verified all 22
declared script paths across all 11 `metadata.yaml` files resolve to real files — so there is no live
defect to fix in this slice. Flagging only because the guard itself would stay green even if a future
edit renamed or deleted a declared script without updating the manifest (the same shape as #212's own
two false-promise findings and #252's dangling citations). Repro: read
`src/claude-skills/manifest-completeness-scan.ts` lines 226–253 — `declaredScriptPaths` is built from
`metadata["scripts"]` itself, and the `evals[].path` check only cross-references that in-memory set, with
no `existsSync` call anywhere in the file. No action required for issue #255; worth a follow-up ticket if
the Operator wants the guard hardened, out of this slice's scope.

No other defects found.

### Round-1 verdict

**PASS.** Full suite green (3906/1045/0, independently re-run), both docs-tests and build clean, both
OpenSpec validations strict-green, +244 delta independently derived (not merely trusted) from `src/`
being fully untouched, every acceptance criterion mapped to a passing test QA itself exercised, three
skills' tests compared 1:1 against their Python originals with no weakened assertion found, two
additional skills' identical-output comparisons done beyond the Build Report's own four, the
non-vacuousness proof independently reproduced on a different skill and rule, the `TS6059`/`rootDir`
claim reproduced live rather than accepted on faith, and the hunted manifest-dangling-path gap checked
file-by-file with no live instance found. Proceed to branch + PR.
