## 1. Ground the slice before writing a line

- [x] 1.1 Read issue #261 in full; confirm it is labeled `ready-for-agent` and carries no open "Blocked
  by" links.
- [x] 1.2 Read `src/claude-skills/manifest-completeness-scan.ts`, its test file, and
  `src/claude-skills/reference-citation-guard.docs-test.ts` (the sibling dangling-reference-citation
  guard from #252) to understand exactly what is and is not checked today.
- [x] 1.3 Read `docs/catalogue-manifest-format.md` for the full existing field list and the completeness
  guard's own documented scope.
- [x] 1.4 Inventory every real `.claude/skills/<entry>/metadata.yaml`'s `scripts[].path`, `evals[].path`,
  and `references[].path` values against disk — confirm all 11 real entries already resolve cleanly
  before writing any code (so the new check, once wired in, cannot immediately fail against `main`).
- [x] 1.5 Determine whether `shared_references.path` is genuinely covered by the sibling dangling-
  reference-citation guard, rather than assuming it: read that guard's citation-matching regex and reason
  about what corruption shapes it can and cannot recognise.

## 2. Extend the pure scanner

- [x] 2.1 Add an optional `pathExists?: (skillName, declaredPath) => boolean` to `ManifestCheckOptions` —
  the module stays pure; the predicate is the caller's disk access, not this module's.
- [x] 2.2 Give `scripts[].path` its own shape check (non-empty string) — it never had one; without it, an
  empty path would resolve vacuously (join with an empty string returns the entry's own directory, which
  always exists) and silently defeat the new existence check.
- [x] 2.3 Check `scripts[].path` and `evals[].path` existence via `pathExists`, independently of (and
  without weakening) the existing evals-cites-a-declared-script consistency check.
- [x] 2.4 Add the same shape + existence check for `references[].path` (decided in scope — see
  `proposal.md` §2).
- [x] 2.5 Add a direct existence check for `shared_references.path` (decided in scope after confirming the
  sibling guard's coverage is partial, not total — see `proposal.md` §2).

## 3. Prove every new check with pure, in-memory tests

- [x] 3.1 `manifest-completeness-scan.test.ts`: backward-compatibility test — no `pathExists` supplied,
  existing fixture paths (which exist nowhere on real disk) produce zero defects.
- [x] 3.2 Test: a `scripts[].path` failing `pathExists` is caught, isolated from its sibling script and
  from the evals cross-check.
- [x] 3.3 Test: an `evals[].path` failing `pathExists` is caught even when it still passes the existing
  scripts-consistency check (the exact "renamed script, eval still cites the dead name" shape).
- [x] 3.4 Test: the existing evals-cites-a-declared-script consistency check still fires on its own, with
  `pathExists` forced to always return `true` — proving the two checks are independent.
- [x] 3.5 Test: a `references[].path` failing `pathExists` is caught.
- [x] 3.6 Test: a `shared_references.path` failing `pathExists` is caught.
- [x] 3.7 Test: `pathExists` receives the real `skillName` alongside each declared path.

## 4. Wire the real guard's filesystem touch

- [x] 4.1 `reference-citation-guard.docs-test.ts`: supply `pathExists: (skillName, declaredPath) =>
  existsSync(join(SKILLS_ROOT, skillName, declaredPath))` in the manifest-completeness `describe` block's
  `ManifestCheckOptions`.
- [x] 4.2 Run the full docs-test suite; confirm it stays green against the real, unmodified 11-entry
  corpus (proves the inventory in 1.4 was correct).

## 5. Prove the check fails — live, separately for scripts[].path and evals[].path, plus the two extra fields

- [x] 5.1 Mutate a real `metadata.yaml`'s `scripts[0].path` to a nonexistent name (leaving its sibling
  scripts entry and its evals entry, which cites that sibling, untouched); run `npm run test:docs`;
  observe RED naming the entry and exactly `scripts[0].path`; restore byte-identically; confirm GREEN and
  a clean `git status`.
- [x] 5.2 On a DIFFERENT real entry (to keep the two proofs independent), mutate BOTH a `scripts[].path`
  entry AND the `evals[].path` entry citing it to the SAME nonexistent name (reproducing a renamed script
  with its eval left pointing at the dead name — internally consistent, existence-blind); run
  `npm run test:docs`; observe RED naming the entry, `scripts[N].path`, AND `evals[0].path`; restore
  byte-identically; confirm GREEN and a clean `git status`.
- [x] 5.3 On a third real entry, mutate a `references[0].path` to a nonexistent name; run
  `npm run test:docs`; observe RED naming the entry and exactly `references[0].path`; restore
  byte-identically; confirm GREEN and a clean `git status`.
- [x] 5.4 On a real entry, mutate `shared_references.path` to insert a bogus intervening segment before
  the literal `references/` segment (keeping the citation shape intact); run `npm run test:docs`; observe
  the EXISTING dangling-reference-citation guard (#252's own `describe` block, not the completeness one)
  fail, naming the citing file and raw path; restore byte-identically; confirm GREEN.
- [x] 5.5 On the same real entry, mutate `shared_references.path` so its literal `references` folder-name
  segment itself is renamed/mistyped (no longer matching the sibling guard's citation regex at all); run
  `npm run test:docs`; observe the dangling-reference-citation guard STAY GREEN (confirming the partial-
  coverage finding) while the completeness guard goes RED naming exactly `shared_references.path`;
  restore byte-identically; confirm both GREEN.
- [x] 5.6 Capture every transcript from 5.1–5.5 in `handoff.md`.

## 6. Document the decision

- [x] 6.1 Add `docs/catalogue-manifest-format.md`'s "Path-shaped fields: existence, not just consistency"
  section: which fields gained the check and why, which were deliberately left out and why, and the
  `shared_references.path` seam-gap finding.
- [x] 6.2 Update the doc's existing "Required for completeness" and "deliberately left to type/presence
  checks only" lists so they no longer contradict the new section (the old `shared_references.path`
  "deliberately not value-checked" bullet is now false and is removed/replaced).

## 7. OpenSpec + self-review + suite

- [x] 7.1 Author `proposal.md`, this `tasks.md`, and the `skill-catalogue-manifest` spec delta (one
  MODIFIED Requirement — the guard, extended — plus one ADDED Requirement — the other-fields decision).
  Run `openspec validate --strict` until green.
- [x] 7.2 Run `npx tsc -p tsconfig.json --noEmit`, then `npm test` (type-check + full suite including
  `.docs-test.ts`); confirm the delta over `main`'s baseline is exactly this change's own new tests,
  nothing else moved.
- [x] 7.3 Self-review / simplify pass: re-diff every touched file; confirm `.claude/skills/` itself is
  untouched in the final diff (only hand-mutated and restored during the live proofs, never left
  modified); confirm every acceptance criterion maps to a specific test or a specific live transcript.
- [x] 7.4 Write the Build Report into `handoff.md`.
