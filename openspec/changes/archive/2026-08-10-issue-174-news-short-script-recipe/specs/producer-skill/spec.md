## ADDED Requirements

### Requirement: The News Short Script Recipe's producer procedure exists in-repo as an invocable Skill (issue #174)

`.claude/skills/produce-news-short-script/SKILL.md` SHALL exist, declaring `name:
produce-news-short-script` in its front-matter, invocable by slug when a Production Queue job's Recipe
is `"news-short-script"`. It SHALL document: reading the Brand's hard rules
(`brand-profile.ts`'s `loadBannedWords`), the Format's Baseline Prompt (`format/store.ts`'s `loadFormat`
then `format/baseline-prompt.ts`'s `loadBaselinePrompt(brand, format, "news-short-script")`), and the
Idea brief; authoring the ordered `beats` array (hook -> story* -> cta, ~120-150 words); self-auditing
against `news-short-script-validate.ts`'s `validateNewsShortScriptSpec` and
`news-short-script-brand-safety.ts`'s `scanNewsShortScriptForBannedWords`; and emitting the Spec through
`production-spec/store.ts`'s `saveSpec`/`specPathFor`. It SHALL STOP (never author without one) when the
Baseline Prompt lookup returns `found: false` (any of `"not-declared"`/`"malformed"`/`"dangling"`) or the
brief cannot be read, and treat a banned word as REJECT-ONLY. It SHALL state it does not run any Space
(ADR-0021 — this Recipe has none) and never publishes, and it SHALL name the Producer's own separate
render step, `asset/shot-list-media.ts`'s `collectShotListMedia`, run AFTER the Spec is saved. It SHALL
NOT hardcode any one Brand/Format's own name or required CTA.

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

### Requirement: write-social-copy documents composing a title + description Copy for a titleMaxChars-declaring Recipe (issue #174)

`.claude/skills/write-social-copy/SKILL.md` SHALL document that, for a Recipe whose `copyShape` declares
`titleMaxChars` (today: the News Short Script Recipe alone), it composes a title (`Copy.title`, bounded
by `titleMaxChars`) plus a description (stored in the SAME `caption` field every other Recipe's caption
lives in) — hand off to the SAME deterministic checkers (`injectRequiredParts` then `validateCopy`) —
and that `title` is checked ONLY when `shape.titleMaxChars` is set, a no-op for every other Recipe. It
SHALL point at `copy/news-short-script-draft.ts`'s `newsShortScriptDraftCopy` as this step's
deterministic, testable proof.

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
