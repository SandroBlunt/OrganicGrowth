# Official guidelines — Nano Banana 2

Distilled summary of Google's prompt guidance for Nano Banana 2 (Gemini
3.1 Flash Image) and Nano Banana Pro (Gemini 3 Pro Image). Any rule
below that conflicts with the latest official source MUST be treated
as stale.

## Sources

- **Primary URL (Google Cloud blog):**
  https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana
- **Vendor doc — Gemini API Image Generation Guide:**
  `Nano_Banana_2_and_Pro_Gemini_API_Image_Generation_Guide.md`
  (Google AI Developer Documentation, ai.google.dev).
- **Vendor doc — DeepMind Prompt Construction Guide:**
  `Nano_Banana_DeepMind_Prompt_Construction_Guide.md`.
- **Fetched at:** 2026-04-28
- **Vendor:** Google (Google Cloud blog + Google AI / DeepMind)

## Available models

| Friendly name | API ID | Optimized for |
| --- | --- | --- |
| Nano Banana 2 | `gemini-3.1-flash-image-preview` | Speed and high-volume tasks |
| Nano Banana Pro | `gemini-3-pro-image-preview` | Professional asset production with advanced reasoning |
| Nano Banana | `gemini-2.5-flash-image` | Efficiency and low-latency workflows (legacy generation) |

## Headline points (distilled, 2026-04-28)

- **Describe the scene, don't just list keywords.** Narrative
  descriptive paragraphs outperform disconnected word lists.
- **Lead with the subject; cinematography and light tokens come last.**
- **Reference images** carry strong signal — variant-aware caps:
  - Gemini 3.1 Flash: up to 10 objects + 4 characters (14 total).
  - Gemini 3 Pro: up to 6 objects + 5 characters (14 total).
- **Frame-sequence workflow** is supported as a first-class mode for
  preparing keyframes that hand off to a downstream video model.
- **Aspect ratios:** 1:1, 1:4, 1:8, 2:3, 3:2, 3:4, 4:1, 4:3, 4:5, 5:4,
  8:1, 9:16, 16:9, 21:9.
- **Resolutions:** 512 (Flash only), 1K (default), 2K, 4K.
- **Thinking Mode:** `thinkingLevel` `minimal` (default) or `High`;
  optional `includeThoughts`. Thinking tokens billed regardless of
  visibility.
- **Grounding via Google Search:** Web Search (Flash + Pro), Image
  Search (Flash only).
- **SynthID watermark** on every output; user cannot opt out.
- **Material specificity** is the single largest quality lever after
  the lighting description.
- **Aspect-ratio honouring** is precise across the supported set.

## Strengths called out by the source

- Naturalistic photography, especially environmental portraits and
  product hero shots.
- Composition fidelity for moderately complex scenes.
- Subject-identity preservation across an ordered frame set.
- Legible stylised text rendering (Gemini 3 family).
- Multi-turn conversational editing.

## Caveats called out by the source

- Negation is best-effort.
- Default palette skews warm.
- Repeated identical objects drift past small counts.
- Long-prompt dilution past roughly 130 words.
- Transparent backgrounds not supported (use white background and
  composite later).
- Prohibited Use Policy applies; user must hold rights to inputs.

## Mapping to this skill

| Source guidance | Skill location |
| --- | --- |
| Lead with subject, narrative prose | `SKILL.md` § Mode 1 — Text-to-image |
| Reference images for specific subjects | `SKILL.md` § Mode 2, Mode 3 |
| Variant-aware ref caps | `SKILL.md` § Reference image caps; `references/translation-notes.md` |
| Frame-sequence as first-class mode | `SKILL.md` § Mode 4 — Frame-sequence |
| Thinking Mode | `SKILL.md` § Thinking Mode; `references/translation-notes.md` |
| Grounding via Google Search | `SKILL.md` § Grounding; `references/translation-notes.md` |
| Aspect ratio expanded | `SKILL.md` § Aspect ratios; `references/translation-notes.md` |
| 512 resolution (Flash) | `SKILL.md` § Resolutions; `references/translation-notes.md` |
| SynthID watermark | `SKILL.md` § SynthID; `references/translation-notes.md` |
| Prohibited Use Policy | `SKILL.md` § Prohibited Use Policy |
| Material specificity | `references/translation-notes.md` § Material specificity |
| Warm palette default | `references/translation-notes.md` § Palette default |
| Repetition limits | `references/translation-notes.md` § Repetition limit |

## Audit and verification

- **Last reviewed:** 2026-04-28.
- **Verification cadence:** re-fetch on every minor or major version
  bump.
- **Vendor unconfirmed assertions:** none. The mix-budget heuristic
  does not apply here.
