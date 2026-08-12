## MODIFIED Requirements

### Requirement: The News Short Script Recipe's producer procedure exists in-repo as an invocable Skill (issue #174)

`.claude/skills/produce-news-short-script/SKILL.md` SHALL exist, declaring `name:
produce-news-short-script` in its front-matter, invocable by slug when a Production Queue job's Recipe
is `"news-short-script"`. It SHALL document: reading the Brand's hard rules
(`brand-profile.ts`'s `loadBannedWords`), the Format's Baseline Prompt (`format/store.ts`'s `loadFormat`
then `format/baseline-prompt.ts`'s `loadBaselinePrompt(brand, format, "news-short-script")`), and the
Idea brief; authoring the ordered `beats` array (hook -> story* -> cta, ~120-150 words), each beat
carrying `MIN_CURIOSITY_QUERIES`-`MAX_CURIOSITY_QUERIES` Curiosity Queries (CONTEXT.md "Curiosity
Queries", issue #187); never stating an explicit calendar date anywhere in a beat's spoken `text`, and
never letting two beats' `source_url` repeat the same site/company (issue #187); picking the closing
`cta` beat's Sign-off (CONTEXT.md "Sign-off") verbatim from the Baseline Prompt document's own small,
fixed, rotating family, never inventing a new one per script; self-auditing against
`news-short-script-author-checklist.ts`'s `auditNewsShortScriptAuthorPhase` (issue #187's graduated
checklist, which REFERENCES — never duplicates — `news-short-script-validate.ts`'s
`validateNewsShortScriptSpec` and `news-short-script-brand-safety.ts`'s
`scanNewsShortScriptForBannedWords`); and emitting the Spec through `production-spec/store.ts`'s
`saveSpec`/`specPathFor`. It SHALL STOP (never author without one) when the Baseline Prompt lookup
returns `found: false` (any of `"not-declared"`/`"malformed"`/`"dangling"`) or the brief cannot be read,
and treat a banned word as REJECT-ONLY (an explicit calendar date is the SAME reject-only contract). It
SHALL state it does not run any Space (ADR-0021 — this Recipe has none) and never publishes, and it
SHALL name the Producer's own separate render step, `asset/shot-list-media.ts`'s `collectShotListMedia`,
run AFTER the Spec is saved. It SHALL NOT hardcode any one Brand/Format's own name or required CTA.

#### Scenario: The Skill file exists, declares its slug, and references the real contract/validator/scanner

- **GIVEN** `.claude/skills/produce-news-short-script/SKILL.md`
- **WHEN** its front-matter and body are inspected
- **THEN** `name: produce-news-short-script` is present, and the body references
  `NewsShortScriptSpec`, `validateNewsShortScriptSpec`, `scanNewsShortScriptForBannedWords`,
  `saveSpec`, and `specPathFor` by name

#### Scenario: The Skill STOPs on a missing Baseline Prompt or an unreadable brief

- **GIVEN** the Skill's documented STOP conditions
- **WHEN** its prose is inspected
- **THEN** it names all three `BaselinePromptLookup` not-found reasons (`"not-declared"`,
  `"malformed"`, `"dangling"`) and states it STOPs on an unreadable brief

#### Scenario: The Skill never calls a Magnific tool and never publishes

- **GIVEN** the Skill's full text
- **WHEN** it is scanned for `spaces_*(`/`creations_*(` call syntax
- **THEN** none is found, and the text states it never publishes

#### Scenario: The Skill points at the graduated author-phase checklist, documents Curiosity Queries, the calendar-date ban, and the Shot List variety rule (issue #187)

- **GIVEN** `.claude/skills/produce-news-short-script/SKILL.md`
- **WHEN** its body is inspected
- **THEN** it references `news-short-script-author-checklist.ts` and
  `auditNewsShortScriptAuthorPhase` by name; states every beat carries 3-5 Curiosity Queries as a
  research aid that is never spoken; states no beat's text may state an explicit calendar date anywhere
  in the script body, not just the hook/intro; and states no two beats' `source_url` may repeat the same
  source page or site/company

#### Scenario: The Skill documents the closing cta beat as the Sign-off, picked verbatim from the Baseline Prompt's fixed rotating family

- **GIVEN** `.claude/skills/produce-news-short-script/SKILL.md`
- **WHEN** its body is inspected
- **THEN** it names "Sign-off", states it rotates within a small fixed family, states never inventing a
  new one per script, and does not itself hardcode the old generic follow-us direction

### Requirement: write-social-copy documents composing a title + description Copy for a titleMaxChars-declaring Recipe (issue #174)

`.claude/skills/write-social-copy/SKILL.md` SHALL document that, for a Recipe whose `copyShape` declares
`titleMaxChars` (today: the News Short Script Recipe alone), it composes a title (`Copy.title`, bounded
by `titleMaxChars`) plus a description (stored in the SAME `caption` field every other Recipe's caption
lives in) — hand off to the SAME deterministic checkers (`injectRequiredParts` then `validateCopy`) —
and that `title` is checked ONLY when `shape.titleMaxChars` is set, a no-op for every other Recipe. It
SHALL point at `copy/news-short-script-draft.ts`'s `newsShortScriptDraftCopy` as this step's
deterministic, testable proof. It SHALL ALSO document that, for the News Short Script Recipe
SPECIFICALLY (issue #187, 2026-08-12 grilling), the description's closing CTA aims at the viewer's OWN
life or work — a comment/question about how AI/this tech is affecting them, tied to the specific story,
paraphrased fresh every time — replacing, for THIS Recipe only, the general "comment their thoughts or
follow for more" direction; it SHALL state this is DISTINCT from the script's own spoken Sign-off
(CONTEXT.md "Sign-off"), which rotates within a small fixed family instead of being freshly written, and
that every OTHER Recipe's caption keeps the general CTA direction unchanged.

#### Scenario: The Skill names titleMaxChars, Copy.title, and the deterministic drafter

- **GIVEN** `.claude/skills/write-social-copy/SKILL.md`
- **WHEN** its body is inspected
- **THEN** it references `titleMaxChars`, `Copy.title`, `News Short Script`, and
  `newsShortScriptDraftCopy` by name

#### Scenario: The Skill states the title check is opt-in, a no-op for every other Recipe

- **GIVEN** the Skill's title + description section
- **WHEN** it is inspected
- **THEN** it states the check runs ONLY when `shape.titleMaxChars` is set, and is a no-op for every
  other Recipe

#### Scenario: The Skill scopes the viewer's-own-life CTA direction to the News Short Script Recipe only, distinct from the script's own Sign-off (issue #187)

- **GIVEN** `.claude/skills/write-social-copy/SKILL.md`
- **WHEN** its title + description section is inspected
- **THEN** it names the News Short Script Recipe specifically, instructs inviting a comment/question
  about the viewer's OWN life/work, states the wording is paraphrased fresh every time, states this is
  distinct from the script's own Sign-off (which rotates within a fixed family instead), and states every
  other Recipe's caption keeps the general CTA direction unchanged
