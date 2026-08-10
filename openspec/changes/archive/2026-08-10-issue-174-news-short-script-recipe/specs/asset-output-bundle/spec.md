## ADDED Requirements

### Requirement: captionText renders an optional leading title line (issue #174)

`captionText` (`src/asset/output-bundle.ts`) SHALL prepend a `"Title: <title>\n\n"` line when
`copy.title` is present — ahead of the caption block (single-variant shape) or ahead of every
`=== PLATFORM ===` variant block (multi-variant shape). When `copy.title` is absent (both existing
Recipes' plain caption + hashtags Copy), the rendered text SHALL be byte-for-byte identical to before
this field existed. `generatePostJson`'s `cloneCopy` helper SHALL carry `title` through unchanged, when
present, so `post.json` never silently drops a title-carrying Recipe's own headline.

#### Scenario: A title-carrying Copy renders a leading Title line

- **GIVEN** a Copy `{ caption: "A description.", hashtags: [], title: "A punchy title" }`
- **WHEN** `captionText` is called
- **THEN** the result starts with `"Title: A punchy title\n\n"`, followed by the caption block

#### Scenario: A Copy with no title renders byte-for-byte unchanged

- **GIVEN** a Copy with no `title` field
- **WHEN** `captionText` is called
- **THEN** the result is identical to what `captionText` produced before this field existed — no
  leading `"Title:"` line at all

#### Scenario: generatePostJson's copy carries title through to post.json

- **GIVEN** an Asset whose `copy` carries a `title`
- **WHEN** `generatePostJson` is called
- **THEN** the returned `PostJson.copy.title` equals the Asset's own `copy.title`
