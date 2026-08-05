## ADDED Requirements

### Requirement: A global, typed, platform-keyed Mention Handle Registry resolves a (company, platform) pair to a handle

The system SHALL provide a single, global (brand-agnostic — not per-Brand), typed registry mapping a
third-party company/product's plain name (e.g. `"Anthropic"`, `"1Password"`) PLUS a target platform to
that company's handle on that platform. Recognized platform keys SHALL be exactly `linkedin`, `x`,
`instagram`, `tiktok`, and `facebook`. The underlying data SHALL live in one Operator-maintained,
hand-edited file, `data/mention-handles.yaml`, shared across every Brand — mirroring the *shape* of the
per-Brand `BrandAssetStore` precedent (a typed store boundary over a plain committed file — ADR-0014)
but scoped brand-agnostically, alongside the repo's other brand-agnostic state file, the Production
Queue (`data/queue.json`, ADR-0006). This registry SHALL NEVER perform a live API call, scrape, or any
network request — it reads only the committed file. A store-level module doc comment SHALL state this
plainly (Operator-maintained, not a live lookup). This capability supersedes issue #126's
`linkedin-handle-lookup` capability (see that spec's REMOVED Requirements for the per-requirement
mapping).

#### Scenario: A company/product with a committed handle for the queried platform resolves to it

- **GIVEN** `data/mention-handles.yaml` contains an entry for `"Anthropic"` carrying a `linkedin` handle
  of `"anthropic"`
- **WHEN** the registry is resolved for `("Anthropic", "linkedin")`
- **THEN** it returns the handle `"anthropic"`

#### Scenario: A company/product with no committed entry resolves to no handle — never fabricated

- **GIVEN** a registry with at least one company entry, none of them for `"Unknown Startup"`
- **WHEN** the registry is resolved for `("Unknown Startup", "linkedin")`
- **THEN** it returns `null` (or `undefined`) — the system never invents or guesses a handle for a
  company it has no committed entry for

#### Scenario: An empty registry (no file yet, or a file with zero entries) resolves every pair to no handle

- **GIVEN** `data/mention-handles.yaml` is missing entirely, OR exists but declares zero entries
- **WHEN** the registry is resolved for any `(company, platform)` pair
- **THEN** it returns `null` (or `undefined`) without throwing — an empty registry is a normal, expected
  state (mirrors `BrandAssetStore`'s "no assets directory yet" convention), never an error

### Requirement: Resolution is platform-keyed — a missing platform key never guesses another platform's handle

A committed company entry SHALL carry its handles per-platform, independently. Resolving `(company,
platform)` SHALL return `null` when the company IS committed but has no handle recorded for the
SPECIFIC queried platform — it SHALL NEVER fall back to a different platform's handle, and SHALL NEVER
fabricate one for the missing platform (AC2's own explicit wording: "a missing platform key resolves to
none, never a guess").

#### Scenario: A company with handles on some platforms but not others resolves each independently

- **GIVEN** a committed entry for `"Anthropic"` carrying a `linkedin` handle but no `x` handle
- **WHEN** the registry is resolved for `("Anthropic", "linkedin")` and, separately,
  `("Anthropic", "x")`
- **THEN** the `linkedin` query returns the committed handle
- **AND** the `x` query returns `null` — never the `linkedin` handle, never a fabricated `x` handle

#### Scenario: An unrecognized platform key in the committed file is dropped, never silently misfiled

- **GIVEN** a company entry in `data/mention-handles.yaml` carrying a platform key outside the
  recognized five (e.g. `"mastodon"`)
- **WHEN** the registry is parsed
- **THEN** that one platform key is dropped (with a warning), and the SAME company's other, valid
  platform handles are still resolvable normally

### Requirement: The registry's parsing is defensive — a malformed entry is dropped, never crashes the whole table

Parsing the registry file's content SHALL be defensive (data-handling rule 4: "never let one malformed
record crash a Run"): a company entry whose name is missing or blank, or whose value is not itself a
`platform -> handle` mapping, SHALL be dropped (logged with a warning naming the offending entry) rather
than throwing or corrupting the rest of the table. Within a company's platform map, a handle that is
missing, blank, or not a string SHALL be dropped for that platform only (the company's other, valid
platform handles are unaffected). A company left with ZERO valid platform handles after this filtering
SHALL be dropped entirely (an entry with nothing resolvable is equivalent to no entry). Two company
names that normalize to the same registry key (case-insensitive, trimmed) SHALL keep the first and warn
about the second, rather than throwing or silently overwriting non-deterministically (mirrors
`listBrandAssets`'s duplicate-key convention). A genuinely malformed file — content that fails to parse
as YAML at all — SHALL throw a clear, actionable error naming the file path (mirrors `FormatStore`'s
`loadFormat` parse-failure convention), distinct from "missing file" (which degrades to the empty table,
never throws) and distinct from "one malformed entry inside an otherwise-valid file" (which degrades
that one entry only).

#### Scenario: A malformed platform handle is dropped; the company's other platform handles still resolve

- **GIVEN** a company entry whose `x` handle is blank but whose `linkedin` handle is well-formed
- **WHEN** the registry is parsed
- **THEN** the malformed `x` handle is absent from the resulting table (a warning is logged) and the
  `linkedin` handle still resolves normally

#### Scenario: A company left with zero valid platform handles is dropped entirely

- **GIVEN** a company entry whose ONLY platform key is unrecognized, or whose only handle value is blank
- **WHEN** the registry is parsed
- **THEN** that company has no entry in the resulting table at all — resolving ANY platform for it
  returns `null`, identically to a company that was never committed

#### Scenario: A file that fails to parse as YAML throws a path-naming error

- **GIVEN** a registry file whose content is not valid YAML (e.g. truncated mid-edit)
- **WHEN** the registry is loaded
- **THEN** loading throws an `Error` whose message names the offending file path, rather than a bare
  parser exception

### Requirement: Company-name matching is case-insensitive and whitespace-trimmed; platform-key matching is case-insensitive

Resolving a company name against the registry SHALL normalize both the committed entry's name and the
queried name (trim surrounding whitespace, case-fold) before comparing, so an Operator-authored entry
for `"1Password"` still resolves a query of `" 1password "` or `"1PASSWORD"`. A platform key in the
committed file SHALL likewise be matched case-insensitively and whitespace-trimmed (e.g. `" LinkedIn "`
in the YAML resolves the same as `linkedin`).

#### Scenario: A differently-cased or whitespace-padded company query still resolves

- **GIVEN** a committed entry for the company name `"1Password"`
- **WHEN** the registry is resolved for the query `" 1password "`
- **THEN** it returns the same handle as querying `"1Password"` exactly

### Requirement: A friendly, LinkedIn-only alias preserves the existing LinkedIn Copy consumer's exact contract

The system SHALL provide `resolveLinkedInHandle(name, path?)` as a thin convenience function over the
generic `resolveMentionHandle(name, platform, path?)`, fixed to `platform: "linkedin"` — mirroring
`/pick-cast`'s own friendly alias built on the generic `/pick` command (ADR-0010). This SHALL be the
EXACT function name `src/copy/linkedin-mentions.ts`'s `weaveLinkedInMentions` already called before this
capability existed (issue #130), so that consumer's contract (resolve -> `@Name`; unresolved -> plain
name + review flag) is preserved byte-for-byte — only the underlying data source migrated, from the old
`linkedin-handle-lookup` capability's LinkedIn-only file to this capability's platform-keyed one.

#### Scenario: resolveLinkedInHandle resolves only the linkedin platform, even when other platforms are committed

- **GIVEN** a committed entry for `"Anthropic"` carrying BOTH a `linkedin` handle and an `x` handle
- **WHEN** `resolveLinkedInHandle("Anthropic", path)` is called
- **THEN** it returns the `linkedin` handle specifically — never the `x` handle

#### Scenario: resolveLinkedInHandle returns null for a company with no linkedin handle, even if it has other platforms

- **GIVEN** a committed entry for `"Anthropic"` carrying an `x` handle but NO `linkedin` handle
- **WHEN** `resolveLinkedInHandle("Anthropic", path)` is called
- **THEN** it returns `null` — it never falls back to the `x` handle
