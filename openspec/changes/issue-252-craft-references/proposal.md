## Why

#212 ("The catalogue ships") is blocked, in part, by a citation bug in the eleven model-prompting
Skills under `.claude/skills/`: every one of them cites five shared craft-reference documents —
`prompt-discipline.md`, `cinematography.md`, `lighting.md`, `photography.md`, `production-design.md` —
as the layer to read *before writing a prompt for the first time*. **These documents were never
committed.** `git log --all --diff-filter=A` finds no trace of them anywhere in history, and the
Operator has confirmed they do not exist elsewhere either. Every one of the 129 citations that name a
specific document therefore dangles today.

#212 bundles this recovery with manifests, a licence, brand removal from Skill descriptions, a Python
test-vs-dependency decision, and end-to-end install verification. This change (#252) is the first half,
split out because the craft-reference authoring is substantial writing on its own and every
model-prompting Skill in the catalogue depends on it landing first.

### The investigation this change does not repeat

Issue #252's own body records a finding the parent ticket (#212) did not have: all 129 citations use a
`../../../references/` prefix, but the citing files sit at two different depths relative to the shared
folder:

| Citing file | Resolves to (before this change) | Count |
|---|---|---|
| `.claude/skills/<skill>/references/*.md` (`README.md`, `translation-notes.md`, `official-guidelines.md`) | `.claude/references/` | 72 |
| `.claude/skills/<skill>/SKILL.md`, `metadata.yaml` | repo-root `references/` | 57 |

Creating one folder at either location fixes at most 72 of the 129 — the other 57 need their citation
DEPTH corrected, not just a target folder created. Both facts, re-measured on this branch before any
edit, matched the issue body exactly (129 total, split 72/57, all 129 broken by the issue's own
reproduction script).

## What Changes

### 1. The five shared craft-reference documents are written, at `.claude/references/`

`.claude/references/{prompt-discipline,cinematography,lighting,photography,production-design}.md` are
authored from scratch. `.claude/references/` is the chosen location — it sits alongside `skills/`,
`agents/`, and `commands/` in the same Claude Code configuration tree, and it is already what the
majority (72 of 129) of citations resolve to, so fixing the citation depth (below) rather than the
target minimizes the blast radius of the fix.

Each document is grounded in what the eleven model-prompting Skills already assume, established by
reading all eleven `SKILL.md` files and their `references/*.md` documents before writing a line, never
invented independently:

- **`prompt-discipline.md`** (33 citations, the most cited): the cross-model five-clause skeleton
  (Subject / Action / Setting / Style / Camera-framing-light) every still-image Skill applies, its
  six-clause video extension (adding a Motion/beat clause) every video Skill applies — including an
  explicit statement that a model's own `translation-notes.md` may override the default clause order
  when its vendor guidance calls for it (Veo 3.1 leads with cinematography instead of subject; this is
  named as the documented exception, never silently contradicted), what to state explicitly vs. leave to
  the model, the over-specification anti-pattern, word-budget guidance, the style-anchor concept, default
  negation/exclusion behaviour, and reference-image role-naming discipline.
- **`cinematography.md`** (22): shot size, camera position, camera movement, and lens choice as
  storytelling decisions — the vocabulary every Skill's "Camera / framing / light" clause draws on.
- **`lighting.md`** (22): direction, quality, and motivation, plus named setups (three-point, high/low-key,
  chiaroscuro, silhouette) and colour temperature — matching the "name the light and it delivers" /
  "place the light" language several Skills already use verbatim.
- **`photography.md`** (22): exposure, depth of field, composition, photographic stock/process as a style
  anchor, and texture/material rendering.
- **`production-design.md`** (30): sets, wardrobe, props, colour, period and place, and named-tradition
  style anchors — the register several Skills' own "Production design anchors" sections already point at
  (Veo's "Christopher Nolan grounded, IMAX 70mm," Seedance's "Tsui Hark Wuxia").

**No brand content.** None of the five documents names OrganicGrowth, Straw Motion, MundoTip, or any
Format voice — confirmed by a direct grep of the finished documents. #212's own criterion (a Skill must
install and run without the Operator's brand baked in) makes these documents the most likely place for
that to leak, so this is checked directly, not merely intended.

**Consistent with, never contradicting, an existing Skill-stated craft rule.** Where a Recipe-level Skill
(e.g. `produce-news-carousel`) already states a specific craft rule — its placeholder-frame / reserved-
frame phrasing for real-media slides, its real-source-imagery rule for grounded subjects, its likeness/
identity-drift handling — that rule is Recipe-specific and lives where it already lives; this change
neither restates nor duplicates it. `production-design.md`'s own "Grounding note" and "Named-tradition
style anchors" sections were written to be consistent with, not overlapping, that existing rule: general
craft guidance to name real, specific detail when it's available, with an explicit statement that this
document sets no policy of its own on depicting real, identifiable people (that is a model usage-policy
question, stated in each Skill's own `translation-notes.md`, and takes precedence).

### 2. The citation depth is fixed so all 129 (and all 158, including the unnamed directory
   citations) resolve

Every `.claude/skills/<skill>/SKILL.md` and `.claude/skills/<skill>/metadata.yaml` (the 11 + 9 files
that carry a `../../../references/...` citation at the shallower depth) is rewritten to
`../../references/...` — removing exactly one `../` level, so the citation resolves to
`.claude/references/` instead of overshooting to a repo-root `references/` that was never created and
is not this change's chosen location. **Every `.claude/skills/<skill>/references/*.md` file
(`README.md`, `translation-notes.md`, `official-guidelines.md`) is left untouched** — its existing
`../../../references/...` citation already resolves correctly to `.claude/references/` once that folder
exists, because those files sit one directory deeper than `SKILL.md`/`metadata.yaml`. No other content
in any of these 20 files is touched.

### 3. An automated check fails when a Skill cites a reference path that does not resolve

`src/claude-skills/reference-citation-scan.ts` (a pure deep module: extract every
`(../)+references/<name>.md` citation from a source file's content, resolve it against that file's own
directory, exactly mirroring issue #252's own reproduction script) plus
`src/claude-skills/reference-citation-guard.docs-test.ts` (the one place this guard touches disk: walks
`.claude/skills/**/*.md` and `*.yaml`, and asserts every citation's resolved path exists) land this
change — this is #212's own "an automated check fails when a catalogue entry has ... a dangling
reference link" acceptance criterion, landed here, before the manifest half of #212, exactly as #212
calls for.

**Proven non-vacuous, not merely written to look right.** Before being committed, a citation to a
nonexistent file was hand-appended to `.claude/skills/veo-3-1/SKILL.md`, the guard was run and observed
to fail, naming exactly that one dangling citation; the line was then removed and the guard was re-run
and observed green again, byte-identical to the fixed file. See this change's `handoff.md` Build Report
for the exact commands and captured output.

## Impact

- **Added:** `.claude/references/{prompt-discipline,cinematography,lighting,photography,production-design}.md`
  (5 new files, ~600 lines of craft-reference prose); `src/claude-skills/reference-citation-scan.ts`,
  `src/claude-skills/reference-citation-scan.test.ts`,
  `src/claude-skills/reference-citation-guard.docs-test.ts`.
- **Modified:** the 11 `.claude/skills/<skill>/SKILL.md` files and 9 `.claude/skills/<skill>/metadata.yaml`
  files that carried a `../../../references/...` citation at the shallower depth — citation-path
  characters only, no other prose touched.
- **Untouched:** every `.claude/skills/<skill>/references/*.md` file (its own citation already resolved
  correctly); the eight workflow Skills and three Recipe/curated-source Skills outside the eleven
  model-prompting Skills; every existing craft rule stated in a Recipe-level Skill.
- **Hermetic.** No live Magnific/Apify/Zoho call; no `magnific` MCP tool used; this slice touches no
  production runtime path, only `.claude/` documentation and one new, pure test-suite module.
- **Out of scope (stays on #212):** manifests, the licence, the Python test-vs-dependency decision,
  brand removal from Skill descriptions, and end-to-end install verification.
