# Translation notes — Nano Banana 2

Model-specific rules for Nano Banana 2 (Gemini 3.1 Flash Image) and
Nano Banana Pro (Gemini 3 Pro Image) that override the cross-model
defaults in `../../../references/prompt-discipline.md`.

## Negation behaviour

- Plain-prose negation is unreliable. Rephrase to positive description.
- The Gemini API does not expose a dedicated negative-prompt field;
  use positive description as the primary control.

## Palette default

- Nano Banana 2 leans warm by default. For cool grading, explicitly
  request "cool grade", "neutral white balance", or a stock with cool
  bias (e.g. Fujifilm Pro 400H).

## Repetition limit

- Repeated identical objects drift past about five. For "a row of N
  bottles" with N > 5, switch to a reference image or a layout overlay.

## Reference-image semantics — variant-aware caps

| Variant | API ID | Objects | Characters | Total |
| --- | --- | --- | --- | --- |
| Nano Banana 2 (Gemini 3.1 Flash) | `gemini-3.1-flash-image-preview` | up to 10 | up to 4 | up to 14 |
| Nano Banana Pro (Gemini 3 Pro) | `gemini-3-pro-image-preview` | up to 6 | up to 5 | up to 14 |

This supersedes the prior "practical cap of 5" in earlier versions of
this skill. The build script accepts a `--variant` flag and enforces
the per-variant character cap; combined object+character total is
capped at 14.

- **I2I** — single reference; lighting often inherits unless explicitly
  overridden.
- **MR** — name every reference's role (character vs object).

## Thinking Mode

- `thinkingLevel`: `minimal` (default, lowest latency) or `High`.
- `includeThoughts`: optional; reasoning returned alongside the image.
- **Configuration parameter, NOT part of the visible prompt.** Document
  the chosen level in the Observability Checkpoint.
- Thinking tokens are billed regardless of visibility.

## Grounding via Google Search

- **Web Search** — current events, weather, data. Available on Flash
  and Pro.
- **Image Search** — visual reference from web image results. **Flash
  only.** Pro variant requests with Image Search are a misconfiguration;
  the build script flags this.
- Configuration parameter, NOT part of the visible prompt. Surface
  attribution via `groundingMetadata` in the response.

## Frame-sequence mode (Nano Banana 2 distinctive)

- The model produces an ordered set of stills sharing subject identity
  and camera state.
- Frames 1 and N have the strongest fidelity; intermediate frames may
  drift. For high-stakes intermediate frames, regenerate them
  individually with the anchor image as I2I reference.
- The hand-off line is mandatory. The downstream consuming agent uses
  it to pick the right video-model input mode (Veo first-and-last-
  frame, Kling F/L, Seedance reference-mode, etc.).
- Frame count: 3 to 8. More than 8 → identity loss. Fewer than 3 →
  not a sequence; use I2I instead.

## Aspect ratio

Supported: `1:1`, `1:4`, `1:8`, `2:3`, `3:2`, `3:4`, `4:1`, `4:3`,
`4:5`, `5:4`, `8:1`, `9:16`, `16:9`, `21:9`. (Earlier versions of this
skill listed only six ratios; the Gemini 3 family adds 1:4, 1:8, 4:1,
8:1, 21:9.)

For frame-sequence mode handing off to a video model, **the aspect
ratio MUST match the downstream video model's supported input shape**.
16:9 for Veo 3.1; 16:9, 9:16, 1:1, or 4:5 for Kling 3.0; 16:9 or 9:16
for Seedance 2.0.

## Resolution

- `512` (0.5K) — Flash only. Useful for high-volume thumbnails or rapid
  iteration drafts.
- `1K` — default for both Flash and Pro.
- `2K` — enhanced detail.
- `4K` — maximum fidelity.
- Use uppercase `K` notation. `512` requires no suffix.

## Long-prompt behaviour

- Past roughly 130 words, additional tokens dilute earlier ones. Keep
  to the five-clause skeleton.
- Token limits (Gemini API): 131,072 input tokens (Flash); 65,536
  input tokens (Pro). The five-clause skeleton sits well within both.

## SynthID watermark

All outputs carry an invisible **SynthID watermark** indicating AI
origin. The user cannot opt out. Surface this to consumers when the
downstream use case (compliance, journalism, evidentiary) requires a
watermark disclosure.

## Prohibited Use Policy

The Gemini API enforces Google's Prohibited Use Policy. The skill
should not generate deceptive content, infringing content, or content
that violates the policy. The user must hold rights to all input
images.

## Material specificity

The DeepMind guidance is explicit: prefer concrete material names. Use
"navy blue tweed" instead of "suit jacket"; "ornate elven plate armor,
etched with silver leaf patterns" instead of "armor". Material
specificity is the single largest quality lever after the lighting
description.

## Mix-budget heuristic

- Not applicable: Nano Banana 2 does not accept mixed-modality inputs
  (audio, video). References are images only.

## Audit

Last reviewed: 2026-04-28. Cross-check against
`references/official-guidelines.md` (Google's source) before relying
on any rule above.
