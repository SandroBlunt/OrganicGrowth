## Why

Issue #212 ("The catalogue ships") has four criteria already settled and out of scope here: the shared
reference folder recovery (#252, merged), the MIT `LICENSE` file (merged), the Python test-vs-dependency
decision (split to #255), and the brand-removal half of "installs and runs without the Operator's brand
baked in" (already zero-hit, verified again below). This change builds the **remaining four**:

1. Define and document a manifest format for a catalogue entry.
2. Give all 11 model-prompting Skills a complete manifest.
3. Extend the existing dangling-reference-citation guard (`src/claude-skills/reference-citation-
   guard.docs-test.ts`, #252) so it also fails on an incomplete manifest — one guard, two checks, not a
   second guard.
4. Verify one entry's install into a genuinely clean checkout, end to end.

### What already exists (read before designing anything, per the issue's own instruction)

All 11 model-prompting Skills' `metadata.yaml` files already carry: `name`, `version`, `disclosure_tier`,
`created`/`updated`, `domain_path`, `variant`, `target_model` (`vendor` + `model_id`/`model` +
`modalities`, sometimes `api_id`/`front_ends`/`sibling_model`), `modes`, `inputs`, `outputs`, `scripts`
(with `purpose`), `references` (with `purpose`), `source_tracking` (`official_guidelines_url`,
`additional_sources`, `fetched_at`), and — the important one — a `shared_references` block
(`mode: relative-link`, `path: ../../references/`) that **already declares the shared-reference
dependency this ticket's brief worried was undeclared**. Each `SKILL.md` also already carries a YAML
frontmatter `name` (matching `metadata.yaml`'s) and a substantial `description` (359–817 characters
across the 11, measured directly) that is, in substance, the catalogue entry's **purpose**.

So the manifest is not built from nothing: it is **`SKILL.md` frontmatter (`name`, `description`) +
`metadata.yaml` (everything else)** — the two files a Claude Skill already ships — formalized and
completed, not a third, parallel file. What is genuinely missing, confirmed by reading all 11
`metadata.yaml` files field-by-field: `licence`, `owner`, `entities` (reads/writes), `tools` (the
runtime a script needs, as distinct from the script path itself), `target_model.fallbacks`, `evals`, and
two missing keys on the existing `shared_references` block (`required`, `install`) that turn "here is
the path" into "here is what an installer must do about it."

### A finding the issue did not have: the packaging fix it worries about is already half-broken today, in a way `.claude/references/` itself doesn't fix

Every one of the 11 `references/README.md` files ends with a promise:

> For a fully standalone copy of this skill, use the `portable/image/<name>/` variant, which duplicates
> the shared references into its own `references/` folder.

**No `portable/` directory exists anywhere in this repository** — confirmed with `find . -iname
"portable*"` returning nothing, and `git log --all` showing no trace either. This is not the #252 bug
(a citation that matches the scanner's `references/` pattern and dangles) — `portable/image/<name>/`
contains no `references/` segment, so #252's guard cannot see it — but it is the **exact same class of
problem** the issue's own comment-2 finding describes: a Skill's own documentation promises a resolution
to the shared-dependency problem that isn't actually there. Left alone, a licensee who read this sentence
and went looking for a `portable/` variant would find nothing, same as the 129 dangling citations before
#252. Fixed here (see "What Changes" §4) — not by building 11 vendored `portable/` copies (see the
vendoring trade-off below), but by replacing the false promise with the actual, decided install
mechanism.

## What Changes

### 1. The manifest format: `SKILL.md` frontmatter + `metadata.yaml`, formalized and completed

Documented at `docs/catalogue-manifest-format.md`. A catalogue entry's manifest is the union of:

- **`SKILL.md` frontmatter** — `name` (must equal `metadata.yaml`'s `name`) and `description` (the
  entry's **purpose** — no separate, second `purpose` field is added to `metadata.yaml`, because a
  second free-text field describing the same thing is a drift risk with no offsetting benefit; the
  guard cross-checks length and name-equality instead of duplicating the text).
- **`metadata.yaml`**, with these fields now REQUIRED (existing fields kept as-is; new fields marked
  **NEW**):
  - `name`, `version` (semver) — existing.
  - **NEW** `licence` — an SPDX id; must equal the repository's own `LICENSE` file's licence type (`MIT`
    today), cross-checked by the guard so the two can never quietly drift apart.
  - **NEW** `owner` — must equal the `LICENSE` file's own copyright holder, same cross-check reasoning.
  - `target_model` (existing: `vendor`, `model_id`/`model`, `modalities`) plus **NEW** `fallbacks: []`
    — an explicit, always-present array. All 11 entries declare `fallbacks: []` (empty, not omitted):
    these are single-vendor prompt-authoring Skills; a fallback model is a Producer/Recipe-level runtime
    decision (`docs/adr/0003`, `docs/adr/0007`), not something a prompting Skill itself owns. Declaring
    `[]` explicitly is honest; omitting the field would be indistinguishable from "nobody thought about
    it," which is exactly the gap this criterion exists to close.
  - **NEW** `entities` — `reads` (this entry's own `references/*.md` plus the shared
    `../../references/*.md`) and `writes` (`[]` — every one of these 11 Skills emits a `prompt` string
    only; none of them downloads, saves, or mutates a file).
  - **NEW** `tools` — the runtime a declared script needs (`python3`, today), distinct from the script
    path itself (`scripts:`, unchanged). Declarative only — this change does not touch any `.py` file or
    any Python-invoking `SKILL.md` section; the Python runtime-dependency decision itself is #255's.
  - `inputs`/`outputs` (existing) — formalized as the manifest's **config** (a catalogue entry's typed
    invocation contract); no new field, since duplicating this as a second "config" block would be the
    same drift risk as a second purpose field.
  - `scripts`, `references`, `source_tracking` — existing, unchanged.
  - **NEW** `evals` — points at the entry's own `scripts/test_build_prompt.py` (already declared under
    `scripts:`, already 244 passing tests total across the 11 per #255's own count), naming it as this
    entry's evaluation method (`unit-tests`) rather than leaving "how was this judged" implicit.
  - `shared_references` (existing `mode`, `path`) plus **NEW** `required: true` and **NEW**
    `install: copy-alongside` — see §2.

### 2. The shared-reference dependency: decided as installer-side copy-alongside, not vendoring

Three options were on the table (per the issue's own framing): the installer copies `.claude/references/`
alongside the entry; each entry vendors its own copy; or the entry declares the dependency and refuses to
run without it. **Decision: installer-side copy-alongside.** Argued:

- **Vendoring multiplies 5 documents by 11 entries into 55 duplicated files that will drift** the moment
  any one of the five shared documents is corrected (exactly the maintenance cost #252's own module doc
  was written to avoid by keeping the five documents "exactly once in the repository"). It also
  contradicts the very reasoning the (nonexistent) `portable/` variant's own promised text used to
  justify NOT vendoring by default ("This layout keeps the `code/` variant compact: the five shared files
  exist exactly once in the repository").
- **"Declare and refuse to run"** is strictly worse than copy-alongside for a licensee: it converts a
  packaging gap into a runtime failure discovered only after installation, instead of a install-time step
  that prevents the gap from existing at all.
  it is a straightforward, mechanical, and — the point of this change's fourth criterion — **verifiable**
  step: copy two directories, preserving their existing relative depth (`shared_references.path`, e.g.
  `../../references/`, keeps resolving correctly precisely because the depth between the copied skill
  folder and the copied shared folder is preserved).

Recorded on `shared_references.install: copy-alongside` in every entry's own `metadata.yaml`, so the
decision travels with the manifest rather than living only in this prose.

### 3. Every `references/README.md`'s false `portable/` promise is replaced with the real, decided mechanism

All 11 `.claude/skills/<skill>/references/README.md` files' closing paragraph (which promises a
`portable/<image|video>/<skill>/` variant that has never existed in this repository) is replaced with a
short paragraph stating the actual install mechanism (copy the skill folder and `.claude/references/`
together, preserving relative depth) and pointing at `docs/catalogue-manifest-format.md`. No other
content in any of these 11 files changes.

### 4. An automated check fails when a catalogue entry has an incomplete manifest — extending the existing guard, not building a second one

`src/claude-skills/manifest-completeness-scan.ts` (pure, new): parses a `SKILL.md`'s frontmatter and a
`metadata.yaml`'s content (both already-read strings — no disk access in this module, exactly
`reference-citation-scan.ts`'s own shape) and returns every missing/invalid manifest field, given the
expected licence/owner strings as parameters (so the pure function is provably correct against fixtures,
independent of what today's real `LICENSE` file happens to say).

`src/claude-skills/reference-citation-guard.docs-test.ts` (extended, not duplicated): a new `describe`
block reads the real `LICENSE` file plus every `.claude/skills/<entry>/{SKILL.md,metadata.yaml}` pair for
every entry that HAS a `metadata.yaml` (the existing structural signal that already distinguishes the 11
model-prompting Skills from the 5 workflow Skills — no hard-coded name list to go stale), hands them to
the pure scanner, and asserts zero incomplete-manifest defects. This is the same file the dangling-
citation guard already lives in, now checking two things instead of one — literally "extend that guard,"
per the issue's own instruction.

**Corpus-size sanity check, justified against the real corpus, not picked arbitrarily:** the guard
asserts at least 11 catalogue entries are found (today's exact count — a lower threshold would tolerate a
future entry silently vanishing from the walk; a higher one would break the moment a legitimate 12th
entry lands, which is exactly backwards for a floor check). The `purpose` length check
requires at least 100 characters — the real corpus's shortest `description` today is 359 characters
(`chatgpt-image-2`), so 100 is under a third of the real minimum, comfortably clear of every real entry
while still catching a genuine placeholder (`"Generates prompts."` is 19 characters).

**Proven non-vacuous, not merely written to look right** (this epic's own standing lesson, and this
ticket's own explicit demand): one field at a time, across several different fields (`licence`, `owner`,
`target_model.fallbacks`, `entities.reads`, `shared_references.install`), a real `metadata.yaml` is
mutated to remove or corrupt that one field, the guard is run and observed red naming exactly that
field, the file is restored, and the guard is re-run and observed green — transcript in this change's
`handoff.md`.

### 5. One entry installed into a genuinely clean checkout, verified end to end

`src/claude-skills/install-catalogue-entry.ts` (new): a pure `planInstall(metadata)` (decides what to
copy from an already-parsed `metadata.yaml` object — no disk access, unit-tested against all three
`install` strategies) plus a thin, disk-touching `installCatalogueEntry(...)` shell that copies the named
entry's whole `.claude/skills/<entry>/` folder, and — because every real entry's `install` is
`copy-alongside` — the shared `.claude/references/` folder, into a destination directory.

`src/claude-skills/install-catalogue-entry.docs-test.ts` (new): installs `veo-3-1` into a **freshly
created `mkdtemp` directory** — genuinely empty before the install, containing nothing else, not a
subfolder of this repository — then re-runs the SAME pure citation scanner from #252
(`extractAllReferenceCitations` / `findDanglingReferenceCitations`) against the INSTALLED copy's own
files, asserting zero dangling citations there too. This is the permanent, automated form of "installing
one entry into a clean checkout works" — proving the packaging fix holds, not just narrating that it once
worked by hand. The one-off, by-hand transcript (using the OS temp directory directly, `cat`-ing the
installed tree, and manually confirming every citation resolves) is captured in this change's
`handoff.md`, per the issue's own "result posted" requirement.

`src/fs-boundary/allow-list.ts` gains one new entry (`src/claude-skills/install-catalogue-entry.ts`) with
a stated reason — a real filesystem-copy utility, the same class already represented by
`src/media-backup/copy.ts`, not a domain store or an existing port.

## Impact

- **Added:** `docs/catalogue-manifest-format.md`; `src/claude-skills/manifest-completeness-scan.ts` (+
  `.test.ts`); `src/claude-skills/install-catalogue-entry.ts` (+ `.test.ts`, `.docs-test.ts`).
- **Modified:** all 11 `.claude/skills/<entry>/metadata.yaml` (new fields, listed above);
  all 11 `.claude/skills/<entry>/references/README.md` (closing paragraph only — the `portable/` fix);
  `src/claude-skills/reference-citation-guard.docs-test.ts` (new `describe` block, same file);
  `src/fs-boundary/allow-list.ts` (one new entry).
- **Untouched:** every `.py` file; every `SKILL.md` prose section that invokes a Python script; the five
  `.claude/references/*.md` documents from #252; the 5 workflow Skills (`fetch-curated-source`,
  `produce-character-explainer`, `produce-news-carousel`, `produce-news-short-script`,
  `write-social-copy`) — out of scope by the issue's own text; every production runtime module.
- **Hermetic.** No live Magnific/Apify/Zoho call, no `spaces_*`/`creations_*`, no credits — this slice
  touches only `.claude/skills/` documentation and metadata, `docs/`, and new, pure/thin
  `src/claude-skills/` modules whose only disk access is reading/copying plain text and YAML files. The
  `developer` agent is not given the `magnific` MCP tools.
- **Out of scope (settled elsewhere):** the shared reference folder recovery and its guard (#252,
  merged); the MIT `LICENSE` file (merged); the Python test-vs-dependency decision (#255); the eight
  workflow Skills that restate npm scripts (out of scope by the parent issue #211's own text).
