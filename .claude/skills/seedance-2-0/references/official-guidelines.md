# Official guidelines — Seedance 2.0

Distilled summary of the Seedance 2.0 source materials. Any rule below
that conflicts with the latest official source MUST be treated as
stale.

## Sources

- **Primary URL:** https://seed.bytedance.com/en/seedance2_0
- **Vendor doc — Complete Prompting Master Guide:**
  `Seedance_2.0_Complete_Prompting_Guide.md` (compiled from EvoLinkAI,
  official Seedance docs, and top community resources).
- **Vendor doc — ImagineArt Prompt Structure and Examples:**
  `Seedance_2.0_ImagineArt_Prompt_Structure_and_Examples.md`.
- **Vendor doc — Morphic CRAFT Method Guide:**
  `Seedance_2.0_Morphic_CRAFT_Method_Guide.md`.
- **Vendor skill bundle:** `seedance-20-prompt-optimizer.skill`.
- **Fetched at:** 2026-04-28
- **Vendor:** ByteDance (Seed)

## Headline points (distilled, 2026-04-28)

- **Quad-modal input** (image + video + audio + text) via Dual-Branch
  Diffusion Transformer.
- **Per-modality caps:** ≤9 images, ≤3 videos, ≤3 audio, ≤12 total.
- **Edit vs Reference distinction is mandatory** when video input is
  supplied.
- **Synthesized audio:** ambient and foley reliably; lip-synced
  dialogue in 8+ languages.
- **Multi-beat shot lists partially honoured;** automatic multi-camera
  narrative coverage available.
- **Shot-script format** with `[Basic Settings]` block + per-shot
  `[00:00–00:02]` timecode blocks + `[Constraints]` block — top
  community results use this.
- **Sub-second timecodes** accepted for emotion beats and rapid cuts.
- **`<<<Image1>>>` notation** accepted as alternative to `@Image1`
  (Japanese-language community convention).
- **F/L mode** accepts two reference frames.
- **Aspect ratios:** 16:9, 9:16, 1:1, 4:3, 2.35:1.
- **Per-call duration:** 4–15 seconds; chain extensions for longer
  output.

## Strengths called out by the source

- High per-modality reference cap relative to peers.
- Stylised aesthetics and named-tradition style anchors.
- Synthesized audio output with multi-language lip-sync.
- Partial multi-beat honouring; automatic multi-camera coverage.
- Strong physics accuracy when motion is described physically.
- 8+ category prompt patterns (Action/Fantasy, Cinematic Realism, POV/
  FPV, Commercial/Product, Reference-Driven, Surreal/VFX, Templates,
  General Cinematic).

## Caveats called out by the source

- Per-modality caps are documented; balance guidance inside those caps
  is not — the mix-budget heuristic in
  `references/translation-notes.md` is the field-experience workaround
  and is **vendor-unconfirmed**.
- Negation is best-effort.
- Multi-beat blending occurs at beat boundaries.
- Per-call duration is bounded; chaining is the consumer's job.
- Realistic human face uploads not supported (privacy compliance).
- Reference videos cost more credits than image-only/text-only.

## Mapping to this skill

| Source guidance | Skill location |
| --- | --- |
| 6-step formula | `SKILL.md` § Mode 1 — T2V |
| Edit vs Reference | `SKILL.md` § Mode 3 § Edit vs Reference; `references/translation-notes.md` |
| Per-modality caps | `SKILL.md` § Mode 3; `references/translation-notes.md` § Per-modality caps |
| Mix-budget heuristic (vendor-unconfirmed) | `references/translation-notes.md` § Mix-budget heuristic |
| Shot-script format | `SKILL.md` § Shot-script format |
| Sub-second timecodes | `SKILL.md` § Sub-second timecodes; `references/translation-notes.md` |
| `<<<Image>>>` notation | `SKILL.md` § Notation; `references/translation-notes.md` |
| Synthesized audio | `SKILL.md` § Mode 1 § Audio; `references/translation-notes.md` § Audio synthesis |
| Multi-beat partial support | `references/translation-notes.md` § Multi-beat behaviour |
| Camera rules ("static = world moves") | `SKILL.md` § Camera rules; `references/translation-notes.md` |
| Compound camera ("primary then secondary") | `SKILL.md` § Camera rules; `references/translation-notes.md` |
| Community patterns | `SKILL.md` § Community patterns; `references/translation-notes.md` |
| Production design anchors | `../../../references/production-design.md` |

## Audit and verification

- **Last reviewed:** 2026-04-28.
- **Verification cadence:** re-fetch on every minor or major version
  bump.
- **Vendor unconfirmed assertions:** the mix-budget heuristic
  (effective video cap 2; effective audio cap 2; image floor 2 when
  any AV present). These are field-experience defaults and may be
  superseded by future official guidance.
