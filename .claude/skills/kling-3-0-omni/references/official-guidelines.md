# Official guidelines — Kling 3.0 Omni

Distilled summary of the Kling 3.0 Omni source page and vendor doc.
Any rule below that conflicts with the latest official source MUST be
treated as stale.

## Sources

- **Vendor doc — Kling 3 Omni prompting guide:**
  `Kling 3 omni prompting guide.md` (Kling AI Official Documentation
  via NotebookLM export).
- **Prior URL (legacy):**
  https://replicate.com/kwaivgi/kling-v3-omni-video
- **Fetched at:** 2026-04-28
- **Vendor:** Kuaishou (Kling Omni)

## Headline points (distilled, 2026-04-28)

- **All-in-One Reference 3.0:** images, videos, elements, and text are
  all treated as prompts. Free combination of any modality.
- **Video Character Reference (3–8 s).** Upload or record a 3–8 s
  character video; the model extracts core character traits and the
  original voice. Multi-angle clips recommended.
- **Voice binding to elements.** Voice tone can be bound to a
  character element so the same character speaks consistently across
  videos and scenes.
- **Multi-image character elements with voice.** Up to 4 images per
  element + 5–30 s voice recording.
- **Multi-Shot up to 15 seconds.** Custom Multi-Shot lets you set
  per-shot duration, framing, angle, narrative content, and camera
  movement.
- **Native audio output** is supported (this supersedes earlier docs
  that listed Omni as audio-input only).
- **MR cap:** up to 7 mixed inputs total. With a video provided, up
  to 4 images / elements may also be uploaded (1 video + ≤4
  images/elements ≤ 5 total). Without a video, up to 7 images / elements.
- **F/L mode** accepts two reference frames.
- **Aspect ratios:** 16:9 and 9:16.
- **Supported input materials:** up to 7 images (≥300 px W/H, ≤10 MB,
  JPG/JPEG/PNG); 1 video (3–10 s, ≤200 MB, ≤2K).

## Strengths called out by the source

- Multi-modal reference handling (images + video + optional audio).
- Strong V2V style transfer when role is constrained to one or two of
  {subject identity, motion source, style source}.
- Aspect-ratio honouring is precise.
- Native audio output with character-bound voice tone for cross-video
  consistency.
- Multi-Shot up to 15 s with per-shot timing control.

## Caveats called out by the source

- The 7-input cap is hard.
- Per-modality caps inside the 7-input budget are not published — the
  mix-budget heuristic in `references/translation-notes.md` is the
  field-experience workaround and is **vendor-unconfirmed**.
- When a video is provided, total image+element count drops to ≤4.
- Negation is best-effort.

## Mapping to this skill

| Source guidance | Skill location |
| --- | --- |
| 7-input MR cap | `SKILL.md` § Mode 4 — Multi-reference |
| V2V role constraint | `SKILL.md` § Mode 3 — Video-to-video |
| Video Character Reference (3–8 s) | `SKILL.md` § Mode 3 § Video Character Reference; `references/translation-notes.md` § Video Character Reference |
| Voice binding | `SKILL.md` § Voice binding; `references/translation-notes.md` § Voice binding |
| Multi-Shot up to 15 s | `SKILL.md` § Multi-Shot |
| Native audio output | `SKILL.md` § Voice binding § Dialogue attribution; `references/translation-notes.md` § Native audio synthesis |
| Mix-budget heuristic (vendor-unconfirmed) | `references/translation-notes.md` § Mix-budget heuristic |

## Audit and verification

- **Last reviewed:** 2026-04-28.
- **Verification cadence:** re-fetch the vendor doc on every minor or
  major version bump.
- **Vendor unconfirmed assertions:** the per-modality mix-budget
  heuristic (max 2 video; min 3 images when any video; max 1 audio).
  These are field-experience defaults and may be superseded by future
  official guidance.
