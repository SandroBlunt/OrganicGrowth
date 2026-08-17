# Slice Handoff — issue #212: The catalogue ships (manifest half)

## Build Report

### What changed

Issue #212 had four criteria already settled before this slice started (the shared reference folder
recovery — #252, merged; the MIT `LICENSE` file — merged; the Python decision — split to #255; and the
brand-removal half of "installs and runs without the Operator's brand baked in" — already zero-hit). This
slice builds the **remaining four**:

1. **Defined and documented the manifest format** — `docs/catalogue-manifest-format.md`. Read all 11
   model-prompting Skills' `metadata.yaml` files field-by-field before designing anything, per the
   issue's own instruction. Found the manifest is mostly already there: `name`, `version`,
   `target_model`, `modes`, `inputs`/`outputs`, `scripts`, `references`, `source_tracking`, and —
   critically — a `shared_references` block that **already declared** the shared-reference dependency
   (`mode: relative-link`, `path: ../../references/`). Genuinely missing: `licence`, `owner`, `entities`
   (reads/writes), `tools`, `target_model.fallbacks`, `evals`, and two new keys
   (`required`/`install`) on the existing `shared_references` block. The manifest is defined as the union
   of `SKILL.md` frontmatter (`name`, `description` = purpose) and `metadata.yaml` — deliberately no
   third, parallel manifest file, and deliberately no second `purpose`/`config` field duplicating what
   `description`/`inputs`+`outputs` already say (drift risk with no offsetting benefit).

2. **All 11 model-prompting Skills now carry a complete manifest.** Six additive field groups landed in
   every one of the 11 `metadata.yaml` files: `licence: MIT` + `owner: Sandro Franco` (top-level, matching
   the root `LICENSE`); `target_model.fallbacks: []` (explicit — a fallback model is a Producer/Recipe-
   level runtime decision, not a prompting Skill's own, per `docs/adr/0003`/`0007`); `entities.reads`/
   `entities.writes`; `tools` (declares the `python3` runtime dependency the existing `scripts:` already
   name — no `.py` file or Python-invoking `SKILL.md` section touched, only new declarative YAML); `evals`
   (points at the entry's own existing `scripts/test_build_prompt.py`); and `shared_references.required:
   true` + `shared_references.install: copy-alongside` on the existing block. Every file's diff is
   exactly 18 additive lines, 0 deletions (`git diff --stat` confirms this uniformly across all 11).

3. **Extended the existing dangling-citation guard, not a second one.** Per the issue's own instruction
   ("extend that guard, do not build a second one"), `src/claude-skills/reference-citation-guard.docs-
   test.ts` — the SAME file #252 landed — gained a new `describe` block backed by a new pure module
   (`src/claude-skills/manifest-completeness-scan.ts`) that checks every field from (2) above, cross-
   checking `licence`/`owner` against the repository's own real `LICENSE` file (never hard-coded) so the
   two can never quietly drift apart.

4. **Installing one entry into a genuinely clean checkout, verified end to end.** A finding the issue
   did not have: every one of the 11 `references/README.md` files ended with a promise — *"For a fully
   standalone copy of this skill, use the `portable/image/<name>/` variant, which duplicates the shared
   references into its own `references/` folder"* — and **no `portable/` directory has ever existed in
   this repository** (`find . -iname "portable*"` and `git log --all --diff-filter=A -- '*portable*'`
   both return nothing). This is the exact class of bug #252 fixed, one level up: a Skill's own docs
   promising a resolution that isn't there. Fixed by replacing that closing paragraph in all 11 files
   with the real, decided mechanism (installer-side copy-alongside — argued against vendoring, which
   would multiply 5 documents × 11 entries into 55 files guaranteed to drift, and against declare-and-
   refuse, which converts a packaging gap into a runtime failure instead of preventing it at install
   time), pointing at `docs/catalogue-manifest-format.md`. Built
   `src/claude-skills/install-catalogue-entry.ts` (pure `planInstall` + thin `copyDirectoryRecursive` +
   `installCatalogueEntry` shell) and proved it end to end both as a permanent automated test
   (`install-catalogue-entry.docs-test.ts`, installing `veo-3-1` into a fresh `mkdtemp` directory and
   re-running #252's own citation scanner against the INSTALLED copy) and as a one-off, by-hand
   transcript (below) against a genuinely empty `/tmp` directory — never a subfolder of this repository.

### Files touched

**Added:**
- `docs/catalogue-manifest-format.md`
- `src/claude-skills/manifest-completeness-scan.ts` (+ `.test.ts`, 33 tests)
- `src/claude-skills/install-catalogue-entry.ts` (+ `.test.ts` — 6 tests; `.docs-test.ts` — 1 test)
- `openspec/changes/issue-212-catalogue-manifests/{proposal.md,tasks.md,handoff.md,specs/skill-catalogue-manifest/spec.md}`

**Modified:**
- All 11 `.claude/skills/{chatgpt-image-2,grok-imagine,grok-imagine-1-5,happy-horse,kling-3-0,kling-3-0-omni,nano-banana-2,seedance-2-0,seedream-4-5,seedream-5-0-pro,veo-3-1}/metadata.yaml`
  (18 additive lines each, 0 deletions — `licence`, `owner`, `target_model.fallbacks`, `entities`,
  `tools`, `evals`, `shared_references.required`/`install`)
- All 11 corresponding `references/README.md` files (closing paragraph only — the `portable/` fix)
- `src/claude-skills/reference-citation-guard.docs-test.ts` (new `describe` block, same file, not a new
  one — issue #212's own instruction)
- `src/fs-boundary/allow-list.ts` (one new entry: `src/claude-skills/install-catalogue-entry.ts`, with a
  stated reason)

**Untouched, confirmed via `git diff --name-only`:** every `.py` file (zero matches for `\.py$`); every
`SKILL.md` file (zero matches for `SKILL\.md$`); the five `.claude/references/*.md` documents from #252;
the 5 workflow Skills (`fetch-curated-source`, `produce-character-explainer`, `produce-news-carousel`,
`produce-news-short-script`, `write-social-copy`); every production runtime module outside
`src/claude-skills/` and the one `fs-boundary` allow-list line.

### How to run

```bash
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-212-catalogue-manifests

# Full suite (type-check + all tests)
npm test

# Just the docs-tests (disk-touching guards)
npm run test:docs

# Just this slice's new modules
node --import tsx --test src/claude-skills/manifest-completeness-scan.test.ts
node --import tsx --test src/claude-skills/install-catalogue-entry.test.ts
node --import tsx --test src/claude-skills/install-catalogue-entry.docs-test.ts
node --import tsx --test src/claude-skills/reference-citation-guard.docs-test.ts
node --import tsx --test src/fs-boundary/node-fs-guard.test.ts   # confirms the allow-list addition is exact

npm run build   # production compile

openspec validate issue-212-catalogue-manifests --strict
openspec validate --all --strict
```

**Results on this branch:**

| Command | Result |
|---|---|
| `npm test` | **3529 tests / 923 suites / 0 fail** (baseline on `main` at `8d8112a` was 3488/915/0 — delta is exactly +41 tests / +8 suites: `manifest-completeness-scan.test.ts` 33 tests/5 suites, `install-catalogue-entry.test.ts` 6 tests/1 suite, `install-catalogue-entry.docs-test.ts` 1 test/1 suite, and `reference-citation-guard.docs-test.ts`'s new `describe` block +1 test/+1 suite) |
| `npm run test:docs` | **351 tests / 94 suites / 0 fail** (baseline 349/92/0 — delta is exactly the 2 new docs-test additions above) |
| `npm run build` | clean, no errors |
| `openspec validate issue-212-catalogue-manifests --strict` | `Change 'issue-212-catalogue-manifests' is valid` |
| `openspec validate --all --strict` | **67 passed, 0 failed** (baseline 66 — delta is exactly this one new change) |

### Acceptance-criteria self-assessment

Mapping the four in-scope criteria (per the Operator's own settled-scope table) to what proves each:

| Acceptance criterion | Proof |
|---|---|
| A manifest format is defined and documented: name, version, licence, owner, purpose, entities read/written, tools, model + fallbacks, config, evals | `docs/catalogue-manifest-format.md` — full field table naming which file each field lives in, plus the shared-reference-dependency decision and its rejected alternatives; `openspec/.../specs/skill-catalogue-manifest/spec.md`'s first Requirement + its two Scenarios |
| All 11 model-prompting Skills carry a complete manifest | All 11 `metadata.yaml` files parse and carry every new field (verified live via a direct `yaml.parse` + field-presence check on all 11, see "Fakes / fixtures used" below); the manifest-completeness guard's own real-tree run is green (`ok 1 - every catalogue entry ... carries a complete manifest`) |
| An automated check fails when a catalogue entry has an incomplete manifest (dangling-reference half already shipped in #252 — extend that guard) | `manifest-completeness-scan.ts` (pure, 33 unit tests) + the SAME `reference-citation-guard.docs-test.ts` file's new `describe` block (not a new file); **6 separate red→green transcripts below**, one field at a time, plus a 7th proving the dangling-citation guard (not the completeness guard) is the one that catches a corrupted `shared_references.path` — the two checks stay properly distinct |
| Installing one entry into a clean checkout is verified end to end, result posted | `install-catalogue-entry.ts` + `.docs-test.ts` (installs `veo-3-1` into a fresh `mkdtemp` dir, re-runs #252's citation scanner against the INSTALLED copy, asserts zero dangling); **the one-off, by-hand transcript against a genuinely empty `/tmp` directory is below**, with every citation manually resolved by hand in addition to the automated check |

### Fakes / fixtures used

- **No Magnific fake needed and none used.** This slice touches no production runtime path, no
  `spaces_*`/`creations_*` call of any kind — confirmed nothing in this diff imports or references
  `src/space-driver/` or any producer runtime module (`grep -rn "spaces_\|creations_\|magnific" src/claude-skills/`
  returns nothing). Entirely `.claude/skills/` metadata + documentation, `docs/`, and new, pure/thin
  `src/claude-skills/` modules whose only disk access is reading/copying plain text and YAML files. The
  `developer` agent is not given the `magnific` MCP tools in the first place.
- **In-memory fixtures only** in `manifest-completeness-scan.test.ts` and `install-catalogue-entry.test.ts`
  — no real disk I/O in either file (mirrors the pure/impure split `reference-citation-scan.ts` /
  `reference-citation-guard.docs-test.ts` already established in #252).
- **The two disk-touching fixtures**: `reference-citation-guard.docs-test.ts`'s new `describe` block walks
  the REAL `.claude/skills/` tree and reads the REAL `LICENSE` file (so the licence/owner cross-check can
  never drift from what the repository actually says); `install-catalogue-entry.docs-test.ts` creates a
  REAL, freshly `mkdtemp`'d temp directory, installs into it, and removes it afterward (`finally` block —
  cleaned up whether the test passes or fails).
- **Live field-presence check across all 11 real files** (run directly, not assumed):
  ```
  $ node -e '... parse each of the 11 metadata.yaml, list any of [licence,owner,entities,tools,evals] missing ...'
  chatgpt-image-2 OK missing: none fallbacks-array: true sr.required: true sr.install: copy-alongside
  grok-imagine OK missing: none fallbacks-array: true sr.required: true sr.install: copy-alongside
  ... (all 11, identical shape)
  ```

### Self-review notes

- Confirmed the 11 `metadata.yaml` diffs are byte-uniform in shape (18 additive lines, 0 deletions each —
  `git diff --stat` output pasted below) — no stray formatting drift between files despite different
  anchor text per file (`target_model`'s last key varies: `modalities` for 8 files, `front_ends` for
  `grok-imagine`/`seedream-4-5`/`seedream-5-0-pro`; `model_id` vs. `model` for `grok-imagine` alone —
  handled explicitly in `manifest-completeness-scan.ts`'s "at least one of `model_id`/`model`" check and
  pinned by its own unit test).
- Deliberately did **not** add a second, duplicate `purpose` field to `metadata.yaml` (SKILL.md's own
  `description` already is it) or a duplicate `config` block (`inputs`/`outputs` already are it) — both
  would be a second source of truth for one fact with no offsetting benefit, the exact drift risk this
  whole slice is about closing elsewhere (vendoring). Documented explicitly in
  `docs/catalogue-manifest-format.md`.
- Confirmed the manifest-completeness guard lives in the SAME file `#252` landed
  (`reference-citation-guard.docs-test.ts`), not a new one — literal compliance with the issue's own
  "extend that guard, do not build a second one" instruction.
- Removed a redundant duplicate `existsSync` import ordering nit in `install-catalogue-entry.docs-test.ts`
  (grouped with the other `node:*` imports instead of trailing after the local imports) during the
  simplify pass; re-typechecked clean after.
- Confirmed `entities.writes`/`target_model.fallbacks`'s "present, may be empty" checks are deliberately
  NOT routed through the shared `requireArray(field, value, minLength)` helper (which is used for the
  `minLength >= 1` cases) — `requireArray` with `minLength: 0` would produce an "expected at least 0
  entries" message, which reads badly for a legitimately-empty-is-fine field; kept as two small, clearly
  distinct checks rather than forcing one helper to cover both shapes. A deliberate choice, not
  overlooked duplication.
- Every acceptance criterion maps to a specific test or a specific, live-run command (table above) — none
  is asserted only in prose.
- Confirmed via `git diff --name-only | grep -E "\.py$|SKILL\.md$"` (both return nothing) that no `.py`
  file and no `SKILL.md` file — including any Python-invoking prose section — was touched anywhere in this
  diff, per the brief's explicit instruction.

### `git diff --stat` — all 11 `metadata.yaml` files, uniform shape

```
$ git diff --stat -- '.claude/skills/*/metadata.yaml'
 .claude/skills/chatgpt-image-2/metadata.yaml  | 18 ++++++++++++++++++
 .claude/skills/grok-imagine-1-5/metadata.yaml | 18 ++++++++++++++++++
 .claude/skills/grok-imagine/metadata.yaml     | 18 ++++++++++++++++++
 .claude/skills/happy-horse/metadata.yaml      | 18 ++++++++++++++++++
 .claude/skills/kling-3-0-omni/metadata.yaml   | 18 ++++++++++++++++++
 .claude/skills/kling-3-0/metadata.yaml        | 18 ++++++++++++++++++
 .claude/skills/nano-banana-2/metadata.yaml    | 18 ++++++++++++++++++
 .claude/skills/seedance-2-0/metadata.yaml     | 18 ++++++++++++++++++
 .claude/skills/seedream-4-5/metadata.yaml     | 18 ++++++++++++++++++
 .claude/skills/seedream-5-0-pro/metadata.yaml | 18 ++++++++++++++++++
 .claude/skills/veo-3-1/metadata.yaml          | 18 ++++++++++++++++++
 11 files changed, 198 insertions(+)
```

### PROVE THE CHECK FAILS — six red→green transcripts, one field at a time, plus the dangling-citation guard staying properly distinct

Per the brief's explicit demand (the sixth-guard-shipped-blind lesson). Target file for all six:
`.claude/skills/veo-3-1/metadata.yaml`. A byte-identical backup was taken once, before any mutation, and
used to restore after every single mutation — confirmed via `md5` after every restore.

```
$ md5 .claude/skills/veo-3-1/metadata.yaml
MD5 (.../veo-3-1/metadata.yaml) = 0b749dff95fe16077a89a8b1647f3c68        # the one true "complete" state
```

**Mutation 1 — remove `licence: MIT`:**
```
$ sed -i '' '/^licence: MIT$/d' .claude/skills/veo-3-1/metadata.yaml
$ npx tsx --test src/claude-skills/reference-citation-guard.docs-test.ts
not ok 1 - every catalogue entry ... carries a complete manifest
  error: Incomplete catalogue-entry manifest field(s) found: [
    { "skillName": "veo-3-1", "field": "licence", "reason": "expected a non-empty string, found undefined" }
  ]
# fail 1
$ cp <backup> .claude/skills/veo-3-1/metadata.yaml   # restore
$ md5 .claude/skills/veo-3-1/metadata.yaml            # 0b749dff... — byte-identical
$ npx tsx --test src/claude-skills/reference-citation-guard.docs-test.ts
# pass 3, fail 0
```

**Mutation 2 — remove `owner: Sandro Franco`:**
```
$ sed -i '' '/^owner: Sandro Franco$/d' .claude/skills/veo-3-1/metadata.yaml
$ npx tsx --test src/claude-skills/reference-citation-guard.docs-test.ts
not ok 1 ... error: Incomplete catalogue-entry manifest field(s) found: [
    { "skillName": "veo-3-1", "field": "owner", "reason": "expected a non-empty string, found undefined" }
  ]
$ cp <backup> ...   # restore; md5 confirmed identical; re-run green
```

**Mutation 3 — remove `target_model.fallbacks: []`:**
```
$ sed -i '' '/^  fallbacks: \[\]$/d' .claude/skills/veo-3-1/metadata.yaml
$ npx tsx --test src/claude-skills/reference-citation-guard.docs-test.ts
not ok 1 ... error: Incomplete catalogue-entry manifest field(s) found: [
    { "skillName": "veo-3-1", "field": "target_model.fallbacks",
      "reason": "expected an array (may be empty), found undefined" }
  ]
$ cp <backup> ...   # restore; md5 confirmed identical; re-run green
```

**Mutation 4 — empty `entities.reads`:**
```
$ perl -0pi -e 's/  reads:\n    - references\/\*\.md\n    - \.\.\/\.\.\/references\/\*\.md\n/  reads: []\n/' \
    .claude/skills/veo-3-1/metadata.yaml
$ npx tsx --test src/claude-skills/reference-citation-guard.docs-test.ts
not ok 1 ... error: Incomplete catalogue-entry manifest field(s) found: [
    { "skillName": "veo-3-1", "field": "entities.reads", "reason": "expected at least 1 entry, found 0" }
  ]
$ cp <backup> ...   # restore; md5 confirmed identical; re-run green
```

**Mutation 5 — blank `shared_references.install`:**
```
$ sed -i '' 's/^  install: copy-alongside$/  install: ""/' .claude/skills/veo-3-1/metadata.yaml
$ npx tsx --test src/claude-skills/reference-citation-guard.docs-test.ts
not ok 1 ... error: Incomplete catalogue-entry manifest field(s) found: [
    { "skillName": "veo-3-1", "field": "shared_references.install",
      "reason": "expected a non-empty string, found \"\"" }
  ]
$ cp <backup> ...   # restore; md5 confirmed identical; re-run green
```

**Mutation 6 — the shared-reference dependency SPECIFICALLY, the other half: corrupt `shared_references.path`
to a wrong-but-still-`references/`-shaped folder, proving the pre-existing #252 dangling-citation guard
(not the new completeness guard) is the one that catches it — the two checks stay properly distinct:**
```
$ sed -i '' 's|^  path: \.\./\.\./references/$|  path: ../../wrong-place/references/|' \
    .claude/skills/veo-3-1/metadata.yaml
$ npx tsx --test src/claude-skills/reference-citation-guard.docs-test.ts
not ok 1 - dangling reference-citation guard (issue #252)          <- the OLD guard fires, not the new one
  actual: [{
    citingFile: '.claude/skills/veo-3-1/metadata.yaml',
    rawPath: '../../wrong-place/references/',
    resolvedPath: '.claude/wrong-place/references'
  }]
ok 2 - catalogue entry manifest completeness (issue #212)          <- the completeness guard stays GREEN
                                                                        (the field itself is still a
                                                                        non-empty string — it's just wrong)
# pass 2, fail 1
$ cp <backup> ...   # restore; md5 confirmed identical
$ npx tsx --test src/claude-skills/reference-citation-guard.docs-test.ts
# pass 3, fail 0
```

**Final state after all six mutations, confirmed byte-identical to the one true "complete" backup:**
```
$ md5 .claude/skills/veo-3-1/metadata.yaml
MD5 (.../veo-3-1/metadata.yaml) = 0b749dff95fe16077a89a8b1647f3c68   # matches, every time
$ npx tsx --test src/claude-skills/reference-citation-guard.docs-test.ts
# tests 3, pass 3, fail 0
```

(`git diff --stat -- .claude/skills/veo-3-1/metadata.yaml` after all six mutations/restores still shows
exactly the same 18-insertion, 0-deletion diff against `main` as every other one of the 11 files — the
diff against `main` reflects this session's own legitimate additions, not any leftover mutation; the
`md5` match against the pre-mutation-session backup is the precise, per-mutation restore proof.)

### End-to-end install verification — by-hand transcript against a genuinely empty `/tmp` directory (issue's own "result posted" requirement)

```
$ TMPDIR_INSTALL=$(mktemp -d /tmp/og-catalogue-install-manual-XXXXXX)
$ ls -la "$TMPDIR_INSTALL"
total 0
drwx------@   2 CaxtonTaylor  wheel     64 Aug 17 23:37 .
drwxrwxrwt  423 root          wheel  13536 Aug 17 23:37 ..
                                                                  # genuinely empty, nothing else copied in

$ npx tsx run-install.ts "$TMPDIR_INSTALL"     # calls installCatalogueEntry({ repoRoot, skillName: "veo-3-1", destDir: TMPDIR_INSTALL })
{
  "plan": { "installable": true, "strategy": "copy-alongside", "copySharedReferences": true },
  "entryFileCount": 7,
  "entryFiles": [
    "SKILL.md", "metadata.yaml",
    "references/README.md", "references/official-guidelines.md", "references/translation-notes.md",
    "scripts/build-prompt.py", "scripts/test_build_prompt.py"
  ],
  "sharedReferenceFileCount": 5,
  "sharedReferenceFiles": [
    "cinematography.md", "lighting.md", "photography.md", "production-design.md", "prompt-discipline.md"
  ]
}

$ find "$TMPDIR_INSTALL" -type f | sed "s|$TMPDIR_INSTALL/||" | sort
.claude/references/cinematography.md
.claude/references/lighting.md
.claude/references/photography.md
.claude/references/production-design.md
.claude/references/prompt-discipline.md
.claude/skills/veo-3-1/SKILL.md
.claude/skills/veo-3-1/metadata.yaml
.claude/skills/veo-3-1/references/README.md
.claude/skills/veo-3-1/references/official-guidelines.md
.claude/skills/veo-3-1/references/translation-notes.md
.claude/skills/veo-3-1/scripts/build-prompt.py
.claude/skills/veo-3-1/scripts/test_build_prompt.py
                                                                  # exactly the entry + the shared deps —
                                                                  # nothing from the rest of the repo

$ find "$TMPDIR_INSTALL" -maxdepth 1
/tmp/og-catalogue-install-manual-9WwAPi
/tmp/og-catalogue-install-manual-9WwAPi/.claude
                                                                  # confirms nothing else at the root either

# Every citation manually resolved by hand, both citing depths:
$ for f in cinematography lighting photography production-design prompt-discipline; do
    test -f "$TMPDIR_INSTALL/.claude/skills/veo-3-1/../../references/$f.md" && echo "OK ../../references/$f.md"
  done
OK ../../references/cinematography.md
OK ../../references/lighting.md
OK ../../references/photography.md
OK ../../references/production-design.md
OK ../../references/prompt-discipline.md

$ for f in cinematography lighting photography production-design prompt-discipline; do
    test -f "$TMPDIR_INSTALL/.claude/skills/veo-3-1/references/../../../references/$f.md" && \
      echo "OK ../../../references/$f.md (the deeper references/README.md's own citation depth)"
  done
OK ../../../references/cinematography.md (the deeper references/README.md's own citation depth)
OK ../../../references/lighting.md (the deeper references/README.md's own citation depth)
OK ../../../references/photography.md (the deeper references/README.md's own citation depth)
OK ../../../references/production-design.md (the deeper references/README.md's own citation depth)
OK ../../../references/prompt-discipline.md (the deeper references/README.md's own citation depth)

$ rm -rf "$TMPDIR_INSTALL"       # cleaned up
$ test -d "$TMPDIR_INSTALL" && echo STILL EXISTS || echo "cleaned up: no longer exists"
cleaned up: no longer exists
```

Both citation depths (`SKILL.md`'s `../../references/X.md` and `references/README.md`'s own
`../../../references/X.md`) resolve correctly in the installed copy, by hand and via the automated
`install-catalogue-entry.docs-test.ts` (which reproduces this exact scenario permanently, using the pure
#252 citation scanner instead of manual `test -f` loops).

**Posting the result on issue #212 itself is outside this agent's tool grant** (`gh issue view` only, no
`gh issue comment`) — the transcript above is the result; the Operator or `/build-issue` can post it
verbatim, or I can if explicitly asked with the right tool.

### Known limits

- **Not built in this slice (by design, settled scope):** the shared reference folder recovery and its
  guard (#252, merged); the MIT `LICENSE` file (merged); the Python test-vs-dependency decision (#255);
  the eight workflow Skills that restate npm scripts (out of scope by #211's own text).
- **The `tools` field's `python3` declaration will need updating once #255 lands** (the Python→TypeScript
  port) — noted explicitly in `docs/catalogue-manifest-format.md` as a follow-up for that change, not
  this one; not built here since this ticket's brief explicitly forbids touching `.py` files or Python-
  invoking `SKILL.md` sections.
- **The manifest-completeness guard's corpus discovery is structural (`has a metadata.yaml`), not a
  hard-coded name list** — a future 12th model-prompting Skill is automatically checked without a guard
  update; a future workflow Skill that never gets a `metadata.yaml` stays correctly out of scope.
- **`install-catalogue-entry.ts` only exercises the `copy-alongside` strategy against a real entry** (all
  11 real entries use it) — `vendored` and `refuse-without` are only exercised by `planInstall`'s pure
  unit tests (no real entry uses either today), which is honest: there is nothing real to install end to
  end for a strategy no entry declares.
- **Did not post to GitHub issue #212** — this agent's `gh` grant is read-only (`gh issue view`); the full
  transcript above is ready to paste verbatim by whoever does have that access.

Ready for qa.

## QA Verdict — Round 1: FAIL

### Suite result

All commands run exactly as documented, from `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-212-catalogue-manifests`
(branch `issue-212-catalogue-manifests` @ `5f40206`, built off `origin/main` @ `8d8112a`):

| Command | Result |
|---|---|
| `npm test` | **3529 tests / 923 suites / 0 fail** — matches the Build Report exactly |
| `npm run test:docs` | **351 tests / 94 suites / 0 fail** — matches exactly |
| `npm run build` | clean, no errors |
| `openspec validate issue-212-catalogue-manifests --strict` | `Change 'issue-212-catalogue-manifests' is valid` |
| `openspec validate --all --strict` | **67 passed, 0 failed** — matches exactly |

**Delta genuinely new, not a stopped-running test.** Ran the four new/extended test files individually:
`manifest-completeness-scan.test.ts` = 33 tests/5 suites; `install-catalogue-entry.test.ts` +
`install-catalogue-entry.docs-test.ts` = 7 tests/2 suites combined; `reference-citation-guard.docs-
test.ts` (whole file) = 3 tests/2 suites, where the pre-existing "dangling reference-citation guard"
`describe` alone (unchanged from #252) accounts for 2 tests/1 suite, so this file's own delta is exactly
+1 test/+1 suite. Total: 33 + 7 + 1 = **41 tests**, 5 + 2 + 1 = **8 suites** — matches the claimed
+41/+8 delta exactly, arithmetically forced, not merely asserted.

`git diff origin/main...HEAD --numstat -- '.claude/skills/*/metadata.yaml'` independently confirms **18
insertions, 0 deletions in every one of the 11 files** — the Build Report's "18 additive lines, 0
deletions" claim is literally true this round (unlike #252 Round 1, where a comparable factual claim
about these same files was false).

### Per-criterion results (the four in-scope criteria)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Manifest format defined and documented | **PASS** | `docs/catalogue-manifest-format.md` names every field the issue's own AC text lists (name, version, licence, owner, purpose, entities, tools, model+fallbacks, config, evals), states which file each lives in, and documents the shared-reference install decision plus both rejected alternatives with reasons |
| 2 | All 11 model-prompting Skills carry a complete manifest | **PASS** | `git diff --numstat` confirms all 11 `metadata.yaml` diffs are exactly 18/0; the real-tree guard run is green; brand-removal re-grepped and still zero-hit across all 11; no `.py` or `SKILL.md` file touched anywhere in the diff (confirmed via `git diff --name-only \| grep -E '\.py$\|SKILL\.md$'`, empty) |
| 3 | Automated check fails when a catalogue entry has an incomplete manifest | **FAIL (see Defect 1)** | The check is genuinely non-vacuous for 11 independently-proven field checks (see below) — but misses the *value* half of one required field: `shared_references.required` is checked to be *a* boolean, never that it is `true`. A live, reproduced mutation (`required: true` → `required: false` on `veo-3-1`, which structurally depends on the shared references per its own `entities.reads`) leaves the guard fully green. Restored byte-identical afterward |
| 4 | Installing one entry into a clean checkout, verified end to end | **PASS** | `install-catalogue-entry.docs-test.ts` installs into a real OS `mkdtemp` directory, genuinely outside the repo; independently reproduced that the test is non-vacuous (see below) — without the shared-reference copy it correctly fails with 18 dangling citations. By-hand transcript against a genuinely empty `/tmp` dir is present. **Not yet posted to issue #212** — outside both the `developer`'s and this `qa` agent's tool grants (both are `gh issue view`-only); flagging as an outstanding step for `/build-issue`/the Operator, not a code defect |

### Settled-scope items re-confirmed, undisturbed

- Shared reference folder / 129 links (#252) and `LICENSE` — both merged before this slice; not touched by this diff (confirmed via `git diff --name-only`, which shows only the 11 `metadata.yaml`/`references/README.md` pairs, the two new `src/claude-skills/` modules + their tests, `docs/catalogue-manifest-format.md`, `src/fs-boundary/allow-list.ts`, and the OpenSpec change itself — no `.claude/references/*.md`).
- Python (#255) — confirmed no `.py` file and no `SKILL.md` file appears anywhere in `git diff origin/main...HEAD --name-only`.
- Brand removal — re-ran the grep across all 11 Skill folders for `organicgrowth|straw.?motion|mundotip|unhypped|caxtontaylor|sandroblunt`: zero hits in every one, unchanged.

### Per-scenario results (`specs/skill-catalogue-manifest/spec.md`)

| Requirement / Scenario | Result | Note |
|---|---|---|
| Req 1 / "names every field..." | PASS | doc read in full |
| Req 1 / "records the shared-reference install decision..." | PASS | doc read in full |
| Req 2 / "every one of the 11 ... carries every new field" | PASS | numstat + live guard confirm |
| Req 2 / "no .py file or Python-invoking SKILL.md prose touched" | PASS | grep on full diff, empty |
| Req 3 / "the guard passes against the real, complete tree" | PASS | reproduced, 3/3 green, corpus floor ≥11 asserted and met |
| Req 3 / "the guard is proven non-vacuous — a hand-mutated missing field is caught..." | **PARTIAL / see Defect 1** | the 5 fields the Requirement's own Scenario text names (`licence`, `owner`, `target_model.fallbacks`, `entities.reads`, `shared_references.install`) are each genuinely proven, both by the developer's transcript and independently re-derived by qa below on different fields/Skills — but the sibling field `shared_references.required` inside the SAME block is not proven, because it cannot be: the guard doesn't check its value |
| Req 3 / "the guard's pure scanner is unit-tested with zero disk access" | PASS | confirmed zero `node:fs` in `manifest-completeness-scan.test.ts`; 33 tests, one per field's missing/invalid case — except, consistent with Defect 1, there is no test for `shared_references.required: false` (present, valid boolean, wrong value) |
| Req 4 / "installing veo-3-1 ... reproduces a citation-clean tree" | PASS | reproduced; proven non-vacuous independently (below) |
| Req 4 / "planInstall is pure and covers all three declared install strategies" | PASS | `install-catalogue-entry.test.ts`, 7 tests, zero disk I/O, all three strategies + malformed/missing cases |

### qa's own independent verification (beyond re-running what the developer already ran)

**1. `src/fs-boundary/allow-list.ts`'s new entry, scrutinised.** Exactly one new line:
`src/claude-skills/install-catalogue-entry.ts`, with a stated reason. Confirmed the module genuinely
needs `node:fs/promises` (`mkdir`, `readdir`, `readFile` for a generic recursive directory walk/copy) —
no existing store or port already provides this: `src/fs/safe-io.ts` (already allow-listed, and reused
here for the actual writes via `writeFileAtomic`) only exports `writeFileAtomic`/`readJsonFile`, neither
of which walks a directory; `src/media-backup/copy.ts` copies one file, not a tree;
`src/media-backup/produced-media-tree.ts` walks a different, domain-specific `ideas/` shape. The entry is
scoped to exactly the one file that needs it — no wildcard, no directory-level grant. `npx tsx --test
src/fs-boundary/node-fs-guard.test.ts` confirms the allow-list is EXACT (no new, un-audited violation;
no stale entry) — 1/1 pass. **Not a defect.**

**2. Reproduced the incomplete-manifest check failing, five times, on fields and Skills the developer's
own transcripts never used** (developer used `licence`/`owner`/`target_model.fallbacks`/`entities.reads`/
`shared_references.install`/`shared_references.path`, all on `veo-3-1`). qa independently mutated,
observed red naming the exact skill+field, restored, confirmed `md5` match and clean `git status`, then
re-ran green — for every one:

- `version` → `not-a-semver` on `kling-3-0/metadata.yaml` → `{"skillName":"kling-3-0","field":"version",...}`
- `entities.writes` removed on `nano-banana-2/metadata.yaml` → `{"skillName":"nano-banana-2","field":"entities.writes",...}`
- `tools[0].kind` removed on `chatgpt-image-2/metadata.yaml` → `{"skillName":"chatgpt-image-2","field":"tools[0].kind",...}`
- SKILL.md `description` shrunk to 18 chars on `seedream-4-5/SKILL.md` → `{"skillName":"seedream-4-5","field":"purpose","reason":"...18 characters, below the required minimum of 100"}`
- SKILL.md `name` mismatched on `happy-horse/SKILL.md` → `{"skillName":"happy-horse","field":"name","reason":"SKILL.md frontmatter name (gen-prompting-happy-horse-WRONG) does not match metadata.yaml name (gen-prompting-happy-horse)"}`

All five failed correctly, named the right file and field, restored byte-identical (`md5` matched every
time), and `git status --porcelain` was empty after every restore. Combined with the developer's own six
transcripts, **11 distinct field-level mutations have now been independently proven red→green** across 7
of the 11 real Skill folders.

**3. Is the check actually complete? Enumerated every field `docs/catalogue-manifest-format.md`'s own
"Required for completeness" list declares, against `manifest-completeness-scan.ts`'s code.** All ten
bullets in that list are checked in code — see Defect 1 for the one exception found, which is narrower
than "a whole field unchecked": the field IS checked (type: must be a boolean), but its *value* is not
(must additionally be `true`, per the openspec Requirement 2 text and per every real entry's actual
dependency on the shared references).

**4. Attempted to make the install-verification test pass vacuously — it does not.** Wrote a scratch
script (`copyDirectoryRecursive`-only, deliberately skipping the shared-reference copy, reproducing
exactly the bug this ticket's own brief worried about) against a fresh `mkdtemp` directory. Result: 18
citations found, **all 18 dangling** — the citation scanner correctly reports the incomplete install as
broken. This proves `install-catalogue-entry.docs-test.ts` is not vacuous: had the developer's
`copySharedReferences` logic been missing or buggy, the real test would have failed exactly like this.
Confirmed the real docs-test itself installs into a freshly `mkdtemp`'d OS temp directory (never a
subfolder of this repository) via `readdir(tmpRoot)` asserted `[]` before the install.

**5. Verified the `portable/` finding independently.** `find . -iname "portable*"` (this checkout) and
`git log --all --diff-filter=A -- '*portable*'` both return nothing. `git show origin/main:.claude/skills/veo-3-1/references/README.md`
confirms the false promise existed on `main` before this slice. The replacement text in all 11 files
names a real, decided, and now-tested mechanism (`copy-alongside`, backed by `install-catalogue-
entry.ts` + its docs-test) — not a second unfulfilled promise. One incidental finding along the way: the
OLD (now-replaced) `grok-imagine/references/README.md` text pointed at
`portable/image/grok-imagine-1-5/` — the WRONG sibling skill's name — an extra pre-existing bug this
slice's fix also incidentally corrects, not a new defect.

**6. Hermeticity / always-rules.** `grep -rniE "spaces_|creations_|magnific|apify"` across every new/
touched `src/claude-skills/*.ts` file and `docs/catalogue-manifest-format.md`: zero hits. `grep -rn
"ledger.json|queue.json|AssetStore|command-surface"` across the two new production modules: zero hits.
`git diff origin/main...HEAD -- package.json package-lock.json`: empty (no new runtime dependency). The
five content-pipeline always-rules (generate-never-publish, public-metrics-only, relative-not-absolute,
explicit-attribution, ledger-as-source-of-truth) are not implicated by this slice at all — it touches
only `.claude/skills/` catalogue packaging, unrelated to the weekly content loop. **All pass, trivially
and by evidence, not by assumption.**

### Defect list

**Defect 1 — MEDIUM — the manifest-completeness guard checks `shared_references.required`'s *type*, not
its *value*, so a regression to `required: false` on an entry that genuinely depends on the shared
references goes undetected.**

`manifest-completeness-scan.ts` (around the `shared_references.*` block) does:
```ts
const required = getIn(metadata, "shared_references.required");
if (typeof required !== "boolean") {
  fail("shared_references.required", `expected a boolean, found ${JSON.stringify(required)}`);
}
```
This accepts `false` as complete. But `docs/catalogue-manifest-format.md` states all 11 real entries
declare `required: true`, and the openspec spec.md's own Requirement 2 text says every entry SHALL
carry "`shared_references.required` **(true)**" — a specific value, not merely a boolean type. Every one
of the 11 entries' own `entities.reads` cites `../../references/*.md`, so `required: false` on any of
them would misstate a real, structural dependency, and the automated check — whose entire job, per the
issue's own AC, is to fail on an incomplete/incorrect manifest — would not catch it.

*Repro steps (independently re-verified, byte-identical restore confirmed):*
```
cp .claude/skills/veo-3-1/metadata.yaml /tmp/veo-3-1.metadata.yaml.bak
sed -i '' 's/^  required: true$/  required: false/' .claude/skills/veo-3-1/metadata.yaml
npx tsx --test src/claude-skills/reference-citation-guard.docs-test.ts
# → tests 3, pass 3, fail 0  (should be red; is green)
cp /tmp/veo-3-1.metadata.yaml.bak .claude/skills/veo-3-1/metadata.yaml   # restore
md5 .claude/skills/veo-3-1/metadata.yaml   # confirm matches 0b749dff95fe16077a89a8b1647f3c68
```

*Suggested fix (for the developer, not prescriptive):* require `required === true` explicitly (matching
what every real entry today already says and what spec.md's Requirement 2 already commits to), or — if a
future entry could legitimately declare `required: false` — cross-check the declared value against
whether that entry's own `entities.reads`/citations actually reference the shared path, so the field
can never silently misstate the entry's real dependency. Either way, add a seventh mutation-proof
transcript for this specific case (`required: true` → `false`) alongside the existing six, and a matching
unit test in `manifest-completeness-scan.test.ts` (the existing "catches a missing
shared_references.required" test only covers the field's absence, not a present-but-wrong value).

**Note (informational, not a defect) — "posted on this issue" is not yet done.** The issue's own final AC
reads "...and the result is posted on this issue." Neither the `developer` (per its own Known Limits) nor
this `qa` agent holds a `gh issue comment`-capable grant — both are `gh issue view`-only. The transcript
is fully captured and ready to paste verbatim in the Build Report above. Flagging for `/build-issue` or
the Operator to post before the issue is closed; this does not block a PASS on its own and is not counted
against the round.

### Overall

**FAIL — one MEDIUM defect** (Defect 1). Everything else verified independently and green: suite/build/
openspec numbers reproduced exactly; the 18/0 diff claim verified literally across all 11 files; the
`portable/` finding independently confirmed real (both the bug and the fix); the install-verification test
independently proven non-vacuous; the `fs-boundary` allow-list entry scoped correctly and genuinely
necessary; hermeticity and always-rules all clear; brand-removal and the Python/SKILL.md exclusions
re-confirmed undisturbed. The fix for Defect 1 is small and precisely scoped — expect a fast Round 2.

## Build Report — Round 2

### The defect, fixed

`checkManifestCompleteness`'s `shared_references.required` check accepted **any boolean**, so a real,
structural dependency (every one of the 11 entries' own `entities.reads` cites `../../references/*.md`)
could be mislabeled `required: false` and the guard stayed green. Fixed to require the literal value
`true`:

```ts
const required = getIn(metadata, "shared_references.required");
if (required !== true) {
  fail(
    "shared_references.required",
    `expected true (this entry's own entities.reads cites the shared references), found ${JSON.stringify(required)}`,
  );
}
```

Chose the literal-`true` fix over QA's alternative (cross-checking `required`'s value against whether
`entities.reads` actually cites the shared path) for two reasons: (1) it is exactly what
`openspec/.../specs/skill-catalogue-manifest/spec.md`'s own Requirement 2 already commits to —
`shared_references.required` **(true)** — so no spec-text change is needed either way (see "Spec
reconciliation" below); (2) a derived cross-check would itself need to define, and get right, what
"cites the shared path" means as a string match against `entities.reads`'s glob entries — a second,
separate parsing decision with its own edge cases, for a benefit (supporting a hypothetical future
`required: false` entry) no real entry needs today. `refuse-without`/`vendored` remain legitimate
`install` strategies for a future non-dependent entry; `required` itself simply isn't one of the fields
this ticket's own 11-entry scope needs to be conditional.

### The sweep — every required field, one at a time

Per the brief: "if someone set this to a wrong-but-well-typed value, would the checker notice?" Answered
for all 19 required-field checks in `manifest-completeness-scan.ts`:

| Field | What the checker asserts today | Presence / Type / Value | Tightened this round? |
|---|---|---|---|
| `name` (+ `SKILL.md` cross-check) | non-empty string; **equal** to `SKILL.md` frontmatter `name` | Value (equality) | No — already value-checked; **reconfirmed still catches a mismatch** after this round's code changes (transcript below, `grok-imagine`, not the `happy-horse` Skill QA used) |
| `version` | non-empty string; semver-shaped (`X.Y.Z...`) | Type/format only | **Left loose, deliberately** — no in-repo oracle for "the correct version" of an independently-versioned entry (unlike `licence`/`owner`, there's no `LICENSE`-file equivalent to check against) |
| `licence` | non-empty string; **equal** to the real `LICENSE` file's SPDX id | Value (cross-check) | No — already value-checked (Round 1 Mutation 1) |
| `owner` | non-empty string; **equal** to the real `LICENSE` file's copyright holder | Value (cross-check) | No — already value-checked (Round 1 Mutation 2) |
| `purpose` (`SKILL.md` `description`) | non-empty; ≥100 characters | Value (length proxy) | No — a length floor is the only automatable proxy for "substantial"; already proven (QA's `seedream-4-5` transcript) |
| `entities.reads` | non-empty array (≥1) | Presence/type (minLength) | **Left loose, deliberately** — verifying a specific cited path actually resolves is the sibling dangling-citation guard's job (#252), which already resolves every `(../)+references/...` entry in this same field's content against real files (confirmed: the `../../references/*.md` entry IS matched and resolved by that guard's regex); duplicating that resolution here would be the second guard the issue's own brief forbids |
| `entities.writes` | present array (may be empty) | Presence/type | **Left loose, deliberately** — no oracle beyond "every real entry today writes nothing"; there's nothing to cross-check an empty array against |
| `tools` (array) | present array | Presence/type | Left loose (the array itself; per-item fields below are tightened) |
| `tools[].name` | non-empty string | Type only | **Left loose, deliberately** — no closed set; a future entry's script could need a different runtime this repo can't enumerate in advance |
| `tools[].kind` | non-empty string | Type only *(was)* | **TIGHTENED** — now a closed enum (`runtime-interpreter` only, the sole value any real entry uses); an unrecognised-but-well-typed `kind` now fails (transcript below, `kling-3-0-omni`, distinct from QA's `chatgpt-image-2` missing-`kind` case) |
| `target_model.vendor` | non-empty string | Type only | **Left loose, deliberately** — 6 distinct real vendors (openai/xai/alibaba/kuaishou/google/bytedance), free-text, no in-repo vendor catalogue to check against |
| `target_model.model_id`/`model` | at least one non-empty | Presence | **Left loose, deliberately** — same reasoning as vendor; no external model catalogue in this repo |
| `target_model.modalities` | non-empty array (≥1) | Presence/type (minLength) | **Left loose, deliberately** — 20+ distinct free-text modality names across 11 real entries (measured this round); no fixed vocabulary exists to enumerate against without risking blocking a legitimate future model capability |
| `target_model.fallbacks` | present array (may be empty) | Presence/type | **Left loose, deliberately** — every real entry declares `[]`; no fallback-entry shape has been decided yet (a Producer/Recipe-level decision per `docs/adr/0003`/`0007`, not this Skill layer's), so there is nothing yet to value-check |
| `inputs` | non-empty array (≥1) | Presence/type (minLength) | **Left loose, deliberately** — per-item shape (name/type/required well-formedness) is a separate, larger config-validation question the doc's own field list never promised to cover |
| `outputs` | non-empty array (≥1) | Presence/type (minLength) | Same as `inputs` |
| `evals` | non-empty array (≥1); each item's `path` non-empty | Presence + partial value *(was)* | **TIGHTENED** — each `evals[].path` must now also **equal one of this same entry's own `scripts[].path` values**, per the doc's own claim ("evals ... points at an existing scripts: test entry") which the code never actually enforced; a well-typed but nonexistent-script path now fails (transcript below, `seedance-2-0`) |
| `shared_references.path` | non-empty string | Type only | **Left loose, deliberately** — again the sibling dangling-citation guard's job (#252): it resolves this exact field's value against the real `.claude/references/` folder already (proven in Round 1's Mutation 6 transcript — the citation guard fires, not this one, and the two stay properly distinct) |
| `shared_references.required` | *a* boolean *(was)* | Type only *(was)* | **TIGHTENED — the defect fix.** Must now equal literal `true` (transcript below, `grok-imagine-1-5`, distinct from QA's `veo-3-1` repro) |
| `shared_references.install` | non-empty string; one of `copy-alongside`/`vendored`/`refuse-without` | Value (closed enum) | No — already value-checked (Round 1 Mutation 5; QA independently re-verified the enum boundary) |

**Net: 3 fields tightened this round** (`shared_references.required`, `tools[].kind`, `evals[].path`);
**11 left loose, each with a stated reason** (`version`, `entities.reads`, `entities.writes`,
`tools[].name`, `target_model.vendor`, `target_model.model_id`/`model`, `target_model.modalities`,
`target_model.fallbacks`, `inputs`, `outputs`, `shared_references.path`); **5 already value-checked and
unaffected** (`name`, `licence`, `owner`, `purpose`, `shared_references.install`). Every "left loose" row
above states why no oracle exists in this repository to check that field's value against, not merely
that it was skipped.

### Spec reconciliation

`openspec/.../specs/skill-catalogue-manifest/spec.md`'s Requirement 2 already reads
`shared_references.required` **(`true`)** — that text was already correct; the code disagreed with it,
not the spec. **No spec-text change made or needed.** `docs/catalogue-manifest-format.md`'s own field
list previously said `shared_references.required (boolean)`, which understated its own spec — updated to
`(must equal true ...)`, plus a new "deliberately left loose" section documenting the sweep's 11 loose
fields and their reasons (so a future reader sees the same reasoning captured here, not just in this
handoff).

### Fix + tests

- `src/claude-skills/manifest-completeness-scan.ts`: `shared_references.required` tightened to
  `required !== true`; `tools[].kind` tightened to a new closed-enum check (`ALLOWED_TOOL_KINDS`, today
  `{"runtime-interpreter"}`); `evals[].path` tightened to cross-check membership in this same entry's own
  `scripts[].path` values (`declaredScriptPaths`, built from the already-parsed `metadata["scripts"]`).
  Every failure message still names the file (via `skillName`) and the specific field
  (`shared_references.required`, `tools[N].kind`, `evals[N].path`), unchanged in shape from Round 1.
- `src/claude-skills/manifest-completeness-scan.test.ts`: three new pure, in-memory unit tests — one per
  tightened field — plus one fixture fix: `COMPLETE_METADATA_YAML`'s `scripts:` list was missing its
  `scripts/test_build_prompt.py` entry (present in every real entry, and in the fixture's own `tools[].
  required_for` and `evals[0].path`, but never declared under `scripts:` itself) — a latent fixture bug
  the new `evals[].path` cross-check surfaced immediately (the "complete" fixture briefly failed its own
  "returns [] for a fully complete manifest" test until this was fixed). All 36 unit tests pass (33 → 36,
  +3 new).
- `docs/catalogue-manifest-format.md`: field-list bullets updated for `tools`, `evals`, and
  `shared_references.required` to state the new value checks; new "deliberately left loose" section added
  (the sweep table above, in prose, for the doc's own permanent record).

No `.claude/skills/*/metadata.yaml` or `*/SKILL.md` file needed changing — all 11 real entries already
satisfy every tightened check (`shared_references.required: true`, `tools[0].kind: runtime-interpreter`,
`evals[0].path: scripts/test_build_prompt.py` matching a real `scripts:` entry — confirmed by grep across
all 11 files before writing the fix, and by the real-tree guard staying green after).

### Red→green transcripts — four mutations, on Skills untouched by Round 1 and by QA

Round 1 used `licence`/`owner`/`target_model.fallbacks`/`entities.reads`/`shared_references.install`/
`shared_references.path`, all on `veo-3-1`. QA used `version` (`kling-3-0`), `entities.writes`
(`nano-banana-2`), `tools[0].kind`-missing (`chatgpt-image-2`), `purpose` (`seedream-4-5`), name-mismatch
(`happy-horse`). This round's four transcripts cover new fields/values on five different, previously
untouched Skills (`grok-imagine-1-5`, `seedance-2-0`, `kling-3-0-omni`, `grok-imagine`).

**Mutation 1 (the defect) — `grok-imagine-1-5`'s `shared_references.required: true` → `false`:**
```
$ md5 .claude/skills/grok-imagine-1-5/metadata.yaml
MD5 (...) = 2765aa7cc44d2051f170cbcd003ab471
$ sed -i '' 's/^  required: true$/  required: false/' .claude/skills/grok-imagine-1-5/metadata.yaml
$ npx tsx --test src/claude-skills/reference-citation-guard.docs-test.ts
not ok 2 - catalogue entry manifest completeness (issue #212)
  error: Incomplete catalogue-entry manifest field(s) found: [
    { "skillName": "grok-imagine-1-5", "field": "shared_references.required",
      "reason": "expected true (this entry's own entities.reads cites the shared references), found false" }
  ]
$ cp <backup> .claude/skills/grok-imagine-1-5/metadata.yaml
$ md5 .claude/skills/grok-imagine-1-5/metadata.yaml   # 2765aa7c... — byte-identical
$ git status --porcelain -- .claude/skills/grok-imagine-1-5/metadata.yaml   # empty
$ npx tsx --test src/claude-skills/reference-citation-guard.docs-test.ts
# tests 3, pass 3, fail 0
```

**Mutation 2 (new tightening) — `seedance-2-0`'s `evals[0].path` repointed at a script it never
declares:**
```
$ md5 .claude/skills/seedance-2-0/metadata.yaml
MD5 (...) = 649fe6db2bddbdd749858b8322b3663b
$ perl -0pi -e 's/evals:\n  - path: scripts\/test_build_prompt\.py/evals:\n  - path: scripts\/does-not-exist.py/' \
    .claude/skills/seedance-2-0/metadata.yaml
$ npx tsx --test src/claude-skills/reference-citation-guard.docs-test.ts
not ok 2 ... error: Incomplete catalogue-entry manifest field(s) found: [
    { "skillName": "seedance-2-0", "field": "evals[0].path",
      "reason": "expected a path present in this entry's own scripts: list, found \"scripts/does-not-exist.py\"
        (scripts: [\"scripts/build-prompt.py\",\"scripts/test_build_prompt.py\"])" }
  ]
$ cp <backup> ...   # restore; md5 649fe6db... matched; git status empty; re-run: pass 3, fail 0
```
(First attempt used a plain `sed` without multi-line context and accidentally rewrote the SAME literal
line inside `scripts:` too, since `scripts/test_build_prompt.py` appears twice in the file — the mutation
was silently vacuous the first time, `sed` doesn't fail loudly on a wrong-target match. Caught by
re-reading the file with `grep -n "path: scripts"` before trusting the run, not by the test output alone;
switched to a `perl -0777` multi-line-anchored replace scoped to the `evals:` block specifically, which
mutates only the intended line — the second attempt is the one pasted above.)

**Mutation 3 (new tightening) — `kling-3-0-omni`'s `tools[0].kind: runtime-interpreter` → `cli-tool`
(present, well-typed, wrong — the same defect shape as Mutation 1, on a different field):**
```
$ md5 .claude/skills/kling-3-0-omni/metadata.yaml
MD5 (...) = 3853ff1907baa390c7261b4c8262e28e
$ sed -i '' 's/^    kind: runtime-interpreter$/    kind: cli-tool/' .claude/skills/kling-3-0-omni/metadata.yaml
$ npx tsx --test src/claude-skills/reference-citation-guard.docs-test.ts
not ok 2 ... error: Incomplete catalogue-entry manifest field(s) found: [
    { "skillName": "kling-3-0-omni", "field": "tools[0].kind",
      "reason": "expected one of [\"runtime-interpreter\"], found \"cli-tool\"" }
  ]
$ cp <backup> ...   # restore; md5 3853ff19... matched; git status empty; re-run: pass 3, fail 0
```

**Mutation 4 (reconfirmation, not a new tightening) — `grok-imagine`'s `SKILL.md` name mismatched, to
confirm the pre-existing name-consistency check still holds after this round's code edits, on a Skill
neither Round 1 nor QA used (QA used `happy-horse`):**
```
$ md5 .claude/skills/grok-imagine/SKILL.md
MD5 (...) = 63a6aa6cefbd0e96ccf53ad5a1551cd8
$ sed -i '' 's/^name: gen-prompting-grok-imagine$/name: gen-prompting-grok-imagine-WRONG/' .claude/skills/grok-imagine/SKILL.md
$ npx tsx --test src/claude-skills/reference-citation-guard.docs-test.ts
not ok 2 ... error: Incomplete catalogue-entry manifest field(s) found: [
    { "skillName": "grok-imagine", "field": "name",
      "reason": "SKILL.md frontmatter name (gen-prompting-grok-imagine-WRONG) does not match metadata.yaml name (gen-prompting-grok-imagine)" }
  ]
$ cp <backup> ...   # restore; md5 63a6aa6c... matched; git status empty; re-run: pass 3, fail 0
```

**Final state, confirmed clean:**
```
$ git status --porcelain
 M docs/catalogue-manifest-format.md
 M openspec/changes/issue-212-catalogue-manifests/handoff.md
 M src/claude-skills/manifest-completeness-scan.test.ts
 M src/claude-skills/manifest-completeness-scan.ts
```
No `.claude/skills/**` file appears — every one of the four mutations above was restored byte-identical
before this line was run.

### Suite numbers (Round 2)

| Command | Round 1 | Round 2 | Delta |
|---|---|---|---|
| `npm test` | 3529 tests / 923 suites / 0 fail | **3532 tests / 923 suites / 0 fail** | +3 tests (the three new tightening unit tests), 0 new suites |
| `npm run test:docs` | 351 tests / 94 suites / 0 fail | **351 tests / 94 suites / 0 fail** | unchanged — no new docs-test files or blocks this round |
| `npm run build` | clean | **clean** | — |
| `openspec validate issue-212-catalogue-manifests --strict` | valid | **valid** | — |
| `openspec validate --all --strict` | 67 passed, 0 failed | **67 passed, 0 failed** | — |

### Files touched (Round 2)

**Modified:**
- `src/claude-skills/manifest-completeness-scan.ts` — the fix (3 fields tightened)
- `src/claude-skills/manifest-completeness-scan.test.ts` — 3 new unit tests + 1 fixture fix
- `docs/catalogue-manifest-format.md` — field-list wording + new "deliberately left loose" section
- `openspec/changes/issue-212-catalogue-manifests/handoff.md` — this block

**Untouched:** every `.claude/skills/**` file (all 11 real entries already satisfy every tightened check);
`src/claude-skills/install-catalogue-entry.ts` and its tests (Requirement 4, unaffected by this defect);
`src/claude-skills/reference-citation-scan.ts` / `reference-citation-guard.docs-test.ts`'s dangling-
citation `describe` block (the #252 guard itself, unaffected — only the manifest-completeness `describe`
block's underlying pure module changed); `openspec/.../specs/skill-catalogue-manifest/spec.md` (already
correct — see "Spec reconciliation" above).

### Known limits (Round 2)

- The 11 "deliberately left loose" fields in the sweep table stay loose — each has a stated reason (no
  in-repo oracle, or the sibling dangling-citation guard already covers path-resolution correctness for
  the two `shared_references`/`entities.reads` path fields). None was "not considered" — every one is
  answered in the table above.
- `entities.reads`'s **content** (as opposed to non-emptiness) is not independently verified by this
  guard — it is coincidentally covered by the citation guard's regex for the `../../references/*.md`
  entry specifically (confirmed: that guard's pattern matches and resolves it), but not for the local
  `references/*.md` entry (a glob, not a literal path — nothing resolves globs). Semantically verifying
  that `entities.reads` fully and correctly enumerates what a Skill's prose actually cites is a larger
  design question (would need glob-matching against extracted citations) not undertaken this round.
- `tools[].name`, `target_model.vendor`/`model_id`/`model`/`modalities`, and `target_model.fallbacks`'s
  content remain open, free-text fields by deliberate choice — closing them further would require
  inventing a fixed vocabulary this repository doesn't otherwise maintain (a real design decision, not a
  quick tightening, and out of this defect-fix round's scope).

Ready for qa — Round 2.
