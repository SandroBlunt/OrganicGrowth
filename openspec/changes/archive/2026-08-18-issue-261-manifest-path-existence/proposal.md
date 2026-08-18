## Why

`src/claude-skills/manifest-completeness-scan.ts` cross-checks each catalogue entry's `evals[].path`
against that entry's own declared `scripts[].path` set — but it never checks that either path exists on
disk. A manifest can declare a script that was renamed or deleted, with its eval pointing at the same
dead name, and the guard stays green because the two are consistent WITH EACH OTHER — consistency is all
it measures today.

This is the third instance of the same shape of bug in this catalogue: #252 (129 citations pointed at
five craft-reference documents that had never been committed), #212 (all 11 `references/README.md` files
promised a `portable/` folder absent from disk and from all of git history), and now this one, found
latent while QA-ing #255's 22-script Python→TypeScript rename across 11 manifests. Nothing broke that
time — QA hand-verified all 22 paths manually — but nothing would have caught it if one had been missed.
Each time, a document described something that was never there, and nothing noticed. The guard built to
catch that class does not check existence — the one property that would have caught all three.

## What Changes

### 1. `scripts[].path` and `evals[].path` are checked for existence, in addition to (never instead of) the existing consistency check

`manifest-completeness-scan.ts`'s `ManifestCheckOptions` gains an OPTIONAL `pathExists(skillName,
declaredPath) => boolean` predicate. The module stays pure — it never touches disk itself, mirroring
`reference-citation-scan.ts`'s own pure/impure split — but when a caller supplies `pathExists`, every
declared `scripts[].path` and `evals[].path` is checked against it. The pre-existing evals-cites-a-
declared-script consistency check is kept, unweakened, and now runs alongside the new existence check:
both are needed, because they catch different errors (a well-formed path naming the wrong thing, vs. a
well-formed, correctly-named path that no longer exists). The real guard
(`reference-citation-guard.docs-test.ts`) always supplies a `pathExists` backed by `existsSync`, resolved
against each entry's own real `.claude/skills/<entry>/` directory.

`scripts[].path` itself also gains a shape check it never had before (a non-empty-string requirement,
mirroring the one `evals[].path` already had): an empty path would otherwise resolve — vacuously — to the
entry's own directory itself (which always exists), silently defeating the new check.

### 2. Two additional path-shaped fields decided in scope: `references[].path` and `shared_references.path`

The issue asks: "decide whether other path-shaped manifest fields deserve the same treatment... say which
you covered and which you deliberately did not, with reasons." Two fields were investigated and brought
into scope, two were investigated and deliberately left out (see `docs/catalogue-manifest-format.md`'s
new "Path-shaped fields" section for the full record):

- **`references[].path`** (this entry's own reference documents, e.g. `references/translation-notes.md`)
  — brought in scope. No other guard watches it: the dangling-reference-citation guard's regex only
  matches a `(../)+(<segment>/)*references/(<name>.md)?`-shaped CLIMBING citation, and a same-directory
  `references/<name>.md` value (what every real entry's own reference citation looks like) never
  satisfies that shape. Without this, a renamed/deleted own-reference document would have been invisible
  to every guard in this repository.
- **`shared_references.path`** — the issue names this as "already has a sibling guard" and explicitly
  asks that claim to be confirmed, not assumed, "since a gap living in the seam between two individually-
  correct guards is a documented failure mode here (#235, #238)." Confirmed live, with a genuine finding:
  the dangling-reference-citation guard DOES catch a value corrupted to the wrong climb depth or carrying
  a bogus intervening segment (its regex still recognises the citation shape) — but it CANNOT catch a
  value whose literal `references` folder-name segment is itself mistyped or renamed, because such a
  value no longer matches the citation shape the guard's regex scans for at all. That IS exactly the
  documented seam-gap failure mode the issue warned about. Closed by adding a direct existence check for
  `shared_references.path` in `manifest-completeness-scan.ts` too, layered on top of (not instead of) the
  sibling guard's own, broader citation walk.

**Deliberately NOT given an existence check, with reasons** (also recorded in the doc): `tools[].required_for`
(every real entry declares `tools: []` today, per issue #255 — no live data to check, and the field has
no shape validation of its own yet either); `entities.reads`/`entities.writes` (glob-shaped, not a single
literal path — any literal, named citation their real values contain is already walked by the dangling-
reference-citation guard's own corpus-wide scan); `domain_path` (a categorisation label, not a filesystem
path); `source_tracking`'s URLs (external, never a path into this repository's own tree).

### 3. Proven non-vacuous, live, for every new check — restored byte-identically each time

Per the issue's own "prove the check fails" instruction, each new check is proven live: a real
`metadata.yaml` is hand-mutated so a declared path no longer resolves, the guard is run and observed RED
naming the entry and the exact field, the file is restored byte-identically, and the guard is re-run and
observed GREEN with a clean `git status`. Done separately for a `scripts[].path` case (an isolated
mutation) and an `evals[].path` case (a script "renamed" — its own `scripts[].path` AND the `evals[].path`
citing it both repointed to the same dead name, staying mutually consistent but no longer resolving —
the exact near-miss shape #255 could have produced), plus `references[].path` and both halves of the
`shared_references.path` finding (the sibling guard catching a wrong-depth corruption; the sibling guard
NOT catching a renamed-segment corruption, and the new direct check catching it). Transcripts in this
change's `handoff.md`.

## Impact

- **Modified:** `src/claude-skills/manifest-completeness-scan.ts` (new optional `pathExists` on
  `ManifestCheckOptions`; existence checks for `scripts[].path`, `evals[].path`, `references[].path`,
  `shared_references.path`; a new shape check for `scripts[].path`); `src/claude-skills/manifest-
  completeness-scan.test.ts` (new pure, in-memory tests for every new check, plus a test proving the
  existing consistency check stays independent); `src/claude-skills/reference-citation-guard.docs-test.ts`
  (wires a real `pathExists` backed by `existsSync` into the manifest-completeness `describe` block —
  the ONE new filesystem touch this guard gains); `docs/catalogue-manifest-format.md` (new "Path-shaped
  fields" section recording the full field-by-field decision).
- **Untouched:** every real `.claude/skills/<entry>/{SKILL.md,metadata.yaml,references/*,scripts/*}` file
  — all 11 real catalogue entries' declared paths already resolve (confirmed before writing any code), so
  no manifest content changes; the pre-existing evals-cites-a-declared-script consistency check's own
  logic; the dangling-reference-citation guard (#252) itself, unmodified — only newly confirmed, live, to
  be a partial (not total) cover for `shared_references.path`; the 5 workflow Skills (out of scope, no
  `metadata.yaml`); every production runtime module.
- **Hermetic.** No live Magnific/Apify/Zoho call, no `spaces_*`/`creations_*`, no credits — this slice
  touches only `.claude/skills/` metadata (read-only in the shipped code path; hand-mutated and restored
  only during this change's own live proof, never left mutated), `docs/`, and pure/thin
  `src/claude-skills/` modules. The `developer` agent is not given the `magnific` MCP tools and does not
  need them for this filesystem/manifest-only slice.
