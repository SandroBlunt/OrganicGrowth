## Why

OrganicGrowth manages many Brands (CONTEXT.md). The Brand resolver and MundoTip migration (slice #19)
laid the on-disk foundation: each Brand lives under `data/brands/<slug>/` and the resolver is the
single home for path derivation. However, none of the granular commands or content agents are yet
Brand-aware: they still read the `mundotip` transitional defaults baked into `DEFAULT_LEDGER_PATH` and
`DEFAULT_BRAND_PROFILE_PATH`. This means:

1. A second Brand's data can never be operated on — there is no way to say "report for brand X".
2. Two terminals running commands concurrently on different Brands would silently clobber each other if
   they both hit the same ambient default.
3. The transitional defaults create an implicit "active brand" concept — a global singleton that the
   design explicitly rejected (CONTEXT.md: "There is **no global 'active brand' pointer file**").

This slice makes **Brand explicit on every granular command and content agent**: a command receives a
`<brand>` argument, converts it to a slug via `slugify`, calls `resolveBrand(slug)` to get brand-scoped
paths, and operates exclusively on those paths. Omitting `<brand>` is a clear error (a usage message),
never a silent fallback to `mundotip`.

The `/queue` command gains the `<brand>` argument here for consistency; its brand-filtering of queue
jobs is deferred to the next slice (which depends on jobs carrying a `brand` field).

The content agents (`trend-scout`, `idea-strategist`, `producer`, `performance-tracker`) have their
system prompts updated to (a) receive a Brand argument at invocation, (b) thread it through every
file path they read or write, and (c) restate the Brand explicitly at each human gate (Review, Cast
pick, Publish) so the Operator is never in doubt which Brand they are acting on.

## What Changes

### TypeScript command modules

- **`src/commands/report.ts`** — `reportCommand` gains an explicit `brand` parameter (slug) and uses
  `resolveBrand(slug).ledger` for the ledger path instead of `DEFAULT_LEDGER_PATH`. The CLI `main()`
  parses `<brand>` from argv[2] and exits with a usage error if absent.

- **`src/commands/pick-cast.ts`** — `pickCastCommand` gains an explicit `brand` parameter (slug) and
  uses `resolveBrand(slug).ledger` and `resolveBrand(slug).queuePath` for the paths instead of their
  defaults. The CLI `main()` parses `<brand>` from argv[2] and exits with a usage error if absent.

### Removed: interim single-Brand default

- The `DEFAULT_LEDGER_PATH` constant in `src/ledger/ledger.ts` and `DEFAULT_BRAND_PROFILE_PATH` in
  `src/production-spec/brand-profile.ts` had their values updated to the `mundotip` path in slice #19
  as a "transitional default". This slice removes that transitional default by reverting those
  constants to the original single-Brand paths (`data/ledger.json` and `data/brand-profile.yaml`)
  ONLY if they remain used — but since all callers now receive explicit paths via the brand resolver,
  the constants are marked as deprecated / legacy. The key invariant is that NO path resolution flows
  through a `mundotip` hard-code in the command entry points; every command entry point that reads the
  ledger or brand-profile must now obtain the path via `resolveBrand(slug)`.

  In practice: the module-level `DEFAULT_*_PATH` constants in `ledger.ts` and `brand-profile.ts`
  remain (they are exported and used by the deep module defaults), but the CLI `main()` functions
  in `report.ts` and `pick-cast.ts` MUST NOT fall back to those defaults when `<brand>` is absent —
  they must error instead.

### Command markdown files (`.claude/commands/`)

Every granular command markdown file gains an explicit `<brand>` argument:

- `/run-trends <brand>` — reads `data/brands/<slug>/seeds.yaml` and `data/brands/<slug>/brand-profile.yaml`;
  writes trends + ideas under `data/brands/<slug>/ideas/<run>/`; appends to `data/brands/<slug>/ledger.json`.
- `/review-ideas <brand> [<run>]` — loads suggested Ideas from `data/brands/<slug>/ledger.json`.
- `/queue <brand>` — reads the global `data/queue.json` (brand-filtering of jobs is a future slice).
- `/pick-cast <brand> <idea-id> <n>` — reads `data/brands/<slug>/ledger.json`.
- `/log-post <brand> <idea-id> <facebook-url>` — updates `data/brands/<slug>/ledger.json`.
- `/track-performance <brand>` — reads and updates `data/brands/<slug>/ledger.json`.
- `/report <brand>` — reads `data/brands/<slug>/ledger.json`.

Each command markdown file restates the active Brand at the start of its output so the Operator
never confuses which Brand is being operated on.

### Agent markdown files (`.claude/agents/`)

- **`trend-scout`** — threads the Brand slug through all file paths read and written (seeds.yaml,
  brand-profile.yaml, ideas/, ledger.json). Restates the Brand in its output header.
- **`idea-strategist`** — same threading; restates Brand in the ranked summary it writes.
- **`producer`** — threads Brand through spec paths and ledger writes; restates Brand at **Gate 2
  (Cast pick)** — "Pausing for Brand X: Operator picks the Character for Idea N."
- **`performance-tracker`** — threads Brand; restates Brand in the performance table output.

The content agents are NOT domain vocabulary; they are runtime agents whose prompts must name the
Brand they're acting on at every human gate.

### Tests

New tests in `src/commands/report.test.ts` and `src/commands/pick-cast.test.ts` cover brand-routing:

- `reportCommand` called with a brand slug resolves the correct Brand's ledger path via the resolver
  and returns the correct report (not data from another Brand).
- `pickCastCommand` called with a brand slug resolves the correct Brand's ledger; a pick for Brand X
  does not read Brand Y's ledger.
- Omitting `<brand>` from the CLI invocation (no argv arg) produces a usage error, not a MundoTip
  fallback.

## Capabilities

### Modified Capabilities

- `brand-commands`: Every granular command accepts and requires an explicit `<brand>` argument;
  command and agent files restate the Brand at each human gate. The TS commands `report` and
  `pick-cast` route paths through the resolver for the named Brand. No global active-brand pointer
  is written or read.
