## Why

The system currently requires a Brand directory to exist before `/run-pipeline <brand>` can be
invoked. There is no first-run onboarding path: a new Operator must manually copy
`templates/brand-skeleton/`, fill in placeholders, and derive a slug before the pipeline will
accept their Brand. This is a friction point that conflicts with the product goal of a smooth
weekly loop — the first run should be as guided as subsequent ones.

This slice extends the conductor so that encountering an **unknown slug** (or receiving **no
argument**) triggers a guided new-Brand interview rather than a hard error. The interview is
**staged**: it gathers only the information needed before Trend Research (niche, voice,
language/region, platform, and at least one seed Page), deferring optional post-production config
(Channel URL, banned words, required CTA, required hashtags) until before Publish/track. Pure
builders turn the interview answers into `brand-profile.yaml` content, `seeds.yaml` content, and
an empty ledger shape; a thin write shell materialises `data/brands/<slug>/` from the
`templates/brand-skeleton/` template. The conductor **never invents brand facts** — the Brand
Profile reflects only what the Operator told it.

A filesystem-safe slug is derived from the Brand name via the existing `slugify` function and then
**validated**: an empty slug (produced by a name with no alphanumeric characters) is rejected with
a clear message before any directory is created. After scaffolding, the new Brand immediately
appears in `listBrands()` and the pipeline proceeds normally.

## What Changes

### Extended conductor `src/commands/run-pipeline.ts`

Two new entry paths in `conductorTurns`:

1. **No argument** (`brand` is `undefined`): the conductor asks whether the Operator is starting a
   new Brand or working an existing one, listing existing Brands from `listBrands()`. If the
   Operator chooses to create a new Brand, the interview flow begins; if they pick an existing
   Brand, the conductor continues with that slug.

2. **Unknown slug**: when `brandExists` returns `false` for the provided slug, the conductor offers
   to create that Brand rather than hard-stopping. If the Operator accepts, the interview flow
   begins.

Both paths converge on the same staged interview, which asks for: brand name (if not already
supplied as a slug), niche, voice, language/region, platform, and at least one seed Page URL.
After the interview, the conductor calls the builders and then the write shell; on success the loop
continues as normal for the newly scaffolded Brand.

The conductor adds two new injectable options: `getExistingBrands` (for testing `listBrands`
without filesystem hits) and `templatePath` (for pointing at a test skeleton instead of the real
`templates/brand-skeleton/`).

### New pure module `src/brand/scaffolder.ts`

Pure builders (no I/O, deterministic):

- `deriveSlug(name: string): string` — delegates to `slugify`; returns the slug.
- `validateSlug(slug: string): { ok: true } | { ok: false; reason: string }` — rejects an empty
  slug with a clear error message; otherwise returns `{ ok: true }`. The only rejection case
  today is an empty slug (all-non-alphanumeric input).
- `buildBrandProfile(answers: BrandInterviewAnswers): BrandProfileContent` — pure mapping from
  interview answers to the YAML-serialisable brand-profile shape. The mapping is strict: only
  Operator-supplied fields are set; no defaults are invented for fields the Operator did not
  provide.
- `buildSeeds(answers: BrandInterviewAnswers): SeedsContent` — pure mapping from interview answers
  to the YAML-serialisable seeds shape. Includes the platform-specific Apify actor block.
- `buildEmptyLedger(): EmptyLedger` — returns the canonical empty ledger shape (matching
  `templates/brand-skeleton/ledger.json`).

Types:

```typescript
interface BrandInterviewAnswers {
  name: string;          // Operator-supplied Brand name (used for slug derivation)
  niche: string;
  voice: string;
  language: string;
  region: string;
  platform: "facebook" | "instagram" | "linkedin";
  seedPages: string[];   // at least 1 required
  // Deferred (gathered before Publish/track, not before scouting):
  channelUrl?: string;
  bannedWords?: string[];
  requiredCta?: string;
  requiredHashtags?: string[];
}
```

### New thin write shell `src/brand/scaffold-brand.ts`

`scaffoldBrand(slug, content, options)`: reads the `templates/brand-skeleton/` directory, copies
its structure into `data/brands/<slug>/`, then writes the built brand-profile, seeds, and ledger
over the template files. Options: `brandsRoot`, `templatePath`. After this function returns, the
Brand directory exists and `listBrands()` will include the new slug.

The function does not create or overwrite a Brand that already exists — it throws with a clear
message if the target directory is already present. This prevents accidental overwrites.

### New test file `src/brand/scaffolder.test.ts`

Unit tests for the pure builders and slug validation. All tests are pure (no I/O). Coverage:

- `validateSlug`: valid slugs pass; all-non-alphanumeric names produce an empty slug that is
  rejected with a clear message; very-long names produce a truncated slug that is accepted.
- `buildBrandProfile`: every supplied answer field appears in the output; deferred fields are
  absent unless supplied; the result round-trips through YAML parse/serialize.
- `buildSeeds`: seed pages appear in output; platform selects the correct Apify actor block;
  result round-trips through YAML parse/serialize.
- `buildEmptyLedger`: shape matches the canonical empty ledger (empty `ideas` array, `baseline`
  with null values).

### New test file `src/brand/scaffold-brand.test.ts`

Integration tests for the thin write shell (filesystem I/O in a temp dir):

- Scaffolding a new Brand creates the correct directory structure.
- After scaffolding, `listBrands()` includes the new slug.
- The brand-profile, seeds, and ledger files contain the expected values from the builders.
- Attempting to scaffold over an existing Brand throws with a clear message.

## Capabilities

### Modified Capabilities

- `brand-resolver` — adds slug validation (`validateSlug`) and the pure builders
  (`buildBrandProfile`, `buildSeeds`, `buildEmptyLedger`) to the capability, plus the new
  `scaffoldBrand` write shell that materialises a Brand from the skeleton template.

- `run-pipeline-conductor` — extends the conductor's entry paths: an unknown slug offers to create
  the Brand; no argument asks new-vs-existing and lists existing Brands. Both paths route into a
  staged interview before scouting.
