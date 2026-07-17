# A Recipe's producer procedure is an interpreting Skill the thin Producer loads by slug

**Status:** accepted — extends ADR-0010 (thin, recipe-generic Producer) and ADR-0008 (Producer drives the
Space attended). Captured in the 2026-07 recipe-architecture wayfinding (map #70, tickets #75/#76).
**Decided, build pending.**

The thin, recipe-generic Producer (ADR-0010) needs a per-Recipe procedure — how to author *this* Recipe's
prompt from its baseline document + the brief, and drive *this* Recipe's canvas. The fork was a loadable
Skill vs a plain instruction file, and it hinged on one fact: can a sub-agent invoke the Skill tool?

## Decision

- **A sub-agent CAN invoke the Skill tool** (map ticket #76: Claude Code sub-agents inherit `Skill`; the
  `skills:` frontmatter only *preloads*). So the per-Recipe procedure is **a Skill** — the earlier lean
  toward an instruction file rested on the opposite, now-disproven, assumption.
- The Skill is the **interpreter**: it reads the Brand's hard rules + the Format's **baseline prompt**
  (ADR-0015) + the Idea's brief, and **authors the media prompt(s)** in the baseline shape, self-checking
  against the author-phase contract (ADR-0017).
- The **thin Producer selects the Recipe by the queue job's slug and runs that Recipe's Skill.** It keeps
  its Magnific tools and **runs everything attended, pausing only at the Recipe/canvas-declared gates**
  (ADR-0008 unchanged — the carousel declares zero gates and runs straight through; the character Recipe
  pauses at its Cast gate).

## Why

The procedure is the Recipe's changeable, prose-heavy part; a Skill holds it well — versioned,
discoverable, with a `skills:` preload path — and a sub-agent can invoke one, so nothing forces the weaker
instruction-file option. Authoring the prompt is the Producer's core craft, and a Skill is the natural home
for that craft.

## Consequences

- Each wired Recipe gains a producer Skill (e.g. `produce-news-carousel`, `produce-character-explainer`);
  the map's #77 prototype authored `produce-news-carousel` and proved it end-to-end.
- The single hardwired `producer.md` narrows to a thin conductor that resolves the Recipe and runs its
  Skill.
- "Grounded, not invented" and the author checklist live in the Skill, not the generic Producer.
