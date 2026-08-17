# Slice Handoff — issue #252: Write the five shared craft references, and fix the 129 citations pointing at them

## Build Report

### What changed

Eleven model-prompting Skills under `.claude/skills/` cite five shared craft-reference documents —
`prompt-discipline.md`, `cinematography.md`, `lighting.md`, `photography.md`, `production-design.md` —
129 times across 44 files, as the layer to read before writing a prompt for the first time. The
documents had never been committed (`git log --all --diff-filter=A` finds no trace, and the Operator
confirmed they do not exist anywhere else), so every one of those 129 citations dangled. This slice:

1. **Wrote the five documents** at `.claude/references/` — genuinely useful craft-reference prose,
   grounded in reading all eleven `SKILL.md` files and their `references/*.md` documents first, never
   invented independently. No OrganicGrowth/Straw Motion/MundoTip content anywhere in them.
2. **Fixed the citation-depth bug the parent ticket (#212) did not know about**: all 129 citations use a
   `../../../references/` prefix, but they sit at two different depths — 72 (in each skill's own
   `references/*.md` sibling files) already resolved correctly to `.claude/references/` once that folder
   existed; 57 (in each skill's `SKILL.md`/`metadata.yaml`) needed the prefix shortened by one level, to
   `../../references/`, or they'd overshoot to a repo-root `references/` that was never created. Fixed
   the 57 (across 11 `SKILL.md` + 9 `metadata.yaml` files, 20 files total); left every `references/*.md`
   sibling file byte-for-byte untouched.
3. **Built the automated "dangling reference link" guard** #212 itself calls for, landed here per issue
   #252's own instruction, before the manifest half of #212: `src/claude-skills/reference-citation-scan.ts`
   (pure) + `reference-citation-guard.docs-test.ts` (the one disk-touching layer), proven non-vacuous by
   a live hand-revert/re-fix cycle (see below).

### Files touched

**Added:**
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-252-craft-references/.claude/references/prompt-discipline.md`
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-252-craft-references/.claude/references/cinematography.md`
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-252-craft-references/.claude/references/lighting.md`
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-252-craft-references/.claude/references/photography.md`
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-252-craft-references/.claude/references/production-design.md`
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-252-craft-references/src/claude-skills/reference-citation-scan.ts`
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-252-craft-references/src/claude-skills/reference-citation-scan.test.ts`
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-252-craft-references/src/claude-skills/reference-citation-guard.docs-test.ts`
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-252-craft-references/openspec/changes/issue-252-craft-references/proposal.md`
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-252-craft-references/openspec/changes/issue-252-craft-references/tasks.md`
- `/Users/CaxtonTaylor/Developer/.og-worktrees/issue-252-craft-references/openspec/changes/issue-252-craft-references/specs/craft-references/spec.md`
- this `handoff.md`

**Modified (citation-path characters only, one changed line per citation, nothing else in any of these
20 files):**
- `.claude/skills/{chatgpt-image-2,grok-imagine,grok-imagine-1-5,happy-horse,kling-3-0,kling-3-0-omni,nano-banana-2,seedance-2-0,seedream-4-5,seedream-5-0-pro,veo-3-1}/SKILL.md` (11 files)
- `.claude/skills/{chatgpt-image-2,happy-horse,kling-3-0,kling-3-0-omni,nano-banana-2,seedance-2-0,seedream-4-5,seedream-5-0-pro,veo-3-1}/metadata.yaml` (9 files — `grok-imagine`/`grok-imagine-1-5` have no citation in their `metadata.yaml`, so those two are untouched there)

**Untouched, confirmed via `git diff`:** every `.claude/skills/<skill>/references/{README,translation-notes,official-guidelines}.md` file; every craft rule inside any Recipe-level Skill (`produce-news-carousel`, `produce-character-explainer`, `produce-news-short-script`, `write-social-copy`, `fetch-curated-source`); every workflow Skill outside the eleven model-prompting Skills.

### How to run

```bash
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-252-craft-references

# Full suite (type-check + all tests, includes the new guard)
npm test

# Just the new module
node --import tsx --test src/claude-skills/*.ts

# Just the disk-touching guard (also picked up by `npm run test:docs`)
node --import tsx --test src/claude-skills/reference-citation-guard.docs-test.ts

# OpenSpec
openspec validate issue-252-craft-references --strict
openspec validate --all --strict
```

Results on this branch: `npm test` → **3483 tests / 915 suites / 0 fail** (baseline on `main` at
`2b4c04d` was 3469/910/0 — the delta is exactly the two new test files' own 14 tests / 5 suites, nothing
else). `openspec validate --all --strict` → **66 passed, 0 failed** (baseline 65 on this branch's `main`
tip — the delta is exactly this one new change).

### Acceptance-criteria self-assessment

Mapping issue #252's own checklist to what proves each item:

| Acceptance criterion | Proof |
|---|---|
| The missing shared reference folder is recovered; all 129 dangling links across the five affected files resolve | `.claude/references/*.md` exist (5 files, ~600 lines); issue #252's own reproduction script run against the final tree reports **0 broken** (was 129); `src/claude-skills/reference-citation-guard.docs-test.ts`'s first test asserts the same programmatically, every `npm test` run |
| Write the five documents, grounded in what the Skills already assume, no brand content | Each document's content is traced to specific Skill-file evidence in `proposal.md`'s "What Changes" §1 (the cross-model skeletons, "name the light" language, named-tradition anchor sections); `craft-references/spec.md`'s first two Requirements pin this; a direct grep for `organicgrowth`/`straw motion`/`mundotip`/`unhypped` across the five files returns nothing (confirmed live, see below) |
| Fix the citation depth so all 129 resolve, verified by resolving every citation against the filesystem, not eyeballing | The exact python reproduction script from the issue was run before AND after the fix (129 broken → 0 broken); the broader 158-citation check (including the unnamed `metadata.yaml` directory pointers, outside the issue's own 129 count) also confirmed 0 broken |
| An automated check fails when a Skill cites a reference path that does not resolve | `src/claude-skills/reference-citation-scan.ts` + `reference-citation-guard.docs-test.ts`, run inside `npm test` and `npm run test:docs`; `craft-references/spec.md`'s "An automated check fails..." Requirement, both its scenarios |
| The check is proven to fail, not merely written to look right | See "Fakes / fixtures used" and the live transcript below — done twice: once ad hoc before committing the guard, and pinned permanently as `reference-citation-scan.test.ts`'s `"is proven non-vacuous"` test (pure, in-memory) |

### Fakes / fixtures used

- **No Magnific fake needed and none used.** This slice touches no production runtime path, no
  `spaces_*`/`creations_*` call of any kind, and the `developer` agent is never given the `magnific` MCP
  tools in the first place — confirmed nothing in this diff imports or references `src/space-driver/` or
  any producer runtime module. Entirely documentation (`.claude/skills/`, `.claude/references/`) plus one
  new, pure, filesystem-adjacent test module.
- **In-memory fixtures only** in `reference-citation-scan.test.ts` — no real disk I/O in that file at
  all, by design (mirrors `src/fs-boundary/scan.test.ts`'s pure/impure split).
- **The one disk-touching fixture** is `reference-citation-guard.docs-test.ts` itself, which walks the
  REAL `.claude/skills/` tree — this is intentional and correct for a guard whose whole job is "does the
  real tree resolve," the same shape `src/fs-boundary/node-fs-guard.test.ts` already uses.

**Live non-vacuousness proof (issue #252's own directive), run before committing the guard:**

```
$ cp .claude/skills/veo-3-1/SKILL.md /tmp/veo-skill-backup.md
$ echo '
Broken test citation: `../../references/does-not-exist-nonce.md`
' >> .claude/skills/veo-3-1/SKILL.md
$ npx tsx --test src/claude-skills/reference-citation-guard.docs-test.ts
...
not ok 1 - dangling reference-citation guard (issue #252)
  ---
  ...
  error: '1 subtest failed'
  ...
# tests 2
# pass 1
# fail 1

$ cp /tmp/veo-skill-backup.md .claude/skills/veo-3-1/SKILL.md
$ npx tsx --test src/claude-skills/reference-citation-guard.docs-test.ts
...
ok 1 - dangling reference-citation guard (issue #252)
# tests 2
# pass 2
# fail 0
$ git status --short .claude/skills/veo-3-1/SKILL.md
 M .claude/skills/veo-3-1/SKILL.md   # only the expected depth-fix diff remained — byte-identical restore confirmed
```

This exact cycle is also pinned permanently (no future edit can silently make it vacuous again) as
`reference-citation-scan.test.ts`'s `"is proven non-vacuous: a hand-introduced broken citation is caught,
and removing it restores green"` test, using pure in-memory fixtures instead of a real file mutation.

**Brand-content grep, run live against the finished five documents:**

```
$ grep -rniE "organicgrowth|straw.?motion|mundotip|unhypped|\bidea brief\b|\bproducer\b|\bfit score\b|\bperformance score\b|\bexecution protocol\b|\bproduction spec\b" .claude/references/
CLEAN
```

### Self-review notes

- Removed a redundant `.slice()` call in `findDanglingReferenceCitations` (the preceding `.filter()`
  already returns a fresh array, so sorting it in place needed no extra copy).
- Fixed one broken sentence fragment in `photography.md`'s composition section, left over from an
  editing pass, before it was ever committed (caught on a re-read, not by a test — there is no
  automated prose-quality check, by design; this is exactly what the human-judgment "could an agent
  compose a genuinely better prompt after reading this" bar is for).
- Confirmed, module-boundary by module-boundary, that the scan module's pure/impure split is real: `grep
  -n "node:fs\|readFile\|existsSync" src/claude-skills/reference-citation-scan.ts
  src/claude-skills/reference-citation-scan.test.ts` returns nothing in either file — only
  `reference-citation-guard.docs-test.ts` imports `node:fs`.
- Every acceptance criterion in the issue maps to a specific, named test or a specific, live-run command
  (table above) — none is asserted only in prose.
- OpenSpec gotcha hit and fixed: `openspec validate --strict` initially failed three of the four
  Requirements with "must contain SHALL or MUST" even though every requirement body plainly contained
  SHALL — the parser only reads the requirement's FIRST PHYSICAL LINE as its "text," so a body wrapped
  at ~100 columns (SHALL landing on line 2+ of the paragraph) reads as empty. Fixed by un-wrapping each
  Requirement's body into one long unwrapped line, matching the convention already visible in this
  repo's own archived `skill-command-surface/spec.md`.

### Known limits

- Out of scope by design, per the issue and per #212's own split: manifests, the licence file, the
  Python test-vs-dependency decision, brand removal from Skill descriptions, and end-to-end install
  verification. All remain on #212.
- The dangling-reference guard's regex (`(../)+references/([a-z-]+\.md)`) deliberately matches ONLY the
  issue's own reproduction shape — a lowercase, hyphenated `.md` filename. It does not (and is not
  asked to) flag the 29 unnamed `path: ../../references/` bare-directory citations in `metadata.yaml`'s
  `shared_references` block; those were fixed too (verified via the broader 158-citation check in the
  proposal), but are not separately guarded going forward, since they carry no filename to validate
  against and a directory-existence check on its own would be a much weaker, differently-shaped
  assertion than what the issue's own criterion describes.
- The five documents are intentionally scoped to the craft the eleven model-prompting Skills already
  assume; they do not attempt to cover every corner of cinematography/lighting/photography/production-
  design as standalone film-school texts. Where a Skill's own `translation-notes.md` states a
  model-specific override, that file remains authoritative, as stated explicitly in
  `prompt-discipline.md`'s own opening section.

## QA Verdict — Round 1: FAIL

Verified at branch `issue-252-craft-references`, HEAD `674b910`, worktree
`/Users/CaxtonTaylor/Developer/.og-worktrees/issue-252-craft-references`. `main` at `2b4c04d`.

### Suite result — green, exactly as reported

| Command | Result |
|---|---|
| `npm test` | **3483 tests / 915 suites / 0 fail** (delta over `main`'s 3469/910/0 is exactly the two new test files' own 14 tests / 5 suites — recomputed by hand from the two files' `it(` counts: `reference-citation-scan.test.ts` = 3+4+1+4 = 12 tests / 4 suites, `reference-citation-guard.docs-test.ts` = 2 tests / 1 suite; 12+2=14, 4+1=5, matches exactly) |
| `npm run test:docs` | **349 tests / 92 suites / 0 fail** (subset of the above; confirmed `ok 11 - dangling reference-citation guard (issue #252)` runs and passes inside this target too) |
| `openspec validate --all --strict` | **66 passed, 0 failed** (baseline 65; delta is exactly `change/issue-252-craft-references`) |
| `openspec validate issue-252-craft-references --strict` | `Change 'issue-252-craft-references' is valid` |

All four commands actually run by me, not assumed. Green.

### Per-criterion results (issue #252's own checklist)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Decide and record where the shared folder lives | PASS | `.claude/references/` created and used consistently; recorded in `proposal.md` §1 |
| 2 | Write the five documents, grounded, no brand content | PASS | see document-by-document judgement below; independent grep for brand/pipeline vocabulary returns nothing (see "No brand content" below) |
| 3 | Fix the citation depth so all 129 resolve, verified against the filesystem | PASS | independently re-ran the issue's own reproduction pattern (`(?:\.\./)+references/([a-z-]+\.md)`) against the real tree: **129 found, 0 broken**; also independently ran the broader 158-citation count (adding the bare-directory `shared_references.path` pointers): **158 found, 0 broken**. Both match the Build Report's claims exactly. `git diff 2b4c04d..674b910` on the 20 modified `SKILL.md`/`metadata.yaml` files shows **only** the citation-prefix text changed (`../../../references/` → `../../references/`), confirmed by reading the full diff — no other prose touched in any of the 20 |
| 4 | An automated check fails when any Skill cites a reference path that does not resolve | **FAIL** | see Defect 1 below — a real, currently-dangling reference path exists in `.claude/skills/grok-imagine/metadata.yaml` and `.claude/skills/grok-imagine-1-5/metadata.yaml` (`../../../_shared/references/`, resolves to a nonexistent `_shared/references/` at repo root) that the guard's regex does not match and therefore never flags. Independently confirmed the guard's exact `CITATION_PATTERN` regex returns zero matches against these two files' real content, and confirmed `_shared/` does not exist anywhere in the repo |

### Per-scenario results (`craft-references/spec.md`)

| Requirement | Scenario | Result | Covering evidence |
|---|---|---|---|
| Five docs exist, grounded, no brand content | prompt-discipline states 5-/6-clause skeletons + override statement | PASS | read `.claude/references/prompt-discipline.md` lines 14–48 directly; independently cross-checked against `veo-3-1/SKILL.md`'s real 6-clause list (cinematography-leads, audio-last) — an exact, faithful match to the "documented exception" language |
| " | cinematography/lighting/photography/production-design each cover their named subject matter | PASS | read all four in full; each covers exactly its named topics with worked synthesis sections |
| " | no doc names the Operator's Brand/Format vocabulary | PASS | independent grep (below) — clean |
| Consistency with existing Recipe-level rules | production-design.md defers real-person depiction policy | PASS | `.claude/references/production-design.md` lines 126–128, verbatim match to the spec's required wording |
| " | no doc restates produce-news-carousel's reserved-frame/real-source rule | PASS | grepped the five docs for `reserved`, `real media clause`, `placeholder.frame`, `grounded, not invented` — zero hits; read `produce-news-carousel/SKILL.md`'s actual REAL MEDIA CLAUSE language (lines 22, 111, 127-131) and confirmed no shared doc restates it |
| Every citation resolves | issue #252's reproduction script finds zero broken (129) | PASS | independently reran, 0 broken (see criterion 3 above) |
| " | SKILL.md-depth and references/*.md-depth resolve to the same path | PASS | verified `veo-3-1/SKILL.md` (`../../references/photography.md`) and `veo-3-1/references/README.md` (`../../../references/photography.md`) both resolve to `.claude/references/photography.md` |
| " | every `references/*.md` sibling file untouched | PASS | `git diff 2b4c04d..674b910 --stat -- '.claude/skills/*/references/'` is empty |
| Automated check fails on dangling citation | guard passes against the real, fixed tree | PASS (narrowly) — but see job-(c) note below | `npm run test:docs` green |
| " | guard proven non-vacuous | PASS — reproduced independently | see "Independent guard reproduction" below (used a **different** file than the developer's own veo-3-1 demonstration) |
| " | pure scanner unit-tested with zero disk access | PASS | `grep -n "node:fs\|readFile\|existsSync"` on both `reference-citation-scan.ts` and `reference-citation-scan.test.ts` returns only doc-comment mentions, no actual import |

**Job (c) note on the "Automated check fails on dangling citation" Requirement:** its own body text narrows itself to "Every citation of the shape `(../)+references/<name>.md`" — which is exactly the guard's regex and exactly what all three scenarios test. That makes the Requirement green against itself. But the issue's own plain-English 4th bullet is unqualified: *"An automated check fails when any Skill cites a reference path that does not resolve."* Checked against the real repository, that broader claim is false — see Defect 1. This is a spec that is self-consistent and its own scenarios all pass, but under-delivers the issue's actual ask for two real files. Flagging per my job (c) mandate.

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | N/A / PASS | no production runtime path touched; confirmed via `git diff --name-only` — only `.claude/`, `openspec/changes/`, and `src/claude-skills/` (new, pure doc-scan module) |
| Public-metrics-only | N/A / PASS | no metrics code touched |
| Relative-not-absolute | N/A / PASS | no scoring code touched |
| Explicit-attribution | N/A / PASS | no Post/Idea linking code touched |
| Ledger-as-source-of-truth | N/A / PASS | `git diff 2b4c04d..674b910 --name-only \| grep -iE "ledger\|queue\.json\|data/brands"` returns nothing — no ledger/queue file touched |
| Magnific fake (no live Space) | PASS | `grep -rn "spaces_\|creations_\|magnific" src/claude-skills/` and `grep -rn "space-driver" src/claude-skills/` both return nothing; this slice is documentation plus one pure filesystem-scan module, hermetic by construction |

### Document-by-document judgement — could an agent compose a genuinely better prompt after reading this?

All five read all five in full. All five earn their place — none is confidently-generic filler, and each ties its vocabulary to a reason ("reads as," "because," "use when") rather than listing terms.

- **`prompt-discipline.md` (33 citations) — PASS, strongest of the five.** The five-/six-clause skeletons, the override statement (independently cross-checked against `veo-3-1/SKILL.md`'s real leads-with-cinematography, ends-with-audio structure — an exact match), the over-specification anti-pattern, the negation guidance (matches `grok-imagine`'s and `nano-banana-2`'s own negation-behaviour sections in spirit without duplicating their model-specific mechanics), and the reference-image role-naming discipline (matches the general principle behind Kling Omni's model-specific multi-reference mix-budget heuristic, correctly left out of the shared doc as model-specific). Genuinely load-bearing.
- **`cinematography.md` (22) — PASS.** Every named term (shot size, camera position, movement, lens) is tied to a storytelling/psychological effect, not just defined. The "compound move" note (primary then secondary, in that order) matches real Skill language about ordering multi-part camera moves.
- **`lighting.md` (22) — PASS.** Directly, verbatim-adjacent to a real Skill quote: `seedream-5-0-pro/SKILL.md` line 132 says *"Place the light — naming its direction and quality does more than any other single clause"* — the document's own opening sentence quotes this almost exactly. A precise, verifiable grounding hit, not an invented claim.
- **`photography.md` (22) — PASS, but the weakest of the five.** Concrete and correctly cross-referenced (exposure↔lighting, depth-of-field↔lens choice, texture↔prompt-discipline's material-specificity principle), and its guidance is genuinely actionable. But relative to its four siblings, its core content (rule of thirds, headroom, exposure basics) is the most conventional photography-101 material — the kind of vocabulary a capable model most likely already carries from training, versus, say, `production-design.md`'s named-tradition-anchor technique or `lighting.md`'s named-setup vocabulary, which are less obvious, higher-leverage, more model-prompting-specific levers. It still clears the "could this change a prompt" bar — it does not fail the test — it is simply the least distinctive of the five.
- **`production-design.md` (30, most cited after prompt-discipline) — PASS.** Its "named-tradition style anchors" section is precisely what `veo-3-1`, `kling-3-0`, `kling-3-0-omni`, and `seedance-2-0`'s own "Strong for X: Tsui Hark Wuxia, Christopher Nolan grounded, IMAX 70mm..." sections point at — confirmed by reading those Skills directly; the shared doc gives the general principle, the Skills keep their own concrete named examples, no duplication. Its Grounding Note's real-person-depiction deferral matches the spec's required wording verbatim.

### No brand content — independently confirmed

```
$ grep -rniE "organicgrowth|straw.?motion|mundotip|unhypped|idea brief|\bproducer\b|fit score|performance score|execution protocol|production spec|magnific|apify|zoho|facebook|instagram|linkedin|youtube|recipe registry|\bcandidate\b|brand.profile" .claude/references/*.md
(no output — clean)
$ grep -rniE "news carousel|carousel|caption|hashtag|cta\b|call.to.action|watermark|banned word|brand.safe" .claude/references/*.md
(no output — clean)
```

No Format voice, no house style presented as craft, no reference to a Recipe or the pipeline. Reads as written for anyone.

### 129-resolve / 0-dangle — independently confirmed

Ran the issue's own reproduction pattern myself (not trusted from the Build Report): **129 found, 0 broken**. Ran the broader 158-count (adds the bare `shared_references.path` directory pointers): **158 found, 0 broken**. Confirmed the citation-count-per-document breakdown matches exactly: `cinematography.md` 22, `lighting.md` 22, `photography.md` 22, `production-design.md` 30, `prompt-discipline.md` 33 — sums to 129.

### Independent guard reproduction (on a different file than the developer's own veo-3-1 demonstration)

Used `.claude/skills/seedream-4-5/SKILL.md`:

```
$ md5 .claude/skills/seedream-4-5/SKILL.md
MD5 (...) = 79512d9b5533197983e5712190d9923d
$ printf '\nBroken QA repro citation: `../../references/qa-repro-nonexistent-doc.md`\n' >> .claude/skills/seedream-4-5/SKILL.md
$ node --import tsx --test src/claude-skills/reference-citation-guard.docs-test.ts
...
actual:
  0:
    citingFile: '.claude/skills/seedream-4-5/SKILL.md'
    rawPath: '../../references/qa-repro-nonexistent-doc.md'
    resolvedPath: '.claude/references/qa-repro-nonexistent-doc.md'
not ok 1 - dangling reference-citation guard (issue #252)
# fail 1

$ cp <backup> .claude/skills/seedream-4-5/SKILL.md   # restore
$ md5 .claude/skills/seedream-4-5/SKILL.md
MD5 (...) = 79512d9b5533197983e5712190d9923d          # byte-identical
$ node --import tsx --test src/claude-skills/reference-citation-guard.docs-test.ts
ok 1 - dangling reference-citation guard (issue #252)
# fail 0
$ git status --short .claude/skills/seedream-4-5/SKILL.md
(clean)
```

The guard is not vacuous — it fires on a genuinely broken citation in a file the developer never touched for this demonstration, names it precisely, and restores clean. This is not a fourth blind guard.

### Defect list

**Defect 1 — medium severity — the automated check does not catch a real, currently-dangling reference-path citation in exactly the file class this issue targets, and the Build Report's claim about it is incorrect.**

`.claude/skills/grok-imagine/metadata.yaml` (lines 113, 131) and `.claude/skills/grok-imagine-1-5/metadata.yaml` (lines 112, 129) each carry `path: ../../../_shared/references/` (and a matching `purpose:` sentence). This resolves (`os.path.normpath` from each file's own directory) to a repo-root `_shared/references/`, which does not exist anywhere in the repository — confirmed with `find . -iname "_shared"` returning nothing. This is pre-existing (introduced in commit `91f0276`, "Add Grok Imagine skills from ai-media-prompting v1.2.0," 2026-07-18 — predates this branch and this issue), not something this slice introduced, but:

- It is a live, real dangling reference-path citation inside a `.claude/skills/**/*.yaml` file — precisely the domain issue #252's 4th "what to build" bullet describes: *"An automated check fails when any Skill cites a reference path that does not resolve."* Checked against the real repository, that criterion is not met for these two files.
- The guard's `CITATION_PATTERN` regex (`(?:\.\./)+references/([a-z-]+\.md)`) requires `references/` to appear immediately after the repeated `../` segments. Because `_shared/` sits in between, this citation never matches — confirmed by running the exact regex against both files' real content: zero matches, for either file.
- The Build Report's "Files touched" section states: *"`grok-imagine`/`grok-imagine-1-5` have no citation in their `metadata.yaml`, so those two are untouched there."* This is factually incorrect — both files do have a citation to a shared-references location; it is simply a third, unrecognized shape (`_shared/references/`, not `references/`) that the audit never surfaced. The claim needs correcting, not just the underlying file.
- The spec's own Requirement text ("Every citation of the shape `(../)+references/<name>.md`...") narrows itself to exactly the guard's regex, so the Requirement is green against itself — but the issue's own broader, unqualified ask is not fully met. This is exactly the "self-consistent-but-wrong spec" failure mode I'm charged to catch.

**Repro steps:**
```bash
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-252-craft-references
grep -n "_shared" .claude/skills/grok-imagine/metadata.yaml .claude/skills/grok-imagine-1-5/metadata.yaml
# -> path: ../../../_shared/references/ (×2 files, ×2 occurrences each)
find . -iname "_shared" -maxdepth 4
# -> nothing; the target does not exist
node -e "
const CITATION_PATTERN = /((?:\.\.\/)+references\/([a-z-]+\.md))/g;
const s = require('fs').readFileSync('.claude/skills/grok-imagine/metadata.yaml','utf8');
console.log([...s.matchAll(CITATION_PATTERN)].map(m=>m[1]));
"
# -> [] — the guard never sees this citation, so it never fails on it
```

**Suggested fix (not prescriptive — QA does not edit code):** either (a) correct these two files' stale `_shared/references/` pointer to `../../references/`, matching the other 9 fixed `metadata.yaml` files, and broaden the guard's regex (or add a second, explicit assertion) so a citation shape like this cannot silently recur; or (b) if a decision is made that this is genuinely out of scope for #252, say so explicitly in the Build Report's Known Limits (as was correctly done for the 29 bare-directory citations) rather than asserting incorrectly that no citation exists — and correct the false "untouched, no citation" claim either way.

No other defects found. Everything else — the five documents' content and grounding, citation-depth fix for the 129/158, guard non-vacuousness, hermetic/no-live-Space, no-brand-content, and OpenSpec fidelity to the issue — is solid and independently verified.

### Overall

**FAIL — one medium-severity defect** (Defect 1 above). Everything else in this slice is strong work: the five documents are genuinely useful and well-grounded (weakest is `photography.md`, and even it clears the bar), the citation-depth fix for the issue's own 129 is complete and independently verified, the guard is real and independently proven non-vacuous on a different file, the slice is hermetic, and no brand content leaked. The one gap is narrow and should be a fast fix — recommend the developer correct the two stale `_shared/references/` pointers (or an explicit, honest scope carve-out) and correct the Build Report's inaccurate claim about them, then resubmit for Round 2.

## Build Report — Round 2

Fixes exactly Defect 1 from the Round 1 QA Verdict above. Nothing else in the slice was touched — no
change to any of the five craft-reference documents, no change to any of the other 18 previously-fixed
`SKILL.md`/`metadata.yaml` files, no change to any `references/*.md` sibling file.

### What changed

1. **Corrected the claim, first.** Round 1's Build Report stated: *"`grok-imagine`/`grok-imagine-1-5`
   have no citation in their `metadata.yaml`, so those two are untouched there."* That was wrong — both
   files carry a shared-references citation, just in a third shape (`../../../_shared/references/`, an
   intervening `_shared/` segment before `references/`) that the Round 1 audit never enumerated. See
   "Corrected claim" below for the full correction.

2. **Widened the guard** (`src/claude-skills/reference-citation-scan.ts`). The citation pattern changed
   from the Round-1 shape, which required `references/` to sit immediately after the `../` climb and a
   filename to always follow it:

   ```
   Round 1: /((?:\.\.\/)+references\/([a-z-]+\.md))/g
   Round 2: /((?:\.\.\/)+(?:[a-zA-Z0-9_.-]+\/)*references\/(?:[a-z-]+\.md)?)/g
   ```

   Two changes, both additive, neither narrows the old shape:
   - `(?:[a-zA-Z0-9_.-]+\/)*` — zero or more intervening path segments are now allowed between the
     `../` climb and the final `references/` (this is what catches `_shared/`, and generalizes to any
     future stray segment, not just this one literal name).
   - `(?:[a-z-]+\.md)?` — the filename is now OPTIONAL, so a bare-directory citation (no filename —
     e.g. every `metadata.yaml`'s `shared_references.path:` field, its matching `purpose:` sentence, and
     every `references/README.md`'s own pointer line) is now matched and resolved too, not skipped.
     `existsSync` (the guard's one disk-touching predicate) is true for both a file and a directory, so
     no other code needed to change to validate a bare-directory citation the same way as a named one.

   The original filenamed shape (`(../)+references/<name>.md`, zero intervening segments) still matches
   byte-for-byte the same way it always did — the new alternatives are additive, not a replacement. This
   is proven directly: `reference-citation-scan.test.ts`'s pre-existing `extractReferenceCitations` /
   `findDanglingReferenceCitations` tests for the named shape were left untouched and still pass (see
   suite numbers below).

3. **Re-decided the bare-directory carve-out (Round 1 Known Limits), honestly, given the defect is
   precisely that shape.** Round 1 deliberately did not flag a bare-directory citation (`path:
   ../../references/`, no filename) — reasoning that it "carries no filename to validate against and a
   directory-existence check on its own would be a much weaker, differently-shaped assertion." QA
   accepted that carve-out on its own terms in Round 1. But Defect 1 is a bare-directory citation gone
   stale (`../../../_shared/references/` resolves to nothing), which means the carve-out was hiding
   exactly the failure mode the issue's own unqualified 4th bullet describes ("any Skill cites a
   reference path that does not resolve"). Re-decision for Round 2: bare-directory citations ARE now in
   scope and ARE now checked — a directory-existence check is a real, meaningful assertion (does
   `.claude/references/` exist at the path this citation implies?), even without also asserting a
   specific file's presence, and it is strictly better than not checking at all. This is not a weaker
   guard than a named-file check — it is a different, still-real one, and it is exactly the one Defect 1
   needed. The two checks (named-file existence, bare-directory existence) now coexist in the same
   pattern and the same `pathExists` predicate.

4. **Fixed the two files.** `.claude/skills/grok-imagine/metadata.yaml` and
   `.claude/skills/grok-imagine-1-5/metadata.yaml` — in each, both the `references[].purpose:` sentence
   ("Pointer to shared references at ...") and the `shared_references.path:` field changed from
   `../../../_shared/references/` to `../../references/`, matching the other nine already-fixed
   `metadata.yaml` files exactly. Nothing else in either file changed — confirmed by `git diff` (see
   below).

5. **Pinned the fix permanently as in-memory unit tests** in `reference-citation-scan.test.ts` (no real
   disk I/O), so no future edit can quietly narrow the regex back to missing this shape: a test that a
   bare-directory citation now matches and resolves; a test that an intervening-segment bare-directory
   citation (`../../../_shared/references/`) matches, resolves outside `.claude/`, and is reported
   dangling by `findDanglingReferenceCitations`, then resolves clean once corrected to `../../references/`;
   a test that a NAMED citation with an intervening segment (a hypothetical `../../../vendor/references/
   cinematography.md`) also matches and resolves, proving the widening is general, not
   `_shared`-specific; and an updated (not deleted) version of the old "does not match a bare directory
   citation" test, now split into "matches" plus a companion test showing an uppercase, non-matching
   filename after a bare-directory prefix still yields the (correctly weaker) bare-directory match only.

6. **Updated the guard's own sanity-check threshold and message** (`reference-citation-guard.docs-test.ts`)
   from "at least 100" to "at least 150" citations, since the widened corpus now includes the ~33
   previously-invisible bare-directory citations (162 total today, up from 129) — so the sanity check
   still actually means something after the widening, rather than becoming trivially true.

7. **Updated the OpenSpec spec delta** (`craft-references/spec.md`) — both affected Requirements'
   headers and bodies rewritten so neither narrows itself to the old filenamed-only regex shape (this
   was QA's job-(c) finding: the Requirement was internally green but under-delivered the issue's actual
   ask). Two new Scenarios added, one per Requirement, covering the intervening-segment / bare-directory
   shape directly against the real `grok-imagine`/`grok-imagine-1-5` files.

### Red -> green transcript (step 3 of this round's brief)

**Step A — widened guard run against the tree with the two `_shared/` citations still stale (before
touching the two `metadata.yaml` files at all):**

```
$ node --import tsx --test src/claude-skills/reference-citation-guard.docs-test.ts
TAP version 13
# Subtest: dangling reference-citation guard (issue \#252)
    # Subtest: every (../)+references/<name>.md citation across .claude/skills/ resolves to a real file
    not ok 1 - every (../)+references/<name>.md citation across .claude/skills/ resolves to a real file
      ---
      error: |-
        Dangling reference citation(s) found: [
          {
            "citingFile": ".claude/skills/grok-imagine-1-5/metadata.yaml",
            "rawPath": "../../../_shared/references/",
            "resolvedPath": "_shared/references"
          },
          {
            "citingFile": ".claude/skills/grok-imagine-1-5/metadata.yaml",
            "rawPath": "../../../_shared/references/",
            "resolvedPath": "_shared/references"
          },
          {
            "citingFile": ".claude/skills/grok-imagine/metadata.yaml",
            "rawPath": "../../../_shared/references/",
            "resolvedPath": "_shared/references"
          },
          {
            "citingFile": ".claude/skills/grok-imagine/metadata.yaml",
            "rawPath": "../../../_shared/references/",
            "resolvedPath": "_shared/references"
          }
        ]. Every .claude/skills/**/*.md or *.yaml citation of the shape (../)+references/<name>.md must resolve to a real file under .claude/references/ (issue #252).
      code: 'ERR_ASSERTION'
      name: 'AssertionError'
      ...
not ok 1 - dangling reference-citation guard (issue \#252)
  ---
  failureType: 'subtestsFailed'
  error: '1 subtest failed'
  ...
# tests 2
# pass 1
# fail 1
```

RED, and the failure message names both files (`grok-imagine-1-5/metadata.yaml`, `grok-imagine/
metadata.yaml`) with their exact dangling `rawPath` and `resolvedPath`, exactly as required.

**Step B — the fix applied** (`git diff`, confirming ONLY the citation fields changed, nothing else in
either file):

```
$ git diff -- .claude/skills/grok-imagine/metadata.yaml .claude/skills/grok-imagine-1-5/metadata.yaml
diff --git a/.claude/skills/grok-imagine-1-5/metadata.yaml b/.claude/skills/grok-imagine-1-5/metadata.yaml
--- a/.claude/skills/grok-imagine-1-5/metadata.yaml
+++ b/.claude/skills/grok-imagine-1-5/metadata.yaml
@@ -109,7 +109,7 @@ references:
   - path: references/official-guidelines.md
     purpose: Distilled summary of the Grok Imagine 1.5 prompt guide and moderation tactics with source URLs and fetch date.
   - path: references/README.md
-    purpose: Pointer to shared references at ../../../_shared/references/.
+    purpose: Pointer to shared references at ../../references/.
 source_tracking:
 ...
 shared_references:
   mode: relative-link
-  path: ../../../_shared/references/
+  path: ../../references/
diff --git a/.claude/skills/grok-imagine/metadata.yaml b/.claude/skills/grok-imagine/metadata.yaml
--- a/.claude/skills/grok-imagine/metadata.yaml
+++ b/.claude/skills/grok-imagine/metadata.yaml
@@ -110,7 +110,7 @@ references:
   - path: references/official-guidelines.md
     purpose: Distilled summary of the Grok Imagine image prompting guidance with source URLs, fetch date, and known uncertainties.
   - path: references/README.md
-    purpose: Pointer to shared references at ../../../_shared/references/.
+    purpose: Pointer to shared references at ../../references/.
 source_tracking:
 ...
 shared_references:
   mode: relative-link
-  path: ../../../_shared/references/
+  path: ../../references/
```

**Step C — widened guard re-run, GREEN:**

```
$ node --import tsx --test src/claude-skills/reference-citation-guard.docs-test.ts
TAP version 13
# Subtest: dangling reference-citation guard (issue \#252)
    ok 1 - every (../)+references/<name>.md citation across .claude/skills/ resolves to a real file
    ok 2 - finds every one of the five shared craft-reference documents cited at least once
    1..2
ok 1 - dangling reference-citation guard (issue \#252)
1..1
# tests 2
# pass 2
# fail 0
```

**Step D — pinned permanently.** The exact same red -> fix -> green cycle, using the real citation text
(`../../../_shared/references/` -> `../../references/`), is now also a standing, in-memory unit test:
`reference-citation-scan.test.ts`'s `"pins the issue #252 Round 1 Defect 1 shape: a bare-directory
citation with an intervening '_shared/' segment ... is caught as dangling, not silently skipped ..."`
test — no future edit to the regex can silently narrow it back without this test failing first.

### Citation-shape sweep (step 5 of this round's brief)

Enumerated every distinct way a Skill file under `.claude/` points at a shared reference, by grepping
the real tree for every `(\.\./)+` path fragment containing `references` (see commands run live, not
assumed) across all 16 Skills (11 model-prompting + 5 Recipe-level) and their `references/*.md`
siblings. Exactly **three** distinct shapes exist in the real repository; a fourth was checked for and
not found:

1. **NAMED citation**, `(../)+references/<name>.md` — e.g. `../../references/photography.md`. 129
   occurrences, across every `SKILL.md` (one directory shallower) and every `references/*.md` sibling
   file (one directory deeper). **Resolved** — this was already fully covered by the Round 1 guard and
   remains covered unchanged by the Round 2 widening.

2. **Bare-DIRECTORY citation, no filename**, `(../)+references/` — three sub-locations per correctly-
   pointing skill: the `metadata.yaml` `references[].purpose:` sentence ("Pointer to shared references
   at ..."), the `metadata.yaml` `shared_references.path:` field, and each `references/README.md`'s own
   standalone pointer line. 29 occurrences pointing correctly at `../../references/` before this round
   (9 metadata.yaml files x 2 occurrences + 11 references/README.md x 1 occurrence = 29), confirmed
   already fixed to the right depth in Round 1. **Was explicitly carved out of the Round 1 guard as
   out-of-scope; re-decided in scope for Round 2** (see item 3 above) — now matched and existence-checked
   against `.claude/references/` as a directory, same as a named citation is checked against a file.

3. **Bare-DIRECTORY citation with an intervening segment**, `(../)+<segment>/references/` — the Defect 1
   shape, `../../../_shared/references/`. 4 occurrences, confined to exactly the two files this round
   fixes (`grok-imagine`, `grok-imagine-1-5` `metadata.yaml`, 2 occurrences each — the `purpose:`
   sentence and the `shared_references.path:` field). **Was invisible to the Round 1 guard's regex;
   resolved by this round's widening** (item 2 above) — proven dangling before the fix, clean after (see
   transcript above).

**Fourth-shape check, explicitly run, nothing further found.** Searched for: any relative-path
"references" mention with a different directory-climb shape (e.g. wrong number of segments, forward vs.
backward slash, a Windows-style path) — none found, every citation uses forward slashes and a `../`
climb. Any citation phrased as prose without a literal path at all (e.g. "see the shared references
doc") that a machine check could never resolve regardless of pattern — none found; every mention of
"shared references" in the corpus is paired with an actual relative path, immediately adjacent, in the
same sentence or YAML field. Any citation inside the 5 Recipe-level Skills
(`fetch-curated-source`, `produce-character-explainer`, `produce-news-carousel`,
`produce-news-short-script`, `write-social-copy`) — none found; grepping all five for "references" or
"`\.\./`" returns nothing citing the shared craft folder, consistent with the Round 1 Build Report's
"Untouched" list. Any citation inside `.claude/agents/`, `.claude/commands/`, `.claude/rules/`, or
`.claude/permissions/` — none found; these directories were swept too and contain no `references/`
citation of any kind. **Conclusion: exactly three shapes exist in the real repository as of this round,
and all three are now either resolved-and-guarded (shapes 1 and 2) or fixed-and-guarded (shape 3, this
round's fix). Nothing further.**

Commands run (verbatim, live):

```
$ grep -rn "_shared" .claude/
# -> only the 4 occurrences in the two grok metadata.yaml files (pre-fix)

$ grep -rnoE '(\.\./)+[a-zA-Z0-9_.-]*references[a-zA-Z0-9_./-]*' .claude/skills/ | sed -E 's/^[^:]+:[0-9]+://' | sort -u
# -> only the two known depths (../../references/... and ../../../references/...), no third
#    unaccounted shape visible to this narrower probe (it does not see the _shared/ case by design,
#    which is why the more targeted "purpose: Pointer to shared references" grep below was also run)

$ grep -rn "shared_references\|Pointer to shared references" .claude/skills/*/metadata.yaml
# -> exactly 11 metadata.yaml files (all 11 model-prompting skills), confirming this pointer-pair shape
#    is universal across that class and there is no 12th, differently-shaped metadata.yaml pointer

$ find .claude -maxdepth 2 -type d | sort
# -> agents, commands, permissions, references, rules, rules/always, skills — confirms the sweep's
#    scope covers every directory under .claude/ that could plausibly hold a citing file
```

### Corrected claim

Round 1's Build Report, "Files touched" section, stated:

> `.claude/skills/{chatgpt-image-2,happy-horse,kling-3-0,kling-3-0-omni,nano-banana-2,seedance-2-0,
> seedream-4-5,seedream-5-0-pro,veo-3-1}/metadata.yaml` (9 files — `grok-imagine`/`grok-imagine-1-5` have
> no citation in their `metadata.yaml`, so those two are untouched there)

**This was factually incorrect.** `grok-imagine/metadata.yaml` and `grok-imagine-1-5/metadata.yaml` both
DO carry a shared-references citation in their `metadata.yaml` — in the same `references[].purpose:` /
`shared_references.path:` shape every other model-prompting skill's `metadata.yaml` uses — it was simply
pointed at a third, stale, never-audited path (`../../../_shared/references/`) instead of the correct
`../../references/`. The Round 1 audit that produced the "9 files, 2 untouched" claim never enumerated
this shape, so it silently concluded "no citation" rather than "a citation to the wrong place." Corrected
here: **all 11 model-prompting skills' `metadata.yaml` files carry this citation pair; 9 already pointed
correctly and were left alone in Round 1; the remaining 2 (`grok-imagine`, `grok-imagine-1-5`) pointed at
a nonexistent `_shared/` path and are fixed in this round** — bringing the true total of touched
`metadata.yaml` files across both rounds to 11, not 9.

### Known Limits — Round 2 update

Round 1's Known Limits bullet on this subject read:

> The dangling-reference guard's regex (`(../)+references/([a-z-]+\.md)`) deliberately matches ONLY the
> issue's own reproduction shape — a lowercase, hyphenated `.md` filename. It does not (and is not asked
> to) flag the 29 unnamed `path: ../../references/` bare-directory citations in `metadata.yaml`'s
> `shared_references` block; those were fixed too ..., but are not separately guarded going forward,
> since they carry no filename to validate against and a directory-existence check on its own would be a
> much weaker, differently-shaped assertion than what the issue's own criterion describes.

**Superseded by this round's decision** (see "What changed" item 3 above): bare-directory citations are
now in scope and are now guarded, via the same widened pattern and the same `existsSync` predicate,
checking directory existence instead of file existence for that sub-shape. This is not asserted to be
retroactively "wrong" reasoning in Round 1 in isolation — a directory-existence check genuinely is a
different, narrower assertion than a file-existence check — but the sweep in this round shows the
narrower assertion is still a real, meaningful one, and Defect 1 is direct proof that skipping it lets a
genuinely dangling citation through silently. The remaining, still-true Known Limits from Round 1 (scope
carve-outs for manifests/licence/Python-test-decision/brand-removal-from-descriptions/install
verification, all deferred to #212; the five documents' intentionally scoped, non-exhaustive craft
coverage) are unchanged and still stand.

### Suite numbers

| Command | Round 1 | Round 2 |
|---|---|---|
| `npm test` | 3483 tests / 915 suites / 0 fail | **3488 tests / 915 suites / 0 fail** (delta: +5 tests, 0 new suites — all 5 new tests added inside the two already-existing `src/claude-skills/*.test.ts` describe blocks, no new file) |
| `npm run test:docs` | 349 tests / 92 suites / 0 fail | **349 tests / 92 suites / 0 fail** (unchanged — `reference-citation-guard.docs-test.ts` still has exactly 2 tests; only its assertions/messages/threshold changed, not its test count) |
| `openspec validate issue-252-craft-references --strict` | valid | **valid** (`Change 'issue-252-craft-references' is valid`) |
| `openspec validate --all --strict` | 66 passed, 0 failed | **66 passed, 0 failed** (same one change; no new change added) |

### Acceptance-criteria self-assessment — criterion 4, specifically

Issue #252's own 4th acceptance bullet: *"An automated check fails when any Skill cites a reference path
that does not resolve."*

| Sub-claim | Proof |
|---|---|
| The check exists, is pure where possible, disk-touches in exactly one place | Unchanged from Round 1: `src/claude-skills/reference-citation-scan.ts` (pure) + `reference-citation-guard.docs-test.ts` (the one disk-touching layer) |
| The check fires on ANY Skill citing a reference path that does not resolve — named OR bare-directory, with or without an intervening segment | Proven directly against the real, still-broken tree in Step A above (RED, both files named); proven fixed in Step C (GREEN); pinned permanently in `reference-citation-scan.test.ts`'s Defect-1-shape test (Step D) |
| The check is not merely written to look right, but demonstrated non-vacuous | Round 1's veo-3-1 hand-revert demonstration and QA's independent seedream-4-5 reproduction both still stand, untouched, for the named shape; this round adds the SAME non-vacuousness proof for the bare-directory and intervening-segment shapes specifically (the red->green transcript above, using the REAL two-file defect, not a synthetic one) |
| Against the real repository, the criterion now holds with no known exception | Confirmed live: `npm test` and `npm run test:docs` both green with the widened guard active against the real tree; the citation-shape sweep (above) found no fourth shape left unaccounted for |

Criterion 4 is now met against the real repository, not merely against the guard's own (now-widened)
self-definition — closing exactly the job-(c) gap QA's Round 1 Verdict identified.

### Files touched (Round 2, in addition to Round 1's list)

**Modified:**
- `.claude/skills/grok-imagine/metadata.yaml` (2 lines: `purpose:` sentence + `shared_references.path:`)
- `.claude/skills/grok-imagine-1-5/metadata.yaml` (2 lines: same shape)
- `src/claude-skills/reference-citation-scan.ts` (widened `CITATION_PATTERN`; updated doc comments)
- `src/claude-skills/reference-citation-scan.test.ts` (updated one pre-existing test to match the
  re-decided bare-directory behaviour; split one pre-existing test; added 5 new tests pinning the
  bare-directory and intervening-segment shapes, both at the `extractReferenceCitations` and
  `findDanglingReferenceCitations` layers)
- `src/claude-skills/reference-citation-guard.docs-test.ts` (updated the sanity-check threshold/message
  and the module doc-comment to describe the widened shape and this round's red->green proof; no new
  tests added — the existing two tests now exercise the widened corpus directly)
- `openspec/changes/issue-252-craft-references/specs/craft-references/spec.md` (widened both affected
  Requirements' headers/bodies; added one new Scenario to each, covering the intervening-segment /
  bare-directory shape against the real two-file defect)
- this `handoff.md` (this Round 2 Build Report block, appended)

### How to run (unchanged from Round 1, still accurate)

```bash
cd /Users/CaxtonTaylor/Developer/.og-worktrees/issue-252-craft-references

npm test                                                                  # full suite
npm run test:docs                                                        # the docs-test subset
node --import tsx --test src/claude-skills/*.ts                          # just this module (pure + docs-test)
node --import tsx --test src/claude-skills/reference-citation-guard.docs-test.ts   # just the disk-touching guard

openspec validate issue-252-craft-references --strict
openspec validate --all --strict
```

### Known limits (unchanged from Round 1, beyond the one supersession noted above)

Everything in Round 1's Known Limits not explicitly superseded above still stands: manifests, the
licence file, the Python test-vs-dependency decision, brand removal from Skill descriptions, and
end-to-end install verification remain out of scope, on #212; the five documents' craft coverage remains
intentionally scoped to what the eleven model-prompting Skills already assume, not a standalone
film-school text.

Ready for QA re-verification, Round 2.

## QA Verdict — Round 2: PASS

Verified at branch `issue-252-craft-references`, HEAD `5edf559`, worktree
`/Users/CaxtonTaylor/Developer/.og-worktrees/issue-252-craft-references`. `main` at `2b4c04d` locally
(`origin/main` one commit ahead at `3b17763`, the MIT licence, unrelated to this slice).

### Regression spot-check (Round 1 scope, not re-litigated)

`git diff 674b910..5edf559 --stat` touches exactly 7 files: the two grok `metadata.yaml` files, this
`handoff.md`, `craft-references/spec.md`, `reference-citation-guard.docs-test.ts`,
`reference-citation-scan.test.ts`, `reference-citation-scan.ts`. Independently confirmed:
- `git diff 674b910..5edf559 --stat -- .claude/references/` → empty. The five craft documents are
  byte-identical between rounds.
- `git diff 674b910..5edf559 --stat -- <the other 18 of the 20 previously-fixed SKILL.md/metadata.yaml
  files>` → empty. Nothing beyond the two grok `metadata.yaml` files was touched.
Criteria 1–3 and the document-quality judgement stand as passed in Round 1; not re-verified here.

### Suite result — green, actually run

| Command | Result |
|---|---|
| `npm test` | **3488 tests / 915 suites / 0 fail** — run myself, full transcript observed |
| `npm run test:docs` | **349 tests / 92 suites / 0 fail** — run myself |
| `openspec validate issue-252-craft-references --strict` | `Change 'issue-252-craft-references' is valid` |
| `openspec validate --all --strict` | **66 passed, 0 failed** |

**+5 delta verified as real, not a dropped test.** `git diff 674b910..5edf559 -- reference-citation-scan.test.ts \| grep -c '^+  it('` → 7; same for `'^-  it('` → 2. Net +5 matches the reported delta exactly — 5 new tests (bare-directory match; NAMED-with-intervening-segment match; bare-directory-only-prefix-when-filename-doesn't-match; dangling-resolves-to-existing-folder; the pinned Defect-1-shape regression test), 2 pre-existing tests renamed/rewritten in place (not counted as new), 0 tests removed. No new suite (all 5 land inside the two already-existing describe blocks) — matches the claim exactly.

### Per-criterion results

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Decide and record where the shared folder lives | PASS (unchanged from Round 1) | not re-verified, per scope instruction |
| 2 | Write the five documents, grounded, no brand content | PASS (unchanged from Round 1) | not re-verified, per scope instruction |
| 3 | Fix the citation depth so all 129 resolve | PASS (unchanged from Round 1) | no regression — confirmed via diff scope check above |
| 4 | An automated check fails when any Skill cites a reference path that does not resolve | **PASS** | see below — independently reproduced on files/shapes the developer did not use for their own demonstration |

**Criterion 4, independently reproduced myself (not the developer's own repro):**
- Named citation with an **intervening segment**, on `.claude/skills/nano-banana-2/SKILL.md`
  (`../../../qa-vendor/references/lighting.md`, a file/shape the developer never touched): guard fired,
  named the exact file, raw path, and resolved path. Restored byte-identical (`md5` before/after
  matched: `db6abeb9...`), `git status --short` clean, guard green again.
- Bare-directory citation pointing at a **nonexistent directory**, on `.claude/skills/kling-3-0/
  metadata.yaml` (changed its correct `../../references/` to a wrong-depth `../../../references/`,
  resolving to a nonexistent repo-root `references/` — a file/shape distinct from the developer's own
  `_shared/` demonstration): guard fired, named the file and the dangling `references` resolved path.
  Restored byte-identical (`md5` matched: `ba838b6d...`), guard green, `git status --short` clean.

Both fire. Both restores clean.

### Per-scenario results (`craft-references/spec.md`)

| Requirement | Scenario | Result | Covering evidence |
|---|---|---|---|
| Every shared-reference citation resolves, however shaped | issue #252's reproduction script finds zero broken | PASS | unchanged, no regression |
| " | SKILL.md-depth vs references/*.md-depth resolve to same path | PASS | unchanged, no regression |
| " | every references/*.md sibling file untouched | PASS | confirmed again this round, still empty diff |
| " | bare-directory citation with an intervening segment (the `_shared/` shape) caught dangling before fix, clean after | PASS | reproduced live in the Round 2 Build Report transcript (Step A/B/C) and independently by me on different files (nano-banana-2, kling-3-0) above |
| Automated check fails on dangling citation, named or bare-directory | guard passes against the real, fixed tree | PASS | `npm run test:docs` green, run myself |
| " | non-vacuous on hand-introduced broken NAMED citation | PASS | Round 1's veo-3-1/seedream-4-5 proofs still stand (files untouched this round) |
| " | catches bare-directory citation with intervening segment, the exact shape it originally missed | PASS | independently reproduced above on files the developer did not use |
| " | pure scanner unit-tested with zero disk access | PASS | `grep -n "node:fs\|readFile\|existsSync"` on both `reference-citation-scan.ts` and `.test.ts` returns only doc-comment mentions, no import, confirmed this round |

**Job-(c) closure confirmed.** Round 1's finding was that the spec's Requirement text narrowed itself to exactly the guard's own (too-narrow) regex, so it was green against itself but under-delivered the issue's unqualified 4th bullet. This round's spec-delta diff (`git diff 674b910..5edf559 -- specs/craft-references/spec.md`) shows both affected Requirements' headers and bodies rewritten to the wider shape, with two new Scenarios added directly against the real two-file Defect-1 case — no longer self-consistent-but-narrow; now matches the issue's plain-English ask.

### Threshold scrutiny (100 → 150)

What it asserts: `reference-citation-guard.docs-test.ts` asserts `citations.length >= 150` as a sanity
floor — guards against the corpus silently going to (near-)zero, which would make the "zero dangling"
assertion trivially, uselessly true.

Real corpus count, independently computed (own script, not trusting the Build Report): **162 total**
(129 named + 33 bare-directory). Breakdown independently verified and matches the developer's own:
129 named = 5 docs × (SKILL.md-depth + references/*.md-depth citations) across 44 files; 33
bare-directory = 11 `metadata.yaml` files × 2 occurrences each (`purpose:` sentence + `shared_references.
path:` field) + 11 `references/README.md` files × 1 occurrence each = 22 + 11 = 33. 129 + 33 = 162,
matches exactly.

150 is a real, meaningful floor: it would catch a regression that dropped either the named count back
toward 129 with the bare-directory sub-shape mostly wiped out, or dropped bare-directory matching
entirely (would land at 129, below 150) — i.e. it specifically protects the Round 2 widening from being
silently reverted or narrowed again, which is exactly what it needs to protect. It is not loosened to
hide a problem: raising it (from the old 100) required the widened regex to genuinely find 33 more real
citations, which I independently confirmed are all real (see next section), not padding.

**Could it be raised further without any test failing?** Yes — up to 161 (one below the real count of
162) without breaking anything today. This is not a defect (raising it would make the check *stronger*,
not weaker — the developer did not lower it to game a pass), but it is worth noting: the buffer is
tighter than Round 1's (129 vs a 100 floor was ~22% headroom; 162 vs a 150 floor is ~7.4% headroom). Not
a blocking issue, low-severity observation.

### Regex over-match check

Enumerated every distinct raw citation string the widened pattern actually matches across the real
`.claude/skills/` tree (own script, not the guard's own count): exactly **12 distinct raw path strings**
— the 5 named docs × 2 depths (`../../references/<name>.md`, `../../../references/<name>.md`) plus the
bare-directory pointer × 2 depths (`../../references/`, `../../../references/`). No noise: no URL, no
prose sentence, no code-sample path, no unrelated `references` mention was picked up. Separately
confirmed the two files with `.md`-adjacent "references" prose (`.claude/commands/build-issue.md`,
`.claude/commands/backup-media.md`) and the Python scripts' `references=` parameter usage are outside
`docs-test.ts`'s walked root (`.claude/skills/` only) and, in any case, do not match `CITATION_PATTERN`
(no `../` climb before the word). The 129→162 delta is accounted for in full: 33 new bare-directory
matches, 0 new named matches, 0 noise.

### Bare-directory assertion reality check

Confirmed the check is a real, specific-path assertion, not a trivially-true "does the repo exist" no-op:
in my own repro on `kling-3-0/metadata.yaml`, changing `../../references/` to (one `../` too many)
`../../../references/` made the citation resolve to a repo-root `references` directory that does not
exist — the guard correctly flagged it dangling, distinct from `.claude/references` which does exist and
is what a correctly-depthed citation resolves to. The assertion is against the specific resolved path,
not against "any directory," and it is exercised both ways (fails when wrong, passes when right).

### Corrected-claim check

Confirmed the Round 1 Build Report's incorrect "grok-imagine/grok-imagine-1-5 have no citation in their
metadata.yaml" claim is corrected in the Round 2 block ("Corrected claim" section) — read in full, states
plainly that the claim was factually incorrect and why. Confirmed Round 1's Build Report and my own Round
1 Verdict remain fully present, unmodified, above the Round 2 block in this file — appended, not
overwritten (`git diff 674b910..5edf559` for `handoff.md` is purely additive at the end of the file).

### Independent citation-shape sweep

Ran my own sweep, not the developer's: `grep -rlIn "references" .claude/` across the whole `.claude/`
tree (not just `skills/`) surfaced two files outside scope (`commands/build-issue.md`,
`commands/backup-media.md`) — both use "references" as an English word ("Blocked by references", "a
`path` it references"), no `../` path shape, confirmed not a citation. `.claude/agents/`, `.claude/
rules/`, `.claude/permissions/` — zero files mention "references" at all. A broader regex sweep
(`grep -rnoiE '(\.\./)+[a-zA-Z0-9_./-]*reference[a-zA-Z0-9_./-]*' .claude/skills/`) returns the exact
same 12 distinct strings as the pure-JS scan (one has a trailing `.` from a sentence's final punctuation,
not a distinct shape). **No fourth shape found**, independently, matching the developer's own sweep
conclusion.

### Always-rules + Magnific-fake checks

| Rule | Result | Evidence |
|---|---|---|
| Generate-never-publish | N/A / PASS | no production runtime path touched this round |
| Public-metrics-only | N/A / PASS | no metrics code touched |
| Relative-not-absolute | N/A / PASS | no scoring code touched |
| Explicit-attribution | N/A / PASS | no Post/Idea linking code touched |
| Ledger-as-source-of-truth | N/A / PASS | `git diff 674b910..5edf559 --name-only \| grep -iE "ledger\|queue\.json\|data/brands"` → empty |
| Magnific fake (no live Space) | PASS | `grep -rniE "spaces_\|creations_\|magnific" src/claude-skills/ .claude/skills/grok-imagine/metadata.yaml .claude/skills/grok-imagine-1-5/metadata.yaml` → empty; my own repro edits used only local file writes and `node --import tsx --test`, no MCP call of any kind |

### Defect list

None. No defects found this round.

### Overall

**PASS.** Defect 1 from Round 1 is genuinely fixed, not papered over: the guard now catches the real
`_shared/` shape (proven on the actual pre-fix two files in the developer's own transcript), and I
independently reproduced the same class of failure on two different files/shapes the developer never
touched, confirming the widening generalizes rather than being a point patch. The regex widening is
additive and non-narrowing (old named-file matches still match byte-for-byte; unused capture group
removal has no call site). The 150 threshold is a real, justified floor against the independently-
verified real count of 162, not a loosened check — though it has less headroom than Round 1's and could
be tightened further (low-severity observation, not a defect). The bare-directory check is a genuine,
specific-path assertion, exercised both failing and passing. No fourth citation shape exists in `.claude/`
beyond the three the developer enumerated, confirmed by my own independent sweep. The Build Report's
Round 1 factual error is corrected in place, and nothing in the file was overwritten — Round 1's content
and my Round 1 Verdict remain intact above this block. Suite green (3488/915/0, 349/92/0, both `openspec
validate` commands green), all run myself. Ready for PR.
