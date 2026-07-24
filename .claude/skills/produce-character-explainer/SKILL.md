---
name: produce-character-explainer
description: >
  Use when the thin Producer runs a Production Queue job whose Recipe is
  "character-explainer-with-cast". Authors one Character Explainer Asset's Production Spec — 3
  anthropomorphic character concepts, 3 narrative clips, 3 top-level thumbnails — from an accepted
  Idea's brief plus the Brand Profile, the Recipe's core craft (ADR-0018), self-checks the result
  against the author-phase checklist, and emits the Production Spec through the spec store. Extracted,
  behaviour-identical (issue #88), from what the Producer agent did inline before the thin-conductor
  rework. Does NOT run the Space, pick the Cast, or compose the Copy: the Producer drives the canvas
  and composes the Copy separately, after this Skill's Spec is saved.
---

# Produce: character-explainer-with-cast

You author one **Character Explainer with Cast** Asset's Production Spec — the wired Recipe's core
craft (CONTEXT.md "Recipe Skill"; ADR-0018): 3 anthropomorphic character concepts, 3 narrative
clips (each a Pixar-3D `image_prompt` + a `video_prompt`), and 3 top-level thumbnails. You read two
inputs, author the Spec, self-audit against the author-phase checklist, and emit it through the spec
store. **You do not run the Space** — the thin Producer injects your emitted Spec into the `JSON
Master` node (`src/recipe/registry.ts`'s `CHARACTER_EXPLAINER_WITH_CAST.canvasInputs.promptNode`),
drives the cast run, pauses at the Cast gate for the Operator's pick, then drives the clip run and
composes the Copy separately (issue #88). You **generate, never publish** (always-rule 1).

This Skill is extracted, **byte-for-byte behaviour-identical**, from the authoring step the Producer
agent ran inline before the thin-conductor rework (issue #88) — the Production Spec this Skill
produces is unchanged; only WHERE the procedure lives has moved.

## Inputs — load both; STOP if the brief cannot be read

1. **Brand hard rules** — `data/brands/<slug>/brand-profile.yaml`, read via
   `src/production-spec/brand-profile.ts`'s `loadBannedWords`: the Brand's banned words, a hard
   filter on every field you author. (Copy — caption/hashtags/CTA — is composed later, out of the
   Space, by the Recipe's own shared copy step; not by this Skill; ADR-0012.)
2. **The Idea brief** — the accepted Idea's title, angle, character concepts (if the Brief supplies
   any), narrative beats, and any real companies/products it names (`data/brands/<slug>/ideas/<format>/
   <run>/idea-NN.md`). If the brief cannot be read, **STOP** and report; never invent one.

## Steps

### 1. Author 3 character concepts

Draft exactly `REQUIRED_CHARACTER_CONCEPTS` (3, `src/production-spec/contract.ts`) distinct
anthropomorphic concepts grounded in the Idea's brief — a relatable everyday object or figure with
expressive character, Pixar-3D in spirit. The FIRST concept (`character_concepts[0]`) is the one
every clip and thumbnail below renders against.

### 2. Author 3 narrative clips

For each of `REQUIRED_CLIPS` (3) narrative beats (setup, change, payoff — or the Brief's own beats
when it supplies them), author one `SpecClip`:

- **image_prompt** — a Pixar-3D scene of `character_concepts[0]` acting out this beat, warm cinematic
  lighting, ending with the EXACT `ASPECT_RATIO_LINE` (`"Aspect Ratio 9:16."`,
  `src/production-spec/contract.ts`) — never paraphrased, never omitted.
- **video_prompt** — `[Camera] -> [Action] -> [Voice] -> [SFX]`, sentence case, ~8 seconds: a slow
  camera move on the character, it acts out the beat, a gentle voice line, soft ambient sfx.

### 3. Author 3 top-level thumbnails

Draft exactly `REQUIRED_THUMBNAILS` (3) TOP-LEVEL image prompts (never nested inside a clip) — vivid
close-ups of `character_concepts[0]`, each also ending with the exact `ASPECT_RATIO_LINE`.

### 4. Author the companies/products list — TOP-LEVEL, OPTIONAL, grounded, never invented (issue #125)

Read the Idea brief again for any REAL companies/products it names (e.g. a competitor Product Feature
the Reel is reacting to). When it names any, list them, as written, in `ProductionSpec`'s TOP-LEVEL
`companies` field (`src/production-spec/contract.ts`) — the whole Asset's own companies/products list,
mirroring `thumbnails`'s own precedent for a top-level, not per-clip, field: all 3 clips render one
continuous narrative about the SAME picked Character, so a company/product named anywhere in the Idea
belongs to the Asset as a whole. **When the brief names none, OMIT the field entirely — never invent
one to fill it, and never restate a generic/unnamed reference as if it were a real company.** This is
the SAME "grounded, never invented" standard the News Carousel author phase already holds its own
`companies` field to (`production-spec/news-carousel-author-checklist.ts`'s `companies-cited` item).
This field carries no image-rendering role on this Recipe (unlike the News Carousel Recipe's per-slide
logo row) — it exists so the Copy step, run later, can name what the post is actually about
(`src/copy/character-explainer-companies.ts`).

### 5. Self-audit against the author-phase checklist

Run `src/recipe/phase-contract.ts`'s `auditAuthorPhase(recipe, { candidateSpec, bannedWords })` — for
this Recipe, `getRecipe("character-explainer-with-cast")` — against your authored Spec, where
`bannedWords` is the SAME list `loadBannedWords` just read. Fix and re-audit any miss:

- **Mechanical** — exactly 3 `character_concepts`, 3 `clips`, 3 top-level `thumbnails`; each clip's
  `image_prompt` ends with the 9:16 line and carries a non-empty `video_prompt`
  (`src/production-spec/validate.ts`'s `validate`, this Recipe's `specShape.validate`).
- **Mechanical** — no banned word in any field, reject-only
  (`src/production-spec/brand-safety.ts`'s `scanForBannedWords`, this Recipe's
  `specShape.scanBannedWords`). **A banned word is REJECT-ONLY — STOP and report; never silently swap
  it for another word** (always-rule 6/9).
- **Agent-judged** — each character concept and clip reads as a coherent, on-brief Pixar-3D explainer
  beat for THIS Idea, not merely contract-shaped.
- **Agent-judged** — when present, `companies` lists only REAL companies/products the Idea brief
  actually names — never invented, never a generic placeholder (issue #125).

Completion: `auditAuthorPhase(...).ok` is `true`.

### 6. Emit the Production Spec through the spec store

Shape the result to `src/production-spec/contract.ts`'s `ProductionSpec`
(`{ character_concepts, clips, thumbnails, companies? }` — no `post_copy` field; media instructions
only, ADR-0012; `companies` OMITTED when step 4 found none) and write it via
`src/production-spec/store.ts`'s `saveSpec` to the path
`specPathFor(ideaId, run, ideasRoot, "character-explainer-with-cast")` —
`data/brands/<slug>/ideas/<format>/<run>/idea-NN.character-explainer-with-cast.spec.json`, sitting
beside the Brief.

Completion: the Spec passes `auditAuthorPhase` and is saved at that path.

## Author-phase checklist (also re-run, unchanged, by a QA pass)

- Exactly 3 `character_concepts`, 3 `clips`, 3 top-level `thumbnails`.
- Each clip's `image_prompt` ends with the exact `"Aspect Ratio 9:16."` line; each clip carries a
  non-empty `video_prompt`.
- Each character concept and clip reads as a coherent, on-brief Pixar-3D explainer beat for this
  Idea. *(Agent-judged — flagged for review, never auto-failed; ADR-0017.)*
- No banned word in any field — reject-only, never a silent swap.
- The TOP-LEVEL `companies` field, when present, lists only real companies/products the Idea brief
  actually names; omitted entirely when the brief names none — never invented (issue #125).
  *(Agent-judged — flagged for review, never auto-failed; ADR-0017.)*

## What this Skill does not do

- It does not run the Space, drive a canvas, or call any `spaces_*`/`creations_*` tool — that is the
  thin Producer's job (issue #88), following this Recipe's Execution Protocol
  (`src/execution-protocol/protocol.ts`'s `canonicalProtocol`).
- It does not render the Cast, pause at the Cast gate, or pin the Operator's picked Character — the
  thin Producer's generic driver (`src/space-driver/driver.ts`'s `driveToNextGate`) does that, the
  SAME way for any wired Recipe.
- It does not compose the Copy (caption/hashtags) — that is this Recipe's own copy step, run
  separately, out of the canvas, once the media and the picked Character exist (ADR-0012).
- It does not publish anything, ever (always-rule 1; ADR-0002).
