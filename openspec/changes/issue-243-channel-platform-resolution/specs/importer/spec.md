## MODIFIED Requirements

### Requirement: An Asset's post_url resolves to a Channel from its own URL, never assumed, and becomes a Post row

`src/importer/resolve-post-platform.ts`'s `resolvePostPlatform` SHALL determine the platform an Asset's logged `post_url` was published to purely from the URL's own hostname — never assumed from the Brand's primary Channel, never hardcoded to any single platform, and a `post_url` that does not resolve to any of `KNOWN_PLATFORMS` SHALL be a named refusal. `src/importer/resolve-post-channel.ts`'s `resolvePostChannel` SHALL then resolve that Asset's `post_url` to a SPECIFIC Channel among the Brand's Channels configured for that platform — a platform with zero configured Channels SHALL be a named refusal; a platform with exactly ONE configured Channel SHALL resolve to it directly, with no identifier check (unambiguous by construction — the only candidate); a platform with TWO OR MORE configured Channels SHALL be resolved by matching a platform-specific identifier extracted from the Post URL (`extractChannelIdentifier`) against the identifier extracted from each candidate Channel's own `url`, and SHALL refuse — never default to any one candidate — when that identifier cannot be extracted from the Post URL, or matches zero or more than one candidate Channel. `src/importer/execute.ts`'s `executeImport` SHALL log each resolved Post through `src/command-surface/index.ts`'s `logPost`, keyed `(asset_id, channel_id)` per ADR-0028, against that SPECIFIC resolved Channel — never a store bypassed, and never merely "a" Channel for the resolved platform.

#### Scenario: a Facebook post_url resolves against the Brand's own single configured Facebook Channel

- **GIVEN** a Brand whose `channel` list includes exactly one `primary: true` `facebook` entry, and an
  Asset whose `post_url` is a `facebook.com` permalink carrying a `posted_at`
- **WHEN** the plan is built and executed
- **THEN** a `post` row exists for that Asset, with `channel_id` referencing the Brand's own `facebook`
  `channel` row — never a hardcoded platform, and no identifier match is required since it is the only
  candidate

#### Scenario: the real idea-2026-W32-10 Post still resolves under the single-Channel fast path despite carrying a different Facebook Page id than its Channel's own configured url

- **GIVEN** a Brand with exactly one configured `facebook` Channel whose `url` carries numeric Page id
  `61591885769033`, and a real logged Post `post_url` of
  `https://www.facebook.com/122096865609396192/posts/122114019723396192` (the alternate Facebook
  permalink shape, carrying a DIFFERENT numeric id for the SAME real Page)
- **WHEN** the plan is built
- **THEN** it still resolves to that one Channel — the single-Channel case never requires an identifier
  match, so this real, correct Post is not regressed by this change

#### Scenario: a post_url resolving to a platform the Brand has no configured Channel for is a refusal

- **GIVEN** an Asset whose `post_url` resolves to `"instagram"` and a Brand whose `channel` list carries
  no `instagram` entry
- **WHEN** `planImport` runs
- **THEN** it returns `ok: false`, naming the Idea, the Asset, and the unresolved platform

#### Scenario: a post_url that does not resolve to any known platform at all is a refusal

- **GIVEN** an Asset's `post_url` pointing at a host matching none of `KNOWN_PLATFORMS`
- **WHEN** `planImport` runs
- **THEN** it returns `ok: false`, naming the offending URL

#### Scenario: a post_url with no posted_at is a refusal, never a fabricated timestamp

- **GIVEN** an Asset carrying `post_url` but no `posted_at`
- **WHEN** `planImport` runs
- **THEN** it returns `ok: false`, naming the Idea and Asset — no `post` row is ever created with a
  fabricated `posted_at`

#### Scenario: two Channels on the same platform — the post_url's identifier picks the SPECIFIC one it names

- **GIVEN** a Brand configuring TWO `facebook` Channels, each with a distinct numeric Page id in its own
  `url`, and an Asset whose `post_url` carries the SECOND Channel's numeric id in its own `id=` query
  param
- **WHEN** the plan is built
- **THEN** the Asset resolves to the SECOND Channel specifically (never the first, never whichever was
  created last) — proven by its resolved Channel index, not merely by platform

#### Scenario: two Channels on the same platform — the OTHER Channel's own matching identifier resolves to it instead

- **GIVEN** the same Brand as above, but a second Asset whose `post_url` carries the FIRST Channel's
  numeric id instead
- **WHEN** the plan is built
- **THEN** that Asset resolves to the FIRST Channel specifically

#### Scenario: two Channels on the same platform — an identifier matching NEITHER configured Channel is a refusal, never a silent pick

- **GIVEN** a Brand configuring TWO `facebook` Channels, and an Asset whose `post_url` carries a numeric
  id matching neither Channel's own `url`
- **WHEN** `planImport` runs
- **THEN** it returns `ok: false`, naming the Idea and stating the identifier matched none of the
  Brand's configured Channels for that platform — no `post` row is ever created against a guessed
  Channel

#### Scenario: two Channels on the same platform — a post_url with no extractable identifier at all is a refusal, never a hostname-only default

- **GIVEN** a Brand configuring TWO `facebook` Channels, and an Asset whose `post_url` is a Facebook
  link shape that carries no owner-identifying segment at all (e.g. a bare `watch/`-shaped link)
- **WHEN** `planImport` runs
- **THEN** it returns `ok: false`, naming the Idea and stating that resolution cannot disambiguate —
  never falling back to the hostname-only resolution this change replaces

#### Scenario: a Channel with a blank url never wins a match by default

- **GIVEN** a Brand configuring TWO Channels on the same platform, one with a real `url` and one with a
  blank `url` (an added-but-not-yet-configured second Page), and a Post whose identifier matches the
  configured one
- **WHEN** the plan is built
- **THEN** it resolves to the configured Channel specifically — the blank-`url` Channel is never treated
  as a match, since a Channel nobody has configured cannot own a Post
