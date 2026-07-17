# Translation notes — Kling 3.0 Omni

Model-specific rules for Kling 3.0 Omni that override the cross-model
defaults in `../../../references/prompt-discipline.md`.

## Multi-modal MR up to 7 inputs

- MR accepts up to seven mixed inputs: any combination of images and
  short reference clips (and audio, where the API tier supports it).
- Total ≤ 7. The build script enforces this hard cap.
- **When a video is provided**, the documentation caps the combined
  image+element count at 4 (i.e. 1 video + ≤4 images = 5 total).
  Without a video, up to 7 images / elements may be uploaded.

## Mix-budget heuristic (vendor-unconfirmed)

The official source documents the overall 7-input cap but does not
publish a per-modality cap inside that budget. The following heuristic
reflects field experience and is **vendor-unconfirmed**; verify against
the latest official docs before relying on it for production work.

Heuristic:

- **Cap video clips at 2.** Beyond 2 video references, motion sources
  conflict and produce visible blending.
- **If any video is present, image count must be ≥ 3.** Images carry
  stable identity that grounds the video references; less than 3 →
  identity drift.
- **Audio inputs (if accepted by API tier): cap at 1.** Multiple audio
  references blend into noise.
- The build script raises a validation error when the heuristic is
  violated. Pass `override_mix_budget=True` (CLI:
  `--override-mix-budget`) to bypass; the override is recorded in the
  assembled prompt and in the Observability Checkpoint rationale.

This heuristic may change between releases. Re-verify on every minor
or major version bump.

## V2V role naming

- V2V mode accepts a single short reference clip. The clip's role MUST
  be named: subject identity, motion source, or style source.
- One or two roles per call; not all three. Naming all three
  over-constrains the model and produces uncanny composites.

## Video Character Reference (Omni's headline upgrade)

- Upload a 3–8 s video of a character. The system extracts both the
  visual likeness and the native voice tone.
- **Multi-angle is recommended** (front, ¾, profile). Single-angle
  clips lock the model to that angle's lighting and pose; multi-angle
  gives the model a rotational understanding of the character.
- The extracted voice can be replaced with a separate clean voice
  recording when the source audio is noisy.

## Voice binding

- Voice tone can be bound to a character element so the same character
  speaks consistently across videos and shots. Two routes:
  1. Video Character Reference (extracts both appearance and voice).
  2. Multi-image character element + 5–30 s clean voice recording
     (recommended: low background noise, moderate speech speed,
     neutral consistent emotion).
- **Once bound, do not re-specify voice tone in the prompt body for
  that character.** Re-specifying over-constrains the model and
  produces uncanny output. The build script can flag this when both a
  voice-bound element and an in-prompt voice-tone descriptor for that
  character are present.

## Native audio synthesis

Omni supports native synthesized audio (the previous "no audio
synthesis output" claim is **obsolete**):

- Dialogue with quoted lines and speaker attribution.
- Multi-character coreference.
- Five languages (Chinese, English, Japanese, Korean, Spanish);
  out-of-set languages auto-translate to English.
- Dialects and accents.
- Ambient and SFX (physics-derived audio is the highest-leverage
  approach: describe surface and material).

## Multi-Shot

- Same Multi-Shot system as Kling 3.0: Auto and Custom; up to 6 shots
  per generation; total duration up to 15 s.
- Per-shot durations must sum to the requested total when Custom mode
  is used.

## Aspect ratio

- Supported ratios: 16:9 and 9:16.

## Negation behaviour

- Negation in prose is unreliable. Use positive description.
- A separate `negative_prompt` field is supported (carried over from
  3.0 non-Omni) — does NOT count against the visible prompt's
  character budget.

## Production design anchors

For the `Style / medium` clause, prefer named traditions over generic
adjectives. The shared catalogue lives in
`../../../references/production-design.md`. Strong for Omni: Tsui Hark
Wuxia, Ridley Scott prestige, Naturalistic film print emulation,
DaVinci industrial-grade color grading.

## Audit

Last reviewed: 2026-04-28. Cross-check against
`references/official-guidelines.md` (Kling Omni source page and the
Kling 3.0 Omni vendor doc) before relying on any rule above. Pay
particular attention to the mix-budget heuristic and any official
per-modality caps that may have been published since 2026-04-28.
