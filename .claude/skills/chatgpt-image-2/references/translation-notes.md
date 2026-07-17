# Translation notes — ChatGPT Image 2 (gpt-image-2)

Model-specific rules and quirks. These override the cross-model defaults
in `../../../references/prompt-discipline.md` where they conflict.

## Negation behaviour

- The plain-prose negation tokens (no, not, without, avoid) are
  unreliable. The model frequently includes the negated element.
- The API exposes a separate negative-prompt field. Use it for short
  exclusion lists ("text", "watermark", "extra fingers"), not for
  semantic control.
- Primary control should always be positive description. The build script
  refuses prompts where every clause leans on negation.

## Text rendering

- gpt-image-2 renders short text inside images well. Quote the exact
  string in the prompt: `the sign reads "OPEN"`.
- Reliability degrades past roughly 5 words on a sign or 1 line of body
  copy. For multi-paragraph copy, generate the layout image and
  composite the type in post.

## Compositional logic

- Spatial relationships ("on top of", "to the left of", "behind")
  generally hold for two to three named objects. Past four named
  objects, expect drift; switch to a layout reference image (I2I or MR).

## Skin and faces

- The default render smooths skin slightly. For photographic realism,
  explicitly request "natural skin texture, pores visible, fine lines,
  catchlights in eyes". Without these tokens, the model defaults to a
  beauty-retouch look.
- Asymmetry, freckles, hair flyaways are honoured when explicitly named.

## Reference-image semantics

- **I2I** — single reference. Honours composition, identity, and most of
  lighting unless the prompt overrides explicitly. Edits compound;
  preserve clauses materially help.
- **MR** — practical cap of 4. Documented maximum may be higher per
  release notes; observed quality degrades above 4. Always name each
  reference's role in the prompt body or the model averages.

## Aspect ratio

- Supported ratios: 1:1, 3:2, 2:3, 16:9, 9:16, 4:5.
- Camera-token framing must adapt to ratio: a "wide" portrait at 9:16 is
  much tighter on the body than a "wide" portrait at 16:9.

## Long-prompt behaviour

- Past roughly 120 words, additional tokens dilute earlier ones. Prefer
  five short sentences (the five-clause skeleton) over one long
  paragraph.

## Mix-budget heuristic

- Not applicable: gpt-image-2 does not accept multi-modal mixed inputs
  (audio, video) in MR mode. References are images only.

## Audit

Last reviewed: 2026-04-27. Cross-check against
`references/official-guidelines.md` (OpenAI's source) before relying on
any rule above.
