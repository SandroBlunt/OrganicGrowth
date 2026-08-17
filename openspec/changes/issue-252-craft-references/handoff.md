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
