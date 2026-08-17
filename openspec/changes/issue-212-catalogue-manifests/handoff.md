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
