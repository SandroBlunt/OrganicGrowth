# Official guidelines — Seedream 4.5

Distilled summary of the prompt guidance for ByteDance's Seedream 4.5.
Any rule below that conflicts with the latest official source MUST be
treated as stale. This skill is front-end / prompting focused.

## Sources

- **Primary URL (official BytePlus prompt guide):**
  https://docs.byteplus.com/en/docs/ModelArk/1829186
- **Official model page (ByteDance Seed):**
  https://seed.bytedance.com/en/seedream4_5
- **Prompt-craft guide (fal):**
  https://fal.ai/learn/devs/seedream-v4-5-prompt-guide
- **Third-party complete guide (wavespeed blog):**
  https://wavespeed.ai/blog/posts/seedream-4-5-complete-guide-2026/
- **Fetched at:** 2026-06-04
- **Vendor:** ByteDance Seed (distributed via BytePlus / Volcano Engine;
  consumer brand Doubao / Jimeng / Dreamina).

## Headline points (distilled, 2026-06-04)

- **Describe the scene in natural language**, subject + action +
  environment; concise and precise beats long and ornate. (BytePlus)
- **Earlier concepts are weighted more** — lead with the subject. (fal)
- **Word budget 30–100**; overly long prompts confuse the model. (fal)
- **In-image text:** quote the literal text in double quotes; signature
  strength for posters / logos / dense typography. (BytePlus, seed)
- **Lighting-responsive:** golden hour, dramatic side light, soft
  diffused, low-key, high-key all land well. (fal)
- **Multi-reference:** address each upload by ordinal ("Image 1", "Image
  2"); up to ~10 references; identity anchors on the first reference.
  (BytePlus, fal)
- **Sequential consistent-set:** "a series" / "a set" + a count produces
  a coherent multi-image set with locked character and style — a
  Seedream differentiator. (seed, wavespeed)
- **No negative-prompt field**; prefer positive description. (fal,
  vendor schemas)
- **Resolution up to 4K (4096 px)**; default ~2K. (vendor/aggregator)
- **Aspect ratios** span 1:1 through 21:9. (third-party, moderate
  confidence)

## fal 5-part prompt framework

1. Subject (main focus) → 2. Style → 3. Composition → 4. Lighting &
   atmosphere → 5. Technical (camera, lens, perspective). Put the most
   important elements first.

## Worked examples (quoted from fal)

- *"A fluffy orange tabby cat sitting on a windowsill, soft morning
  light streaming in, cinematic composition, shallow depth of field,
  85mm lens, photorealistic style"*
- *"Professional headshot of a female CEO with short blonde hair,
  confident expression, wearing a navy blue suit, neutral office
  background, studio lighting, shallow depth of field, high-end
  corporate photography style"*
- *"A tree growing out of an open book, surrealistic style, detailed
  illustration, vibrant colors, symbolic representation of knowledge,
  dramatic lighting from above"*

## Strengths called out by the sources

- Best-in-class legible in-image text and dense typography.
- Photoreal product and portrait work; strong prompt adherence.
- Subject / character consistency across edits and sequential sets.
- Multi-reference editing with detail preservation; native 4K.

## Caveats called out by the sources

- Long prompts confuse it (keep to 30–100 words).
- Text degrades at very small sizes / very long passages / mixed
  languages.
- Tends toward over-beautified "plasticky" people unless realism is
  requested explicitly.
- No negative-prompt field; in-prompt negation unreliable.

## Mapping to this skill

| Source guidance | Skill location |
| --- | --- |
| Natural language, subject-first | `SKILL.md` § The prompt formula |
| Earlier-token weighting | `SKILL.md` § The prompt formula; translation-notes |
| 30–100 word budget | `SKILL.md` § The prompt formula; translation-notes |
| Quote in-image text | `SKILL.md` § In-image text; translation-notes |
| Ordinal multi-reference, identity on Image 1 | `SKILL.md` § Mode 3 |
| Sequential consistent-set | `SKILL.md` § Mode 4 |
| No negative field | `SKILL.md` § Negation; translation-notes |
| Aspect ratios / resolutions | `SKILL.md` § Aspect ratios, § Resolutions |
| SD-style params excluded | `references/translation-notes.md` |

## Audit and verification

- **Last reviewed:** 2026-06-04.
- **Verification cadence:** re-fetch on every minor or major version
  bump.
- **Known uncertainties (flag before relying):**
  - Exact maximum resolution: vendor/fal/AIMLAPI report up to 4096 px;
    one front-end exposes a larger extended range. Treat **4096 px (4K)**
    as the reliable ceiling.
  - Exact reference cap: official "up to 10", one provider lists 14. Use
    **10** as the safe ceiling.
  - Published aspect-ratio list varies by front-end; "1:1 through 21:9"
    is third-party, moderate confidence.
  - **Do NOT trust** any third-party guide listing `guidance_scale`,
    `num_inference_steps`, `scheduler`, or `negative_prompt` for
    Seedream — these are Stable-Diffusion template values that do not
    apply.
