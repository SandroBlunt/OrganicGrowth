# Official guidelines — ChatGPT Image 2 (gpt-image-2)

Distilled summary of the OpenAI prompt guidance for `gpt-image-2`. Any
rule below that conflicts with the latest official source MUST be
treated as stale; the source URL is the canonical reference.

## Source

- **URL:** https://developers.openai.com/api/docs/models/gpt-image-2
- **Fetched at:** 2026-04-27
- **Vendor:** OpenAI

## Headline points (distilled)

- The model accepts text prompts and reference images (single for I2I,
  multiple for MR-style edits).
- Supported aspect ratios include 1:1, 3:2, 2:3, 16:9, 9:16, and 4:5.
- A negative-prompt parameter exists for short exclusion lists; it is
  not a substitute for positive description.
- Text rendering inside the image is supported and intentional; quote
  the exact string in the prompt.
- Spatial-relationship instructions are honoured for small object counts;
  reference images are the recommended path for layout-heavy
  compositions.

## Strengths called out by the source

- Instruction-following on counts and arrangement.
- In-image text rendering for short strings.
- Style-transfer fidelity when a reference image is provided.
- Iterative editing with stable subject identity in I2I.

## Caveats called out by the source

- Negation is best-effort; positive descriptions are recommended.
- Long prompts may underperform shorter focused ones.
- Likeness of named living people, brand logos, and protected
  characters is restricted by the moderation layer.
- Skin and face rendering defaults toward smoothed; explicit realism
  tokens are recommended for photographic intent.

## Mapping to this skill

| Source guidance | Skill location |
| --- | --- |
| Positive over negative | `references/translation-notes.md` § Negation behaviour |
| In-image text rendering | `references/translation-notes.md` § Text rendering |
| Reference roles in MR | `SKILL.md` § Mode 3 — Multi-reference edit |
| Aspect-ratio support | `SKILL.md` § Inputs the consuming agent provides |
| Realism on faces | `references/translation-notes.md` § Skin and faces |

## Audit and verification

- **Last reviewed:** 2026-04-27.
- **Verification cadence:** re-fetch and diff this file's source URL on
  every minor or major version bump of the skill.
- **Vendor unconfirmed assertions:** none in this file. The mix-budget
  heuristic does not apply to gpt-image-2.
