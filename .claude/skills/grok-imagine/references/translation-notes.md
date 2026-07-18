# Translation notes — Grok Imagine (image generation)

Model-specific rules for xAI's Grok Imagine image generation that override
the cross-model defaults in
`../../../references/prompt-discipline.md`. This skill is
**front-end / prompting focused** — it covers what you type and the
on-screen options you pick, not API code. This is the still-image
companion to the Grok Imagine 1.5 video skill; the two are structured the
same way.

## Subject-first, natural language

Grok Imagine weights **what it reads first** most heavily, so **lead with
the main subject**. Write **plain full sentences**, not adjective stacks —
Grok responds better to descriptive prose than to keyword lists. Keep
**one primary focus**; crowded prompts weaken.

## Lighting is the highest-leverage element

Be specific about lighting — it does more for a shot than any other single
element. Name the quality and direction: soft golden hour, dramatic side
light, high-contrast film-noir, neon rim light, overcast diffused, studio
softboxes, volumetric god rays, wet specular highlights. **The build
script requires a lighting clause for T2I.**

## Name a style / medium early

State the medium early: cinematic film still, photorealistic, digital
illustration, concept art, painterly, film-noir, editorial fashion. **The
build script requires a named style for T2I.** A clear medium also steers
the realism the filters see (see § Moderation).

## Word budget

- Aim for **30–80 words** for most scenes. Concise and focused beats long
  and ornate.
- The build script hard-stops past **100 words**. When you need to add
  something, cut adjectives, not the subject.

## Image editing — change + keep (distinctive)

- Edit mode takes **exactly one uploaded image**.
- Split the prompt into a **change clause** (what to change) and a **keep
  clause** (what must stay identical). This "change + keep" structure is
  the **most reliable way to hold consistency** — the build script
  requires both.
- Be explicit about what stays the same: face, expression, pose, clothing,
  composition, identity, framing.
- Name objects by **distinctive attributes** ("the soaked dark jacket",
  "the brick wall on the right"), not generic terms.
- **One major change at a time** for the best control.
- For character consistency across many images, **lock a base portrait
  first**, then edit variations.

## Moderation-aware prompting (signature)

Image filters scan **predicted realism, real-person likeness, violence,
explicit content, and brands**. Image generation is less strict than video
(no motion analysis), but the same reframing craft applies. The build
script's moderation scanner refuses a prompt containing the terms below
and offers the safer rephrasing; `--override-safety` bypasses it and
accepts a higher flag risk.

### Risky → safer table

| Risky element | Safer approach |
| --- | --- |
| Extreme photorealism cues ("8K photorealistic", "raw footage", "CCTV", "documentary realism", "ultra-realistic") | "Cinematic film still", "high-contrast film-noir look", "stylized cinematic", "concept art", "painterly" |
| Named real people / celebrities | Generic descriptions ("a professional performer", "a woman in her 30s with short dark hair") |
| Direct violence language (fight, strike, punch, blood, injury, attack) | "Athletic stage routine", "theatrical performance", "precise choreographed sequence", "dramatic rehearsal pose" |
| Suggestive / body-focused framing | Fashion editorial, cinematic portrait, dance performance, artistic study |
| Trademarked brands / logos | Generic unbranded equivalents |

### Tactics

- **Frame physical / intense scenes as staged, theatrical, rehearsed,
  cinematic, or fictional.**
- **Prefer artistic / cinematic language over documentary / photorealistic
  framing** when people are in dynamic poses.
- **For action stills:** emphasize "controlled", "precise",
  "performative", "stage-combat aesthetic", "film production still".
- **Generate a cleaner stylized base first** if a realistic version keeps
  flagging, then refine.
- **Avoid combining multiple mild risk signals** in one prompt (extreme
  realism + physical confrontation + dark gritty setting). Any one alone
  is usually fine; together they compound.

### Quality-spam is also a realism flag

Avoid stacking "8K, ultra-detailed, masterpiece, best quality". These add
little and can push the realism score up. The build script treats that
stack as a moderation risk and refuses it. Let lighting and style carry
quality instead.

## Negation

- Grok Imagine has **no negative-prompt field**, and in-prompt negation
  ("no people", "without text") is unreliable. Prefer **positive
  description** ("a clean, empty plaza").
- The build script refuses negation-only prompts. The short edit
  keep-clause is the one sanctioned preserve statement and is not treated
  as negation.

## On-screen settings (not prompt text)

- **Aspect ratio:** match to final use — portrait for characters,
  landscape for environments, square for social. Presets vary by
  front-end; the build script accepts `1:1`, `16:9`, `9:16`, `4:5`,
  `5:4`, `3:4`, `4:3`, `3:2`, `2:3`, plus `auto`. When you plan to animate
  the still later (Grok Imagine 1.5 video), leave clear space for motion
  and a stable composition.
- **Resolution:** Grok Imagine sizes the output; not a prompt concern.

## Provenance and policy

- The user must hold rights to any uploaded reference image, and the
  output must comply with the platform's content policy. The
  moderation-aware tactics are for getting **legitimate creative work**
  through the filters cleanly — not for defeating policy.

## Audit

Last reviewed: 2026-07-17. Cross-check against
`references/official-guidelines.md` (the vendor / community sources) before
relying on any rule above. xAI does not publish a separate image-model
version or an official image prompt guide; the rules above are drawn from
the Grok Imagine image prompting guide and community moderation tactics.
Aspect-ratio presets, resolution behaviour, and filter thresholds change
over time — see the official-guidelines audit notes.
