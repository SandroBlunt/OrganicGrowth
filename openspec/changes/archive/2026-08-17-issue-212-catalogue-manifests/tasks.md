## 1. Ground the slice before writing a line

- [x] 1.1 Read issue #212 in full, including both load-bearing comments posted 2026-08-17 (the Python
  split to #255; the brand-removal-already-done + `portable/`-packaging finding).
- [x] 1.2 Confirm the blocker (#211) is closed and re-derive the four already-settled criteria
  independently (grep for the 6 banned brand strings across all 11 Skill folders: zero hits, confirmed
  live) rather than trusting the issue body's claims.
- [x] 1.3 Read all 11 model-prompting Skills' `metadata.yaml` field-by-field to catalogue what already
  exists vs. what is genuinely missing (see `proposal.md`'s "What already exists" section) — confirmed
  `shared_references` already declares the dependency; confirmed `target_model`'s last key varies
  (`modalities` for 8, `front_ends` for `grok-imagine`/`seedream-4-5`/`seedream-5-0-pro`) and
  `model_id`/`model` varies (`grok-imagine` alone uses `model:` not `model_id:`).
- [x] 1.4 Independently confirm the `portable/` finding: `find . -iname "portable*"` and `git log --all
  --diff-filter=A -- '*portable*'` both return nothing, yet all 11 `references/README.md` files promise
  a `portable/<image|video>/<skill>/` variant.

## 2. Define and document the manifest format

- [x] 2.1 Write `docs/catalogue-manifest-format.md` — the full field list, which file each field lives
  in (`SKILL.md` frontmatter vs. `metadata.yaml`), the shared-reference dependency decision and its
  rejected alternatives, and the completeness guard's own required-field list.

## 3. Give all 11 model-prompting Skills a complete manifest

- [x] 3.1 Add `licence: MIT` and `owner: Sandro Franco` to all 11 `metadata.yaml` files (matching the
  root `LICENSE` file's own licence type and copyright holder).
- [x] 3.2 Add `fallbacks: []` to all 11 `target_model` blocks.
- [x] 3.3 Add `entities: { reads: [...], writes: [] }` to all 11 `metadata.yaml` files.
- [x] 3.4 Add `tools: [{ name: python3, kind: runtime-interpreter, required_for: [...] }]` to all 11
  `metadata.yaml` files — declarative only, no `.py` file touched.
- [x] 3.5 Add `evals: [{ path: scripts/test_build_prompt.py, method: unit-tests, purpose: ... }]` to all
  11 `metadata.yaml` files.
- [x] 3.6 Extend all 11 `shared_references` blocks with `required: true` and `install: copy-alongside`.
- [x] 3.7 Replace the false `portable/` promise in all 11 `references/README.md` files with the real,
  decided install mechanism, pointing at `docs/catalogue-manifest-format.md`.

## 4. Build the manifest-completeness guard, extending the existing dangling-citation guard

- [x] 4.1 `src/claude-skills/manifest-completeness-scan.ts` — pure: `parseSkillFrontmatter`,
  `parseLicenceFile`, `checkManifestCompleteness`, `findIncompleteManifests`; every required field from
  `docs/catalogue-manifest-format.md` checked; zero disk access in this module.
- [x] 4.2 `src/claude-skills/manifest-completeness-scan.test.ts` — pure, in-memory fixtures: one test per
  required field's missing/invalid case (name, version, licence, owner, purpose-too-short, name
  mismatch, entities.reads empty, entities.writes missing, tools malformed, target_model.vendor missing,
  target_model model-id missing, target_model.modalities empty, target_model.fallbacks missing,
  inputs/outputs empty, evals empty, shared_references.path/required/install missing or invalid), plus a
  "complete manifest passes" fixture built from a real entry's actual field shape.
- [x] 4.3 Extend `src/claude-skills/reference-citation-guard.docs-test.ts` with a new `describe` block:
  reads `LICENSE` plus every `.claude/skills/<entry>/{SKILL.md,metadata.yaml}` pair for every entry that
  has a `metadata.yaml`, asserts zero incomplete-manifest defects, and asserts the corpus-size floor
  (>= 11, justified against today's real count).
- [x] 4.4 **Prove the check fails, one field at a time, across several different fields.** Hand-mutate a
  real `metadata.yaml` (remove/corrupt `licence`, then `owner`, then `target_model.fallbacks`, then
  `entities.reads`, then `shared_references.install`), run the guard after each, observe RED naming
  exactly that field, restore, observe GREEN, confirm `git status` clean after each restore. Transcript
  in `handoff.md`.
- [x] 4.5 Do the same for the shared-reference dependency specifically: corrupt `shared_references.path`
  to point somewhere nonexistent, observe the EXISTING dangling-citation guard catch it (not the
  completeness guard — a wrong path is a dangling citation, not a missing field); separately, blank
  `shared_references.install`, observe the completeness guard catch that. Both transcripts in
  `handoff.md`.

## 5. Verify one entry's install into a genuinely clean checkout, end to end

- [x] 5.1 `src/claude-skills/install-catalogue-entry.ts` — pure `planInstall(metadata)` (all three
  `install` strategies handled) + thin `copyDirectoryRecursive` + `installCatalogueEntry` shell.
- [x] 5.2 `src/claude-skills/install-catalogue-entry.test.ts` — pure `planInstall` tests, zero disk
  access, all three strategies plus a malformed-metadata case.
- [x] 5.3 `src/claude-skills/install-catalogue-entry.docs-test.ts` — installs `veo-3-1` into a fresh
  `mkdtemp` directory (empty before the install, nothing else copied in), then re-runs the #252 pure
  citation scanner against the INSTALLED copy, asserting zero dangling citations there; cleans up the
  temp directory after.
- [x] 5.4 Add `src/claude-skills/install-catalogue-entry.ts` to `src/fs-boundary/allow-list.ts` with a
  stated reason; confirm the node:fs boundary guard passes (no stale/missing entries).
- [x] 5.5 Run the SAME install by hand once, outside the automated test, against a temp directory,
  capture the full transcript (directory listing before/after, every citation manually resolved) for
  `handoff.md`'s "result posted" requirement.

## 6. OpenSpec + self-review + Build Report

- [x] 6.1 Author `proposal.md`, this `tasks.md`, and the `skill-catalogue-manifest` spec delta (ADDED
  Requirements only — a new capability). Run `openspec validate --strict` until green.
- [x] 6.2 Run `npm test` (type-check + full suite) and `npm run test:docs`; confirm the delta over
  `main`'s baseline (3488/915/0) is exactly this change's own new tests, nothing else moved.
- [x] 6.3 Self-review / simplify pass: re-diff every touched file; confirm no `.py` file or Python-
  invoking `SKILL.md` section was touched; confirm the guard extension lives in the SAME file as #252's
  guard, not a new one; confirm every acceptance criterion maps to a specific test or file.
- [x] 6.4 Write the Build Report into `handoff.md`, including the install-verification result (for the
  Operator/`/build-issue` to post on issue #212 — posting itself is outside this agent's `gh` grant,
  which is read-only `gh issue view`).
