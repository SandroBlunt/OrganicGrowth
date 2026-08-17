# The `.claude/skills/` catalogue manifest format

Issue #212 ("The catalogue ships"). This document defines what a **complete manifest** means for one
catalogue entry under `.claude/skills/` — today, the 11 model-prompting Skills
(`chatgpt-image-2`, `grok-imagine`, `grok-imagine-1-5`, `happy-horse`, `kling-3-0`, `kling-3-0-omni`,
`nano-banana-2`, `seedance-2-0`, `seedream-4-5`, `seedream-5-0-pro`, `veo-3-1`). The eight workflow Skills
that merely restate npm scripts (`fetch-curated-source`, `produce-character-explainer`,
`produce-news-carousel`, `produce-news-short-script`, `write-social-copy`, and three more counted in
issue #211's own body) are out of scope by the parent issue's own text — they carry no `metadata.yaml`
and are not catalogue entries.

## The manifest is two files, not a third one

A catalogue entry already ships two files: `SKILL.md` (read by Claude Code directly — its YAML
frontmatter plus prose instructions) and `metadata.yaml` (structured facts about the entry). Rather than
invent a third, parallel manifest file that would immediately drift from these two, **the manifest is the
union of both**:

| Field | Lives in | Notes |
|---|---|---|
| `name` | `SKILL.md` frontmatter **and** `metadata.yaml` | the two SHALL be equal — checked, not just written twice by convention |
| `version` | `metadata.yaml` | semver, e.g. `0.2.1` |
| `licence` | `metadata.yaml` (**new**) | an SPDX id; must equal the repository's own `LICENSE` file's licence type |
| `owner` | `metadata.yaml` (**new**) | must equal the repository's own `LICENSE` file's copyright holder |
| `purpose` | `SKILL.md` frontmatter's `description` | already exists, substantial (359–817 characters measured across the 11 entries) — no second, duplicate field added to `metadata.yaml` |
| entities it reads / writes | `metadata.yaml`'s `entities.reads` / `entities.writes` (**new**) | see below |
| its tools | `metadata.yaml`'s `tools` (**new**) | the runtime a declared script needs, distinct from the script path itself |
| its model and fallbacks | `metadata.yaml`'s `target_model` (existing) plus `target_model.fallbacks` (**new**) | see below |
| its config | `metadata.yaml`'s `inputs` / `outputs` (existing) | the entry's typed invocation contract; formalized as "config," no new field |
| its evals | `metadata.yaml`'s `evals` (**new**) | points at an existing `scripts:` test entry |
| its scripts / references / source tracking | `metadata.yaml`'s `scripts` / `references` / `source_tracking` (existing) | unchanged |
| its shared-reference dependency | `metadata.yaml`'s `shared_references` (existing `mode`/`path`, **new** `required`/`install`) | see "The shared-reference dependency" below |

**Why no duplicate `purpose` field.** `SKILL.md`'s frontmatter `description` already IS the entry's
purpose — every one of the 11 already carries a substantial one. Adding a second, free-text `purpose`
field to `metadata.yaml` describing the same thing would be a second source of truth for one fact, with
no offsetting benefit and a real drift risk (the two texts could say different things after one file is
edited and the other isn't). The completeness guard checks `SKILL.md`'s `description` directly (length,
non-empty) and cross-checks the two files' `name` fields for equality instead.

**Why `inputs`/`outputs` are the "config," not a new field.** Same reasoning: these two lists already ARE
a catalogue entry's typed configuration surface (what it accepts, what it returns). A parallel `config:`
block restating the same shape would be the identical drift risk.

## `entities` — what a catalogue entry reads and writes

Every one of these 11 Skills is a pure text-in / text-out prompt translator: it reads craft-reference
prose and returns a `prompt` string. It never downloads, saves, or mutates a file on disk.

```yaml
entities:
  reads:
    - references/*.md          # this entry's own model-specific reference documents
    - ../../references/*.md    # the shared craft-reference documents (see shared_references below)
  writes: []
```

`writes: []` is present, not omitted — an omitted `writes:` key is indistinguishable from "nobody thought
about it"; an explicit empty array states plainly that this entry writes nothing.

## `tools` — the runtime a script needs

`scripts:` already names each script's file path and purpose. `tools:` is a separate declaration of what
runtime that script needs to execute — today, `python3`, for every one of the 11 entries' two scripts
(`build-prompt.py`, `test_build_prompt.py`):

```yaml
tools:
  - name: python3
    kind: runtime-interpreter
    required_for: [scripts/build-prompt.py, scripts/test_build_prompt.py]
```

This is declarative metadata only — issue #212's own brief is explicit that no `.py` file and no
`SKILL.md` section that invokes one is touched by this change; the Python test-vs-runtime-dependency
decision (port to TypeScript, dropping the `python3` runtime dependency entirely) is issue #255's, tracked
separately. Once #255 lands, this `tools` block becomes `[]` for every entry — a follow-up to that
change, not this one.

## `target_model.fallbacks` — declared explicitly, empty is a real answer

```yaml
target_model:
  vendor: google
  model_id: veo-3.1
  modalities: [...]
  fallbacks: []
```

All 11 entries declare `fallbacks: []`. These are single-vendor prompt-authoring Skills — if the Producer
needs a fallback model when a Space call fails, that is a Producer/Recipe-level runtime decision
(`docs/adr/0003`, `docs/adr/0007`), not something a prompting Skill itself owns or could sensibly declare
(it would have to invent a false equivalence between, say, Veo 3.1 and Kling 3.0's very different
modality lists). Declaring `[]` explicitly — rather than omitting the field — is the honest answer: the
manifest states there is no fallback at this layer, instead of leaving the question unanswered.

## `evals` — what proves the entry works

```yaml
evals:
  - path: scripts/test_build_prompt.py
    method: unit-tests
    purpose: >
      Proves build-prompt.py assembles a valid prompt across every declared mode before it is
      trusted to emit one.
```

Points at the entry's own existing `scripts/test_build_prompt.py` (already declared under `scripts:`) —
issue #255 counted 244 passing tests across the 11 entries' worth of these files. No new test content is
added by this change; `evals` names what already runs and passes.

## The shared-reference dependency

Every one of the 11 entries' `SKILL.md`/`references/*.md` cites five shared craft-reference documents at
`.claude/references/` — one level **outside** the entry's own folder (`../../references/` from `SKILL.md`,
`../../../references/` from a `references/*.md` sibling). A Skill folder alone contains only `SKILL.md`,
`metadata.yaml`, `references/`, and `scripts/` — copying just that folder into another project reproduces
the exact bug #252 fixed, this time for whoever installs it.

`shared_references` already existed (`mode: relative-link`, `path: ../../references/`) — it already
DECLARED the dependency. What it did not say is what an install must DO about it. Two new fields:

```yaml
shared_references:
  mode: relative-link
  path: ../../references/
  required: true
  install: copy-alongside   # one of: copy-alongside | vendored | refuse-without
```

### The decision: `copy-alongside`, and why the alternatives were rejected

Three real options:

1. **The installer copies `.claude/references/` alongside the entry.** *(chosen)* A licensee installing
   `veo-3-1` gets `.claude/skills/veo-3-1/` AND `.claude/references/`, in the same relative layout this
   repository already uses — so the entry's own existing citations resolve unchanged, with zero edits.
2. **Each entry vendors its own copy of the five shared documents.** *Rejected.* This multiplies 5
   documents by 11 entries into 55 duplicated files. The moment any one of the five shared documents is
   corrected (a craft-reference fix, a new technique added), all 11 vendored copies silently go stale —
   the exact maintenance cost #252's own module doc was written to avoid by keeping the five documents
   "exactly once in the repository." It is also, concretely, the mechanism the (never-built, now-removed)
   `portable/` promise in every entry's `references/README.md` claimed to offer — see below.
3. **The entry declares the dependency and refuses to run without it.** *Rejected as the sole answer* —
   it is strictly worse for a licensee than option 1: it converts a packaging gap into a runtime failure
   discovered only after installation, instead of an install-time step that prevents the gap entirely.
   (`refuse-without` remains a legitimate value in the `install` enum for a hypothetical future entry that
   genuinely cannot ship its dependency any other way — `planInstall`, below, handles it — but no entry
   uses it today.)

### A finding this ticket did not know about: the packaging fix it worries about was already half-promised, and the promise was never kept

Every one of the 11 `references/README.md` files ended with:

> For a fully standalone copy of this skill, use the `portable/image/<name>/` variant, which duplicates
> the shared references into its own `references/` folder.

**No `portable/` directory has ever existed in this repository.** This change replaces that false promise
in all 11 files with the real, decided mechanism (copy the entry and `.claude/references/` together,
preserving their relative depth) and a pointer back to this document.

### The install tool

`src/claude-skills/install-catalogue-entry.ts` implements the decision: a pure `planInstall(metadata)`
function decides what to copy for a given entry's declared `install` strategy (all three values handled,
even though only `copy-alongside` is used today), and a thin `installCatalogueEntry(...)` shell performs
the actual copy. `src/claude-skills/install-catalogue-entry.docs-test.ts` proves it end to end: installs
`veo-3-1` into a freshly created, genuinely empty temporary directory (never a subfolder of this
repository), then re-runs the #252 citation scanner against the installed copy, asserting zero dangling
citations there too — the permanent, automated form of "installing one entry into a clean checkout
works."

## The completeness guard

`src/claude-skills/manifest-completeness-scan.ts` (pure) checks a `(SKILL.md content, metadata.yaml
content)` pair against every field above, given the expected licence/owner strings as parameters.
`src/claude-skills/reference-citation-guard.docs-test.ts` (the SAME file #252 landed the dangling-citation
guard in — extended, not duplicated) walks every `.claude/skills/<entry>/` directory that has a
`metadata.yaml`, reads the real `LICENSE` file, and asserts zero incomplete-manifest defects across all
11 real entries.

**Required for completeness (every one asserted, every one proven to fail when missing — see this
change's `handoff.md` for the red/green transcripts):**

- `name` (non-empty) and `version` (semver) in `metadata.yaml`; `name` equal to `SKILL.md`'s own frontmatter `name`
- `licence` (non-empty, equal to `LICENSE`'s licence type)
- `owner` (non-empty, equal to `LICENSE`'s copyright holder)
- `purpose` — `SKILL.md`'s frontmatter `description`, at least 100 characters (justified below)
- `entities.reads` (non-empty array) and `entities.writes` (present, may be empty)
- `tools` (present; each item, if any, has non-empty `name` and `kind`)
- `target_model.vendor` (non-empty), `target_model.model_id` or `target_model.model` (at least one
  non-empty — `grok-imagine` alone uses `model:` rather than `model_id:`), `target_model.modalities`
  (non-empty array), `target_model.fallbacks` (present array, may be empty)
- `inputs` (non-empty array) and `outputs` (non-empty array)
- `evals` (non-empty array, each item naming a non-empty `path`)
- `shared_references.path` (non-empty), `shared_references.required` (boolean), `shared_references.install`
  (non-empty, one of `copy-alongside` / `vendored` / `refuse-without`)

**Threshold justification (the brief's own demand — never leave a number unjustified).** The `purpose`
length floor is 100 characters. Measured directly against the real corpus at authoring time, the
shortest `description` across all 11 entries is 359 characters (`chatgpt-image-2`) — 100 is under a
third of that real minimum, comfortably clear of every real entry, while still catching a genuine
placeholder (`"Generates prompts."` is 19 characters, well under 100). The corpus-size floor is **at
least 11** catalogue entries found by the walk — today's exact count, chosen as a floor (not an exact
equality) so a legitimate future 12th entry does not break the guard, while a walk that silently finds
fewer than today's real count (a directory-discovery bug, a botched merge) still fails loudly.
