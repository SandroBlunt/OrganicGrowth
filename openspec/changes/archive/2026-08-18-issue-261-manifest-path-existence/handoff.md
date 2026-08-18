# Slice Handoff — issue #261: the manifest guard never checks that a declared path exists

Bidirectional channel between `developer` and `qa` for this slice. Nothing in this document is ever
overwritten — retries append `Round-N Build` blocks; `qa` appends its own `QA Verdict` section.

## Build Report (Round 1)

### What changed

`src/claude-skills/manifest-completeness-scan.ts`'s completeness check previously cross-checked each
catalogue entry's `evals[].path` against that entry's own declared `scripts[].path` set, but never
checked that either path actually resolves to a real file on disk — a script renamed or deleted, with its
eval still citing the same dead name, stayed invisible because the two were consistent WITH EACH OTHER.

This change adds an OPTIONAL `pathExists(skillName, declaredPath) => boolean` predicate to
`ManifestCheckOptions`. The scanner module stays pure (never touches disk itself); when a caller supplies
`pathExists`, every declared `scripts[].path`, `evals[].path`, `references[].path`, and
`shared_references.path` is checked against it, IN ADDITION TO (never instead of) the pre-existing
evals-cites-a-declared-script consistency check, which is unchanged. `scripts[].path` also gained a shape
check (non-empty string) it never had, because an empty path would otherwise resolve vacuously to the
entry's own directory (which always exists), silently defeating the new check. The real guard
(`reference-citation-guard.docs-test.ts`) now wires a real `pathExists` backed by `existsSync`, resolved
against each entry's own real `.claude/skills/<entry>/` directory.

Two additional path-shaped fields were investigated and brought into scope beyond the issue's explicit
`scripts[].path` / `evals[].path` ask:

- **`references[].path`** — no other guard watches it (the dangling-reference-citation guard's regex only
  matches a CLIMBING `(../)+.../references/...` citation; a same-directory `references/<name>.md` value
  never matches).
- **`shared_references.path`** — the issue asked this field's claimed "sibling guard" coverage be
  confirmed, not assumed. Confirmed live, with a genuine finding: the sibling dangling-reference-citation
  guard catches a value corrupted to the wrong climb depth or with a bogus intervening segment, but
  CANNOT catch a value whose literal `references` folder-name segment is itself mistyped/renamed, because
  the value then no longer matches the citation shape the guard's regex recognises at all — a real gap in
  the seam between two individually-correct guards (issues #235, #238's own documented failure mode).
  Closed by adding a direct existence check for this field too, layered on top of the sibling guard.

Deliberately left uncovered, with reasons recorded in `docs/catalogue-manifest-format.md`:
`tools[].required_for` (every real entry declares `tools: []` today per #255 — no live data, and the
field has no shape validation of its own), `entities.reads`/`entities.writes` (glob-shaped, not a single
literal path — already covered for any literal citation by the sibling guard's corpus-wide scan),
`domain_path` (a categorisation label, not a filesystem path), `source_tracking`'s URLs (external, not a
repo path).

### Files touched

- `src/claude-skills/manifest-completeness-scan.ts` — new optional `ManifestCheckOptions.pathExists`;
  existence checks for `scripts[].path`, `evals[].path`, `references[].path`, `shared_references.path`;
  new shape check for `scripts[].path`.
- `src/claude-skills/manifest-completeness-scan.test.ts` — 7 new pure, in-memory tests.
- `src/claude-skills/reference-citation-guard.docs-test.ts` — wires a real `pathExists` (backed by
  `existsSync`) into the manifest-completeness `describe` block; doc-comment updated.
- `docs/catalogue-manifest-format.md` — new "Path-shaped fields: existence, not just consistency"
  section; updated the "Required for completeness" and "deliberately left" lists so they no longer
  contradict it.
- `openspec/changes/issue-261-manifest-path-existence/` — `proposal.md`, `tasks.md`,
  `specs/skill-catalogue-manifest/spec.md` (one MODIFIED Requirement, one ADDED Requirement), this
  `handoff.md`.

`.claude/skills/` itself is untouched in the final diff — every real manifest was only hand-mutated and
restored (byte-identically, confirmed via `git status`/`git diff`) during the live proofs below, never
left modified.

### How to run

```
cd /Users/CaxtonTaylor/Developer/OrganicGrowth
npx tsc -p tsconfig.json --noEmit          # type-check only
npm test                                    # type-check + full suite (includes *.docs-test.ts)
npm run test:docs                           # the *.docs-test.ts suite alone (what the live proofs used)
node --import tsx --test src/claude-skills/manifest-completeness-scan.test.ts   # this slice's pure unit tests alone
openspec validate issue-261-manifest-path-existence --strict
```

Full suite result at handoff time: **4028/4028 passing, 0 failed** (baseline on `main` before this change:
4021 — the +7 delta is exactly this slice's own new tests, confirmed by running the suite before and
after). `npx tsc -p tsconfig.json --noEmit` is clean. `openspec validate --all --strict` reports
72/72 passed (all specs + changes, including this one).

### Acceptance-criteria self-assessment

| Issue #261 acceptance criterion | Proof |
|---|---|
| The completeness check verifies every declared `scripts[].path` and `evals[].path` resolves to a real file on disk, IN ADDITION TO the existing consistency check | `manifest-completeness-scan.ts` §`scripts`/`evals` blocks, wired via `checkPathExists`; unit-proven by `manifest-completeness-scan.test.ts`'s "catches a scripts[].path that does not resolve on disk..." and "catches an evals[].path that does not resolve on disk, even though it passes the existing scripts: consistency check" tests; live-proven in Transcripts 1 and 2 below |
| The existing consistency check is not weakened or removed | `manifest-completeness-scan.test.ts`'s "keeps the existing evals-cites-a-declared-script consistency check independent of existence..." test (forces `pathExists` to always return `true`, still fails on a path that resolves but names no real `scripts:` entry); the pre-#261 test "catches an evals path that names no real scripts: entry" (issue #212 Round 2 test) is untouched and still passes |
| Decide whether other path-shaped fields deserve the same treatment, and say which were covered and which weren't, with reasons | `proposal.md` §2 and `docs/catalogue-manifest-format.md`'s new "Path-shaped fields" section — `references[].path` and `shared_references.path` covered; `tools[].required_for`, `entities.reads`/`writes`, `domain_path`, `source_tracking` URLs deliberately not, each with a reason |
| `shared_references.path`'s claimed sibling-guard coverage is confirmed, not assumed | Transcripts 4 and 5 below — the sibling guard WAS confirmed to catch a wrong-depth corruption, and WAS confirmed NOT to catch a renamed-segment corruption; the finding is recorded in `docs/catalogue-manifest-format.md` and closed by adding a direct check (Transcript 6, and the "shared_references.path gains its own direct existence check..." unit test) |
| Prove the check fails: point a manifest at a nonexistent file, watch the guard go red naming the entry and field, restore byte-identically, confirm a clean tree — separately for `scripts[].path` and `evals[].path` | Transcripts 1 and 2 below (two different real entries, two different corruption shapes) |
| Keep the existing consistency check — both are needed | Same test/transcript evidence as row 2 above, plus `manifest-completeness-scan.ts`'s doc comments explaining why both remain |

### Fakes / fixtures used

- **Pure, in-memory fixtures only** in `manifest-completeness-scan.test.ts` — no disk access, no
  `node:fs` import in that file (unchanged discipline from #212).
- **No Magnific fake needed and none used.** This slice is entirely `.claude/skills/` filesystem/manifest
  work — no Space, no `spaces_*`/`creations_*` call, no credits, no board mutation anywhere in the diff or
  in any test. The `magnific` MCP tools were never invoked (not given to this agent, and not needed for
  this slice).
- **Live proof methodology (not a fake):** the real, already-shipped 11-entry `.claude/skills/` corpus was
  hand-mutated, one field at a time, on a real file, then restored byte-identically and confirmed via
  `git status`/`git diff` returning empty before moving to the next mutation. This mirrors the existing
  convention this repository already uses for `reference-citation-guard.docs-test.ts` (see e.g. #252's own
  Round 2 transcript in that file's own doc comment).

### Live "prove the check fails" transcripts

All five mutations below were run sequentially against a starting-clean tree (`git status --short` showed
no `.claude/skills/` changes before Transcript 1, and none after Transcript 5's restore).

**Transcript 1 — `scripts[].path`, `.claude/skills/veo-3-1/metadata.yaml`.**
Mutated `scripts[0].path` from `scripts/build-prompt.ts` to `scripts/build-prompt-renamed-nonce.ts`
(leaving `scripts[1].path` and the `evals[0].path` that cites it untouched). `npm run test:docs`:

```
not ok 1 - every catalogue entry ... carries a complete manifest
  error: |-
    Incomplete catalogue-entry manifest field(s) found: [
      {
        "skillName": "veo-3-1",
        "field": "scripts[0].path",
        "reason": "declared but no file exists at \"scripts/build-prompt-renamed-nonce.ts\" (resolved relative to this entry's own directory)"
      }
    ]. ...
```

Restored byte-identically (`cp` from a saved copy); `git diff .claude/skills/veo-3-1/metadata.yaml`
empty; re-ran `npm run test:docs` — `ok 1 - every catalogue entry ... carries a complete manifest`.

**Transcript 2 — `evals[].path`, `.claude/skills/chatgpt-image-2/metadata.yaml` (a different entry,
proving the two proofs are independent).** Mutated BOTH `scripts[1].path` and the `evals[0].path` that
cites it from `scripts/build-prompt.test.ts` to the SAME new name,
`scripts/build-prompt-test-renamed-nonce.ts` — reproducing a script "renamed" with its eval left pointing
at the dead name (internally consistent, existence-blind — the exact shape #255's near-miss could have
produced). `npm run test:docs`:

```
not ok 1 - every catalogue entry ... carries a complete manifest
  error: |-
    Incomplete catalogue-entry manifest field(s) found: [
      {
        "skillName": "chatgpt-image-2",
        "field": "evals[0].path",
        "reason": "declared but no file exists at \"scripts/build-prompt-test-renamed-nonce.ts\" (resolved relative to this entry's own directory)"
      },
      {
        "skillName": "chatgpt-image-2",
        "field": "scripts[1].path",
        "reason": "declared but no file exists at \"scripts/build-prompt-test-renamed-nonce.ts\" (resolved relative to this entry's own directory)"
      }
    ]. ...
```

Both fields named, for existence — NOT for the old consistency check (they remained mutually consistent
throughout, which is exactly the point: consistency alone would have stayed silent). Restored
byte-identically; `git diff` empty; re-ran — green.

**Transcript 3 — `references[].path`, `.claude/skills/grok-imagine/metadata.yaml` (my own decided-in-scope
addition, proven the same way).** Mutated `references[0].path` from `references/translation-notes.md` to
`references/translation-notes-renamed-nonce.md`. `npm run test:docs`:

```
not ok 1 - every catalogue entry ... carries a complete manifest
  error: |-
    Incomplete catalogue-entry manifest field(s) found: [
      {
        "skillName": "grok-imagine",
        "field": "references[0].path",
        "reason": "declared but no file exists at \"references/translation-notes-renamed-nonce.md\" (resolved relative to this entry's own directory)"
      }
    ]. ...
```

Restored byte-identically; `git diff` empty; re-ran — green.

**Transcript 4 — confirming the sibling guard's `shared_references.path` coverage, wrong-depth case,
`.claude/skills/veo-3-1/metadata.yaml`.** Mutated `shared_references.path` from `../../references/` to
`../../references-nonce-parent/references/` (an inserted bogus segment — the citation SHAPE still
matches, but resolves nowhere). `npm run test:docs`:

```
not ok 1 - every (../)+(<segment>/)*references/(<name>.md)? citation ... resolves to a real file or folder
  error: |-
    Dangling reference citation(s) found: [
      {
        "citingFile": ".claude/skills/veo-3-1/metadata.yaml",
        "rawPath": "../../references-nonce-parent/references/",
        "resolvedPath": ".claude/references-nonce-parent/references"
      }
    ]. ...
```

This is the EXISTING #252 dangling-reference-citation guard (not the completeness guard, which stayed
green throughout this mutation) — confirming its coverage for this corruption shape, live. Restored;
`git diff` empty; re-ran — both `describe` blocks green.

**Transcript 5 — the sibling guard's gap: renaming the literal `references` segment itself, same file.**
Mutated `shared_references.path` from `../../references/` to `../../references-does-not-exist-nonce/`
(the `references` FOLDER NAME itself is now a different string — no longer literally `references`).
`npm run test:docs`: **both `describe` blocks reported green** — the dangling-reference-citation guard's
regex requires the literal `references/` segment to even recognise a citation, so a value that drops that
exact segment name is invisible to it; and at the time of this transcript (before Transcript 6's fix), the
completeness guard did not check this field's existence either. This is the confirmed gap. Restored;
`git diff` empty.

**Transcript 6 — after adding the direct `shared_references.path` existence check, re-running Transcript
5's exact mutation.** Same mutation as Transcript 5 (`../../references-does-not-exist-nonce/`).
`npm run test:docs`:

```
not ok 1 - every catalogue entry ... carries a complete manifest
  error: |-
    Incomplete catalogue-entry manifest field(s) found: [
      {
        "skillName": "veo-3-1",
        "field": "shared_references.path",
        "reason": "declared but no file exists at \"../../references-does-not-exist-nonce/\" (resolved relative to this entry's own directory)"
      }
    ]. ...
```

Now caught, by the completeness guard directly. Restored byte-identically; `git diff` empty; re-ran —
green. Final `git status --short` after all six mutations/restores: only the four intentionally-changed
source files listed above, `.claude/skills/` completely clean.

### Self-review notes

- Removed a first, clumsy draft of the "consistency check stays independent" test that used fragile
  multi-step string surgery on the fixture YAML and left a dead, unused `void`-cast variable; replaced
  with a single, direct string substitution before running any test.
- Confirmed the new `checkPathExists` local helper is used identically by all four fields
  (`scripts`/`evals`/`references`/`shared_references`), avoiding four near-duplicate inline checks.
- Confirmed `scripts[].path`'s new non-empty-string shape check was necessary, not just tidy: without it,
  an empty declared path resolves (via `join`) to the entry's own directory itself, which always exists —
  a vacuous pass that would have silently defeated the whole new existence check for that one malformed
  case.
- Re-read every doc comment added for accuracy after the design evolved mid-build (the
  `shared_references.path` decision changed from "confirm sibling coverage only" to "confirm AND close a
  found gap" once live testing showed the sibling guard's coverage was partial) — updated both the module
  doc comment and the guard's doc comment to match the final, shipped behavior rather than the earlier
  plan.
- Confirmed every acceptance criterion in the issue maps to a specific test AND a specific live transcript
  (table above) — the issue's own "prove it" bar is not satisfied by unit tests alone, and this build
  does both.

### Known limits

- The new checks are opt-in via `ManifestCheckOptions.pathExists` — a caller of
  `checkManifestCompleteness`/`findIncompleteManifests` that does not supply it (any test, or a
  hypothetical future caller) gets none of the new coverage. This is deliberate (keeps the scanner pure,
  matches `reference-citation-scan.ts`'s own established pattern) but means the guarantee is only as good
  as the one real caller (`reference-citation-guard.docs-test.ts`) continuing to supply it.
- `tools[].required_for` is left without any check (shape or existence) because every real entry's
  `tools` array is empty today (#255). If a future entry legitimately populates `tools`/`required_for`
  again, this field should be revisited — flagged in `docs/catalogue-manifest-format.md`, not silently
  dropped.
- The existence check resolves a declared path relative to the catalogue entry's own directory only
  (`.claude/skills/<skillName>/<declaredPath>`) — this matches every real field's documented semantics
  (`scripts[].path`, `evals[].path`, `references[].path` are entry-relative; `shared_references.path` is
  entry-relative by definition, e.g. `../../references/`), but a hypothetical future path-shaped field
  with different resolution semantics (e.g. repo-root-relative) would need its own resolution logic in the
  caller, not a reuse of this exact `pathExists` predicate as-is.

## QA Verdict — Round 1: PASS

### Suite result

- `npx tsc -p tsconfig.json --noEmit` — clean (also runs as the first step of `npm test`).
- `npm test` (`tsc -p tsconfig.json --noEmit && node --import tsx --test "src/**/*.test.ts"
  "src/**/*.docs-test.ts" ".claude/skills/**/*.test.ts"`) — **4028/4028 passing, 0 failed, 0 skipped**.
  Matches the Build Report's claimed count exactly, and matches the claimed main-branch baseline of 4021
  (+7 new tests, exactly this slice's own new `manifest-completeness-scan.test.ts` tests).
- `npm run test:docs` (`node --import tsx --test "src/**/*.docs-test.ts"`) — **351/351 passing, 0 failed**.
- `openspec validate issue-261-manifest-path-existence --strict` — `Change 'issue-261-manifest-path-existence' is valid`, exit 0.
- `openspec validate --all --strict` — **72/72 passed, 0 failed**, including `spec/skill-catalogue-manifest`.
- All commands above run for real, from the actual working tree on branch `issue-261-manifest-path-existence`, with no code edits made by QA at any point (see the "Independent spot-check" section below for the one filesystem mutate/restore cycle QA ran itself, fully reverted, `git status` confirmed clean before and after).

### Per-criterion results (issue #261 acceptance criteria)

| # | Criterion (verbatim from issue) | Result | Evidence |
|---|---|---|---|
| 1 | The completeness check verifies every declared `scripts[].path` and `evals[].path` resolves to a real file, in addition to the existing consistency check | **PASS** | `manifest-completeness-scan.ts`'s `checkPathExists` wired into both the `scripts` and `evals` blocks; unit tests "catches a scripts[].path that does not resolve..." and "catches an evals[].path that does not resolve..., even though it passes the existing scripts: consistency check" both pass (`node --import tsx --test src/claude-skills/manifest-completeness-scan.test.ts` — 43/43 green, includes both). QA independently reproduced a live scripts[].path failure (see spot-check below), matching the Build Report's Transcript 1 verbatim (same skill, same error shape). |
| 2 | Decide whether other path-shaped fields deserve the same treatment; say which were covered and which weren't, with reasons | **PASS** | `proposal.md` §2 and `docs/catalogue-manifest-format.md`'s new "Path-shaped fields" section name `references[].path` and `shared_references.path` as covered (with reasons), and `tools[].required_for`, `entities.reads`/`writes`, `domain_path`, `source_tracking` URLs as deliberately not (with reasons). Reasoning independently checked: `entities.reads`/`writes` genuinely are glob-shaped (`references/*.md`) in the real fixture and real corpus — correct to exclude from a literal `existsSync` check; `tools[].required_for` genuinely is empty (`tools: []`) in every real `.claude/skills/*/metadata.yaml` sampled — correct that there is no live data; `domain_path` and `source_tracking` URLs are not filesystem paths — correct. The reasoning holds. |
| 3 | `shared_references.path`'s claimed sibling-guard coverage confirmed, not assumed | **PASS** | Handoff Transcripts 4–6 show a genuine confirm-then-close sequence: wrong-depth corruption caught by the *sibling* dangling-citation guard (Transcript 4), a renamed-segment corruption NOT caught by that same sibling guard (Transcript 5, both `describe` blocks reported green), then caught once the new direct check was added (Transcript 6). This is a real, non-trivial finding (a genuine gap in the seam between two individually-correct guards, exactly the class the issue warned about, #235/#238) — not a rubber-stamp "confirmed." Code inspection of `reference-citation-scan.ts`'s regex (`(../)+(<segment>/)*references/(<name>.md)?`) independently corroborates why a renamed `references` segment would not match — the regex requires the literal string `references/`. |
| 4 | Keep the existing consistency check — both are needed | **PASS** | `manifest-completeness-scan.ts`'s evals block still builds `declaredScriptPaths` and still fails `evals[N].path` when it "expected a path present in this entry's own scripts: list" — logic unchanged, only relocated above the new `scripts` block for the `declaredScriptPaths` set to exist first. The pre-existing #212-Round-2 test ("catches an evals path that names no real scripts: entry", line 288) is untouched and still passes. A new test ("keeps the existing evals-cites-a-declared-script consistency check independent of existence...", line 382) forces `pathExists: () => true` and still gets a consistency-check failure — proving the two checks are genuinely independent, not one masking the other. |
| 5 | Prove the check fails, separately for `scripts[].path` and `evals[].path`, red→restore→green, clean tree | **PASS** | Handoff Transcripts 1 and 2 show this on two different real entries (`veo-3-1`, `chatgpt-image-2`). QA independently reproduced Transcript 1's exact scenario live (see below) — real red, real restore, real green, confirmed clean `git status` both before and after. Not fabricated. |

### Per-scenario results (spec deltas, `openspec/changes/issue-261-manifest-path-existence/specs/skill-catalogue-manifest/spec.md`)

| Scenario | Result | Covering test/evidence |
|---|---|---|
| MODIFIED: the guard passes against the real, complete tree | PASS | `reference-citation-guard.docs-test.ts` run standalone — "catalogue entry manifest completeness (issue #212)" suite green, ≥11 entries walked (unchanged assertion from #212) |
| MODIFIED: the guard is proven non-vacuous — hand-mutated missing field caught, per field | PASS | Pre-existing #212 behavior, untouched; part of the green docs-test run |
| MODIFIED: the pure scanner is unit-tested with zero disk access | PASS | `manifest-completeness-scan.test.ts` has no `node:fs` import (`grep -n "node:fs" manifest-completeness-scan.test.ts` — no match); 43/43 tests green using only in-memory YAML fixtures |
| MODIFIED: a declared `scripts[].path` that does not resolve is caught, naming entry + exact field | PASS | Unit test + QA's own independent live reproduction (below) |
| MODIFIED: a declared `evals[].path` that does not resolve is caught even though it still names a real `scripts:` entry | PASS | Unit test "catches an evals[].path that does not resolve on disk, even though it passes the existing scripts: consistency check" + Handoff Transcript 2 (live, on `chatgpt-image-2`) |
| MODIFIED: the pre-existing consistency check still fires independently | PASS | Unit test at line 382, `pathExists: () => true` forced, consistency failure still reported |
| ADDED: `references[].path` failing existence is caught | PASS | Unit test "catches a references[].path that does not resolve..." + Handoff Transcript 3 (live, `grok-imagine`) |
| ADDED: sibling guard confirmed for wrong-depth `shared_references.path` corruption | PASS | Handoff Transcript 4 (live) — the #252 `describe` block, not the completeness one, fires |
| ADDED: `shared_references.path` gains its own direct check because sibling coverage is partial | PASS | Unit test "catches a shared_references.path that does not resolve..." + Handoff Transcripts 5 (gap confirmed) and 6 (closed) |
| ADDED: fields deliberately left uncovered are named with reasons | PASS | `docs/catalogue-manifest-format.md`'s "Fields deliberately NOT given an existence check" list — all four named with reasons, matches the ADDED Requirement text verbatim |

### Always-rules + Magnific-fake checks

| Check | Result | Evidence |
|---|---|---|
| Generate-never-publish | PASS (unaffected) | `grep -n "ledger\|post_url\|publish\|Insights"` across all three touched `src/` files returns no matches — this slice never touches the publish/Post code path |
| Public-metrics-only | PASS (unaffected) | No Apify/metrics code touched; diff is entirely `.claude/skills/` manifest tooling + docs |
| Relative-not-absolute | PASS (unaffected) | No scoring/baseline code touched |
| Explicit-attribution | PASS (unaffected) | No Post/Idea/Recipe attribution code touched |
| Ledger-as-source-of-truth | PASS (unaffected) | `grep -n "ledger"` across the touched `src/` files — no match; no store-write, no command-surface call anywhere in the diff |
| No live Magnific call | PASS | `grep -rn "spaces_\|creations_\|magnific"` across the three touched `src/claude-skills/*.ts` files — zero matches. The only two mentions of `spaces_*`/`creations_*` anywhere in this change are in `proposal.md` and `handoff.md` prose, both stating that no such calls exist — not actual usages. This is filesystem-only tooling (`existsSync`/`join` from `node:fs`/`node:path`); no Magnific MCP tool is imported or called anywhere in the diff. |
| fs-boundary / store-write-boundary guards still green | PASS | `node --import tsx --test src/fs-boundary/*.test.ts src/store-write-boundary/*.test.ts` — 43/43 passing (also included in the full 4028 suite run) |

### Independent spot-check (QA-run, not developer-claimed)

To sanity-check the Build Report's Transcript 1 was a real red→green cycle and not a fabricated narrative, QA itself (read-only on product code, one throwaway mutate/restore cycle on a real `.claude/skills/` fixture file, no product-code edits) did the following:

1. Confirmed `git status --short .claude/skills/` was clean before starting.
2. Backed up `.claude/skills/veo-3-1/metadata.yaml`, then mutated `scripts[0].path` from `scripts/build-prompt.ts` to `scripts/build-prompt-QA-SPOTCHECK-NONCE.ts`.
3. Ran `npm run test:docs` — got a real, live failure:
   ```
   not ok 1 - every catalogue entry ... carries a complete manifest
     error: Incomplete catalogue-entry manifest field(s) found: [
       { "skillName": "veo-3-1", "field": "scripts[0].path",
         "reason": "declared but no file exists at \"scripts/build-prompt-QA-SPOTCHECK-NONCE.ts\" (resolved relative to this entry's own directory)" }
     ]
   ```
   This matches the Build Report's Transcript 1 shape and skill exactly (same entry, same field, same reason format).
4. Restored the file byte-identically from the backup; `git diff .claude/skills/veo-3-1/metadata.yaml` was empty; `git status --short .claude/skills/` was empty.
5. Re-ran `npm run test:docs` — 351/351 passing again.

This confirms the "prove it fails" mechanism is real and reproducible, not a narrated claim.

### Defect list

None. No defects found in this round.

### Overall

**PASS.** The build satisfies every acceptance criterion in issue #261, the OpenSpec spec deltas faithfully match the issue (including the two deliberately-in-scope extra fields and the two deliberately-out-of-scope ones, each independently checked for sound reasoning), the pre-existing consistency check is verifiably kept and still independently tested, the "prove it fails" claims are real (independently reproduced live by QA for the `scripts[].path` case), the suite and `openspec validate --strict` are both genuinely green, no live Magnific call exists anywhere in the diff, and none of the always-rules are implicated or regressed by this filesystem/manifest-only slice. Cleared to proceed to branch + PR.
