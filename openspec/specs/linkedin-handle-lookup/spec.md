# linkedin-handle-lookup Specification

## Purpose
TBD - created by archiving change 126-linkedin-handle-lookup. Update Purpose after archive.
## Requirements
### Requirement: A global, typed LinkedIn Handle Lookup resolves a plain company/product name to its LinkedIn Page handle

The system SHALL provide a single, global (brand-agnostic — not per-Brand), typed lookup mapping a
third-party company/product's plain name (e.g. `"Anthropic"`, `"1Password"`) to that company's LinkedIn
Page handle. The underlying data SHALL live in one Operator-maintained, hand-edited file,
`data/linkedin-handles.yaml`, shared across every Brand — mirroring the *shape* of the per-Brand
`BrandAssetStore` precedent (a typed store boundary over a plain committed file — ADR-0014) but scoped
brand-agnostically, alongside the repo's other brand-agnostic state file, the Production Queue
(`data/queue.json`, ADR-0006). This lookup SHALL NEVER perform a live API call, scrape, or any network
request — it reads only the committed file. A store-level module doc comment SHALL state this plainly
(Operator-maintained, not a live lookup).

#### Scenario: A company/product with a committed entry resolves to its handle

- **GIVEN** `data/linkedin-handles.yaml` contains an entry mapping `"Anthropic"` to the handle
  `"anthropic"`
- **WHEN** the lookup is resolved for the name `"Anthropic"`
- **THEN** it returns the handle `"anthropic"`

#### Scenario: A company/product with no committed entry resolves to no handle — never fabricated

- **GIVEN** a lookup table with at least one entry, none of them for `"Unknown Startup"`
- **WHEN** the lookup is resolved for the name `"Unknown Startup"`
- **THEN** it returns `null` (or `undefined`) — the system never invents or guesses a handle for a name
  it has no committed entry for

#### Scenario: An empty lookup (no file yet, or a file with zero entries) resolves every name to no handle

- **GIVEN** `data/linkedin-handles.yaml` is missing entirely, OR exists but declares zero entries
- **WHEN** the lookup is resolved for any name
- **THEN** it returns `null` (or `undefined`) without throwing — an empty lookup is a normal, expected
  state (mirrors `BrandAssetStore`'s "no assets directory yet" convention), never an error

### Requirement: The lookup's parsing is defensive — a malformed entry is dropped, never crashes the whole table

Parsing the lookup file's content SHALL be defensive (data-handling rule 4: "never let one malformed
record crash a Run"): an entry whose name or handle is missing, blank, or not a string SHALL be
dropped (logged with a warning naming the offending entry) rather than throwing or corrupting the rest
of the table. Two entries that normalize to the same lookup key (case-insensitive, trimmed) SHALL keep
the first and warn about the second, rather than throwing or silently overwriting non-deterministically
(mirrors `listBrandAssets`'s duplicate-key convention). A genuinely malformed file — content that fails
to parse as YAML at all — SHALL throw a clear, actionable error naming the file path (mirrors
`FormatStore`'s `loadFormat` parse-failure convention), distinct from "missing file" (which degrades to
the empty table, never throws) and distinct from "one malformed entry inside an otherwise-valid file"
(which degrades that one entry only).

#### Scenario: A malformed entry is dropped; well-formed entries in the same file still resolve

- **GIVEN** a lookup file whose content includes one entry with a blank handle alongside a second,
  well-formed entry
- **WHEN** the lookup is parsed
- **THEN** the malformed entry is absent from the resulting table (a warning is logged) and the
  well-formed entry still resolves normally

#### Scenario: A file that fails to parse as YAML throws a path-naming error

- **GIVEN** a lookup file whose content is not valid YAML (e.g. truncated mid-edit)
- **WHEN** the lookup is loaded
- **THEN** loading throws an `Error` whose message names the offending file path, rather than a bare
  parser exception

### Requirement: Name matching is case-insensitive and whitespace-trimmed

Resolving a name against the lookup SHALL normalize both the committed entry's name and the queried
name (trim surrounding whitespace, case-fold) before comparing, so an Operator-authored entry for
`"1Password"` still resolves a query of `" 1password "` or `"1PASSWORD"`.

#### Scenario: A differently-cased or whitespace-padded query still resolves

- **GIVEN** a committed entry for the name `"1Password"`
- **WHEN** the lookup is resolved for the query `" 1password "`
- **THEN** it returns the same handle as querying `"1Password"` exactly

