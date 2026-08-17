## 1. Ground the slice before writing a line

- [x] 1.1 Read issue #252 in full, including the investigation it records (the depth-inconsistency
  finding the parent ticket #212 did not have) and the reproduction script it supplies.
- [x] 1.2 Confirm #212 (parent) exists and this slice's own scope (craft references + citation fix +
  guard) is split cleanly from #212's remaining scope (manifests, licence, brand removal, Python
  decision, install verification) — no blocker issue is open for #252 itself.
- [x] 1.3 Re-derive the measured scope from scratch with the issue's own reproduction script, rather
  than trust the issue body's numbers — confirmed 129 broken citations (72 at the deeper
  `references/*.md` depth already resolving correctly to `.claude/references/` once it exists, 57 at the
  shallower `SKILL.md`/`metadata.yaml` depth needing a one-level depth fix), matching the issue exactly.
- [x] 1.4 Read all eleven model-prompting Skills' `SKILL.md` and `references/*.md` files end-to-end,
  cataloguing every place they cite or assume the five shared documents' content (the cross-model
  five/six-clause skeletons, "name the light" language, named-tradition style-anchor sections, word
  budgets, negation behaviour) so the five documents are grounded, not invented.
- [x] 1.5 Locate any existing Recipe-level craft rule the new documents must stay consistent with
  (`produce-news-carousel`'s reserved-frame/real-media phrasing, the real-source-imagery rule, likeness/
  identity-drift handling) and confirm none of it is restated or duplicated by this change.

## 2. Write the five shared craft-reference documents

- [x] 2.1 `.claude/references/prompt-discipline.md` — the cross-model skeletons, explicit-vs-left-to-
  model guidance, the over-specification anti-pattern, word budgets, the style-anchor concept, negation/
  exclusion defaults, reference-image role-naming discipline, and the emit-vs-defer principle.
- [x] 2.2 `.claude/references/cinematography.md` — shot size, camera position, camera movement, lens
  choice as a storytelling decision, and how to write the combined camera clause.
- [x] 2.3 `.claude/references/lighting.md` — direction, quality, motivation, named setups, colour
  temperature, and how to write the combined light clause.
- [x] 2.4 `.claude/references/photography.md` — exposure, depth of field, composition, photographic
  stock/process as a style anchor, texture/material rendering.
- [x] 2.5 `.claude/references/production-design.md` — set/location, wardrobe, props, colour, period and
  place, named-tradition style anchors, cross-sequence consistency, and a grounding note that explicitly
  defers real-person depiction policy to each model's own usage policy.
- [x] 2.6 Grep the five finished documents for brand content (`organicgrowth`, `straw motion`,
  `mundotip`, `unhypped`, and OrganicGrowth-specific domain terms like Idea/Producer/Fit Score) —
  confirmed clean.

## 3. Fix the citation depth so all 129 (and all 158) citations resolve

- [x] 3.1 Rewrite `../../../references/` to `../../references/` in every `.claude/skills/<skill>/
  SKILL.md` (11 files) and `.claude/skills/<skill>/metadata.yaml` (9 files that carry the citation) —
  path characters only, no other text touched.
- [x] 3.2 Confirm every `.claude/skills/<skill>/references/*.md` file (`README.md`, `translation-
  notes.md`, `official-guidelines.md`) is left byte-for-byte untouched — its existing depth already
  resolves correctly once `.claude/references/` exists.
- [x] 3.3 Re-run issue #252's own reproduction script: 0 broken citations (down from 129).
- [x] 3.4 Run the broadened check (including the unnamed `path: ../../references/` directory citations
  in `metadata.yaml`'s `shared_references` block and its README pointer sentence): 0 broken (down from
  158 total citations, 29 of which were the unnamed-directory shape outside the issue's own 129 count).
- [x] 3.5 Confirm via `git diff --stat` that only the 20 shallow-depth files changed, and only by the
  expected line count (one changed line per citation).

## 4. Build the automated dangling-reference-citation guard

- [x] 4.1 `src/claude-skills/reference-citation-scan.ts` — pure functions: `extractReferenceCitations`/
  `extractAllReferenceCitations` (parse `(../)+references/<name>.md` citations from file content,
  resolved against the citing file's own directory) and `findDanglingReferenceCitations` (pure set-
  difference against a caller-supplied `pathExists` predicate — no disk access in this module).
- [x] 4.2 `src/claude-skills/reference-citation-scan.test.ts` — pure, in-memory unit tests: path
  resolution at both citing depths (including the exact pre-fix bug shape), citation extraction,
  dangling detection, and a non-vacuousness proof (a hand-introduced broken citation is caught, then
  removing it restores green) — all with zero disk I/O.
- [x] 4.3 `src/claude-skills/reference-citation-guard.docs-test.ts` — the one place this guard touches
  disk: walks every real `.claude/skills/**/*.md` and `*.yaml` file, asserts every citation resolves via
  `existsSync`, and asserts a non-trivial citation count (guards against a guard that silently finds
  nothing) and that all five shared documents are cited at least once.
- [x] 4.4 **Live-proved the guard fires, not merely written to look right**: hand-appended a citation to
  a nonexistent file to `.claude/skills/veo-3-1/SKILL.md`, ran the guard, observed it fail naming
  exactly that citation; removed the line, ran the guard again, observed it pass, and confirmed via
  `git status`/`git diff` the file was restored byte-identical to its fixed state.

## 5. OpenSpec + self-review + Build Report

- [x] 5.1 Author `proposal.md`, this `tasks.md`, and the `craft-references` spec delta (ADDED
  Requirements only — a new capability). Run `openspec validate --strict` until green.
- [x] 5.2 Run `npm test` (type-check + full suite) and confirm the delta over `main`'s baseline is
  exactly the new guard's own tests, no unrelated change.
- [x] 5.3 Self-review / simplify pass: re-diff every touched file, confirm no craft-reference document
  restates a Recipe-level rule, confirm the guard module has no dead code and its two layers (pure scan
  vs. disk-touching guard) stay cleanly split, confirm every acceptance criterion in the issue maps to a
  specific test or a specific, checked file.
- [x] 5.4 Write the Build Report into `handoff.md`.
