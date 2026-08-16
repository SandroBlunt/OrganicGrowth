# Official guidelines — Kling 3.0

Distilled summary of the Kling 3.0 vendor docs and prompt guidance.
Any rule below that conflicts with the latest official source MUST be
treated as stale.

## Sources

- **Vendor doc — Kling 3 prompting guide:** Kuaishou (Kling); fetched
  from `Kling 3 prompting guide.md` (vendor reference doc bundle).
- **Pro Prompting Manual:** distilled from eleven primary sources (the
  official Kling 3.0 user guide via DataCamp, fal.ai's API prompting
  guide, ImagineArt's 5-layer template, Travis Nicholson's styles
  compendium, Glif's 6-element framework, VEED's motion-intensity &
  negative-prompt system, Alici.ai's production-workflow guide,
  Leonardo.ai's 4-element foundation, Atlabs.ai's testing guide,
  Klingaio's physics-based motion fixes, and the Klingmotioncontrol UI
  tutorial).
- **Prior URL (legacy, now superseded):**
  https://klingaio.com/blogs/kling-3-release
- **Fetched at:** 2026-04-28
- **Vendor:** Kuaishou (Kling)

## Headline points (distilled, 2026-04-28)

- **Multi-shot is core.** Up to 6 shots per generation; total duration
  3–15 seconds; Auto and Custom Multi-Shot modes.
- **Native audio.** Dialogue (with quoted lines and speaker
  attribution), multi-character coreference (3+), five languages
  (Chinese, English, Japanese, Korean, Spanish), dialects and accents.
- **Element binding.** Each element accepts 1–3 reference images;
  multiple elements per scene; per-character voice binding.
- **First-and-last frame.** Two anchor frames; renders the beat
  between them. Start frame required before End frame can be set.
- **Aspect ratios:** 16:9, 9:16, 1:1, 4:5.
- **Hard limits (UI):** prompt length up to ~2,500 characters;
  duration 3–15 s; max 6 shots in Custom Multi-Shot; max 3 reference
  images per element; Start/End Frame ≤10 MB JPG/PNG.
- **Negative prompt** — separate field, NOT counted in the 2,500-char
  budget.
- **Motion intensity** — explicit 0.1–1.0 scalar.
- **On-image text** preserved well through motion (Kling strength).

## Strengths called out by the source

- Strong dynamic motion physics on continuous beats.
- Painterly and stylised aesthetics hold up better than peers.
- Aspect-ratio honouring is precise.
- Shot-reverse-shot dialogue and multi-character coreference.
- On-image text/logo preservation.

## Caveats called out by the source

- Ultra-close beauty/skin detail less reliable.
- Multiple subjects with simultaneous complex actions cause tracking
  drift.
- Numerical specifics ("5 of X") unreliable below the model's count
  threshold.
- Physics-defying actions fight the model.
- Long-prompt dilution past the per-shot budget; multi-shot prompts
  should keep each shot concise.

## Mapping to this skill

| Source guidance | Skill location |
| --- | --- |
| Multi-Shot (Auto / Custom) | `SKILL.md` § Mode 5 — Multi-Shot |
| Element binding (1–3 per element) | `SKILL.md` § Mode 3 — Multi-reference, element binding |
| Start frame + element reference | `SKILL.md` § Mode 2 — Image-to-video |
| F/L | `SKILL.md` § Mode 4 — First-and-last frame |
| Native audio (dialogue, dialects, multilingual) | `SKILL.md` § Audio mode; `references/translation-notes.md` § Native audio is supported |
| Motion intensity (0.1–1.0) | `SKILL.md` § Motion intensity; `references/translation-notes.md` |
| Negative prompt (separate field) | `SKILL.md` § Negative prompt; `references/translation-notes.md` |
| Physics-based motion fixes | `SKILL.md` § Physics-based motion; `references/translation-notes.md` |

## Audit and verification

- **Last reviewed:** 2026-04-28.
- **Verification cadence:** re-fetch the vendor docs on every minor or
  major version bump.
- **Vendor unconfirmed assertions:** none. The Pro Prompting Manual's
  Style Bibles are observed-strong patterns rather than vendor-
  documented features; treat as field guidance.
- **Source-tracking:** see `metadata.yaml.source_tracking` for the
  list of vendor doc paths and fetch date.
