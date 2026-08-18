/**
 * `/run-pipeline <brand>` conductor command — the weekly loop orchestration shell.
 *
 * This is the single entry point that starts and drives the whole weekly loop for an existing Brand,
 * pausing only at the three human gates (Review, Cast pick, Publish) and resuming across turns and
 * days. It owns the readiness gate — the granular commands stay unguarded power-tools.
 *
 * New in Slice 7 (issue #25): when given an unknown slug the conductor offers to create that Brand;
 * when given no argument it asks whether the Operator is starting a new Brand or working an existing
 * one, listing existing Brands. Both paths route into a staged new-Brand interview that asks only the
 * fields needed before scouting (niche, voice, language/region, platform, ≥1 seed page), deferring
 * optional config (Channel URL, banned words, CTA, hashtags). The conductor NEVER invents brand facts.
 *
 * Design: the conductor is implemented as an async-iterable generator (`conductorTurns`) that yields
 * one `ConductorTurn` per Operator interaction. This makes it testable turn-by-turn without spawning
 * a subprocess or mocking stdin/stdout. The CLI entry point (`main`) iterates the generator and
 * reads readline responses from stdin.
 *
 * Orchestration rules (from the issue and CLAUDE.md):
 *   1. Resolve the Brand via `resolveBrand` — never a fallback Brand.
 *   2. Run readiness (never cached) via `runReadiness` — stop if research-blocking.
 *   3. Print the `/rename <brand> · <ISO-week>` hint; do NOT rename the session.
 *   4. Resolve the phase via `resolvePhase`; if in-flight, ask resume-vs-fresh (no default).
 *   5. Drive the loop, pausing only at Gates 1–3. Reuse existing modules — no duplicate logic.
 *
 * The conductor delegates ALL substantive computation:
 *   - Brand resolution    → `resolveBrand`     (src/brand/resolver.ts)
 *   - Slug derivation     → `deriveSlug`        (src/brand/scaffolder.ts)
 *   - Slug validation     → `validateSlug`      (src/brand/scaffolder.ts)
 *   - Brand listing       → `listBrands`        (src/brand/resolver.ts)
 *   - Brand scaffolding   → `scaffoldBrand`     (src/brand/scaffold-brand.ts)
 *   - Profile builder     → `buildBrandProfile` (src/brand/scaffolder.ts)
 *   - Seeds builder       → `buildSeeds`        (src/brand/scaffolder.ts)
 *   - Ledger builder      → `buildEmptyLedger`  (src/brand/scaffolder.ts)
 *   - Phase resolution    → `resolvePhase`     (src/phase-resolver/resolve.ts)
 *   - Readiness           → `runReadiness`     (./run-pipeline-readiness.ts)
 *   - Re-enqueue          → `enqueueOnAccept`  (src/production-queue/enqueue-on-accept.ts)
 *   - Queue read          → `loadQueue` / filtered by brand
 *   - Ledger read         → `loadIdeas` / `loadReport`
 *   - Report              → `reportCommand`    (./report.ts)
 *
 * Always-rules honored:
 *   - generate-never-publish: the conductor never publishes; Gate 3 is a pause for the Operator.
 *   - ledger-as-source-of-truth: every resume/fresh decision reads the ledger.
 *   - explicit-attribution: Post URLs are logged via /log-post only.
 *   - relative-not-absolute, public-metrics-only: delegated to the underlying commands.
 *   - never-fabricate: the conductor never invents brand facts; only Operator-supplied values enter
 *     the Brand Profile (see `buildBrandProfile`, `buildSeeds` in src/brand/scaffolder.ts).
 */

import * as readline from "node:readline";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { resolveBrand, brandExists, listBrands } from "../brand/resolver.ts";
import { deriveSlug, validateSlug, buildBrandProfile, buildSeeds, buildEmptyLedger } from "../brand/scaffolder.ts";
import { scaffoldBrand } from "../brand/scaffold-brand.ts";
import { resolvePhase } from "../phase-resolver/resolve.ts";
import { loadIdeas, findIdea, loadBaseline } from "../ledger/ledger.ts";
import { ideaAtGate, ideaHasAssetStatus } from "../asset/asset.ts";
import { DEFAULT_ASSET_RECIPE } from "../asset/migrate.ts";
import { loadQueue } from "../production-queue/store.ts";
import { enqueueOnAccept, type EnqueueOnAcceptOptions } from "../production-queue/enqueue-on-accept.ts";
import { runReadiness, findingsBlockPhase, isActorExistenceFinding } from "./run-pipeline-readiness.ts";
import { reportCommand } from "./report.ts";
import { isoWeek } from "../format/run-id.ts";
import { openDatabase } from "../db/connection.ts";
import { runMigrations } from "../db/migrate.ts";
import type { DatabaseSync } from "node:sqlite";
import type { Finding } from "../readiness/types.ts";
import type { MagnificReadinessPort, ApifyReadinessPort } from "./run-pipeline-ports.ts";
import type { BrandInterviewAnswers } from "../brand/scaffolder.ts";

/** The SAME default `data/organicgrowth.db` path every other command uses (`src/importer/cli.ts`,
 *  `src/commands/backfill-hook-theme.ts`) — the local SQLite database the unattended worker's
 *  `findNextQueuedJob`/`drainQueue` (issue #208) actually reads. Overridden by `options.dbPath` in
 *  every test (a throwaway temp file), so no test ever opens or migrates the real committed database. */
const DEFAULT_DB_PATH = "data/organicgrowth.db";

// ---------------------------------------------------------------------------
// ISO week helper
// ---------------------------------------------------------------------------

/**
 * `isoWeek` (used for the `/rename` hint below, a Brand-level session-naming suggestion) now lives in
 * `../format/run-id.ts` (issue #172, ADR-0022), so `/run-trends`'s cadence-derived default Run naming
 * (`defaultRunId`) shares the SAME implementation rather than a second copy. Re-exported here so this
 * module's existing public surface (and `run-pipeline.test.ts`'s import) is unchanged.
 *
 * This hint stays week-shaped regardless of a Format's cadence: it prints BEFORE any Format is chosen
 * (Step 3, ahead of Gate 1), and a Brand may run several Formats of different cadences at once, so
 * there is no single "the" cadence to derive it from here — the real cadence-aware default Run naming
 * lives at `/run-trends`, which DOES know the Format (see `.claude/commands/run-trends.md`).
 */
export { isoWeek };

// ---------------------------------------------------------------------------
// ConductorTurn — the unit of interaction the conductor yields
// ---------------------------------------------------------------------------

/**
 * One turn of the conductor loop:
 *   - `message`: text to show the Operator (always present).
 *   - `prompt`: if set, the conductor is waiting for a text response from the Operator.
 *   - `done`: if true, the loop has completed (no more turns will be yielded).
 */
export interface ConductorTurn {
  readonly message: string;
  readonly prompt?: string;
  readonly done?: boolean;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Options for the conductor (injected for testing; defaults to production values at runtime).
 *
 * The ports and path overrides let tests drive the conductor hermetically:
 *   - `magnific` / `apify` — fake probe ports (no live Magnific/Apify calls in tests).
 *   - `brandsRoot` — temp dir to avoid touching real state.
 *   - `queuePath` — temp queue file.
 *   - `dbPath` — temp SQLite file (issue #254) — see its own doc comment below.
 *   - `templatePath` — path to the brand-skeleton template (injected so tests use the real one).
 *   - `now` — injected clock for deterministic timestamps.
 *   - `getInput` — injected stdin so tests can feed "resume"/"fresh" without subprocess.
 */
export interface RunPipelineOptions {
  readonly brandsRoot?: string;
  readonly queuePath?: string;
  /**
   * Path to the local SQLite database (issue #254, QA round-1 Defect 2: "the production path must pass
   * `db` by default rather than depending on a paragraph being followed"). Defaults to
   * `data/organicgrowth.db` at runtime — the SAME file every other command opens
   * (`src/importer/cli.ts`, `src/commands/backfill-hook-theme.ts`). The conductor's stranded-idea
   * re-enqueue step (the ONE real, compiled TypeScript caller of `enqueueOnAccept`) opens and migrates
   * this file, then passes it through, so a resumed accept reaches SQL WITHOUT depending on any agent
   * reading a markdown instruction. Every test injects a throwaway temp path here — never the real,
   * committed database.
   */
  readonly dbPath?: string;
  /**
   * Path to the brand-skeleton template directory. Defaults to `"templates/brand-skeleton"`.
   * Injected in tests to point at the real template at an absolute path or a temp copy.
   */
  readonly templatePath?: string;
  readonly now?: () => string;
  /** Injected clock returning a Date (for the ISO-week computation). Default: new Date(). */
  readonly nowDate?: () => Date;
  /** Injected probe ports (fake in tests, live adapters at runtime). */
  readonly magnific?: MagnificReadinessPort;
  readonly apify?: ApifyReadinessPort;
  /**
   * Injected input function: the conductor calls `getInput(prompt)` when it needs an Operator
   * response. Returns the Operator's text. Defaults to reading a line from stdin.
   */
  readonly getInput?: (prompt: string) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Default probe ports (live MCP / live Apify at runtime)
// ---------------------------------------------------------------------------

/**
 * Default Magnific readiness port — wired to live Magnific at runtime. Tests ALWAYS inject a fake.
 * The live adapter is intentionally minimal (CLAUDE.md: tests use the fake; live probes deferred).
 */
const DEFAULT_MAGNIFIC_PORT: MagnificReadinessPort = {
  async probeSpace() {
    // Runtime placeholder: the live Magnific MCP adapter is wired by the Operator's agent runtime.
    // This path is NEVER exercised in tests (tests inject a fake). If called, assume not accessible.
    return { accessible: false, creditsOk: false };
  },
};

const DEFAULT_APIFY_PORT: ApifyReadinessPort = {
  async probeToken() {
    // Runtime placeholder: live Apify ping is deferred. If called, assume valid (permissive default).
    return true;
  },
  async probeActorExists() {
    // Runtime placeholder: the live actor-existence probe (issue #253) is deferred. Honestly report
    // "unreachable" (never checked) rather than fabricating "ok" — this NEVER blocks any phase either
    // way (see run-pipeline-readiness.ts's probeConfiguredActors), so the permissive-vs-honest choice
    // here has no gating consequence, unlike probeToken's `true` default above.
    return "unreachable";
  },
};

// ---------------------------------------------------------------------------
// runNewBrandInterview — staged new-Brand interview (generator)
// ---------------------------------------------------------------------------

/**
 * Staged new-Brand interview. Asks ONLY the fields needed before scouting:
 *   brand name (to derive + validate the slug), niche, voice, language/region, platform, ≥1 seed page.
 *
 * Deferred fields (Channel URL, banned words, CTA, hashtags) are NOT asked here.
 *
 * Returns the validated Brand slug via generator return value, or `undefined` if the interview is
 * aborted (e.g. an invalid name was supplied and the Operator declines to retry).
 *
 * This function contains NO business logic — it only collects answers and delegates to the pure
 * builders and the write shell. It NEVER invents brand facts.
 *
 * @param slugHint    Optional pre-supplied slug (from the unknown-slug path). If provided and
 *                    valid, it is used as the Brand slug directly; the interview asks for the
 *                    Brand *display name* but uses the pre-supplied slug as the directory name.
 * @param brandsRoot  Brands root directory for `scaffoldBrand`.
 * @param templatePath Path to the brand-skeleton template.
 */
async function* runNewBrandInterview(
  slugHint: string | undefined,
  brandsRoot: string | undefined,
  templatePath: string,
): AsyncGenerator<ConductorTurn, string | undefined, string | undefined> {
  yield { message: "Starting new-Brand interview. I'll ask for the essentials before Trend Research." };

  // --- Brand name (used to derive + validate the slug) ---
  // `finalSlug` is the filesystem directory name; `displayName` is the human-facing Brand name the
  // Operator typed (preserved verbatim — e.g. "Mundo Tip!" must not collapse to the slug "mundo-tip").
  let finalSlug: string;
  let displayName: string;

  if (slugHint !== undefined && slugHint.length > 0) {
    // A slug was pre-supplied (from the unknown-slug path). Validate it.
    const validation = validateSlug(slugHint);
    if (!validation.ok) {
      yield {
        message: `The slug "${slugHint}" is not valid: ${validation.reason}`,
        done: true,
      };
      return undefined;
    }
    finalSlug = slugHint;
    // No display name was typed on the unknown-slug path — the slug is the best name we have.
    displayName = slugHint;
    yield {
      message: `Using Brand slug: "${finalSlug}"`,
    };
  } else {
    // Ask for the Brand name and derive the slug from it.
    let derivedSlug = "";
    let typedName = "";
    let nameAttempts = 0;
    while (derivedSlug.length === 0) {
      nameAttempts++;
      if (nameAttempts > 3) {
        yield {
          message: "Too many invalid name attempts. Stopping.",
          done: true,
        };
        return undefined;
      }
      const nameResponse: string | undefined = yield {
        message: nameAttempts === 1
          ? "What is the Brand name? (This will be used to create a filesystem-safe slug.)"
          : "Please enter a Brand name with at least one letter or number:",
        prompt: "Brand name:",
      } as ConductorTurn;

      const rawName = (nameResponse ?? "").trim();
      const slug = deriveSlug(rawName);
      const validation = validateSlug(slug);
      if (!validation.ok) {
        yield {
          message: `"${rawName}" is not a valid Brand name: ${validation.reason}`,
        };
        continue;
      }
      derivedSlug = slug;
      typedName = rawName;
    }
    finalSlug = derivedSlug;
    displayName = typedName;
    yield { message: `Brand slug: "${finalSlug}"` };
  }

  // --- Niche ---
  const nicheResponse: string | undefined = yield {
    message: "What is the Brand's niche? (One-line description, e.g. 'Life hacks, household tips & tricks')",
    prompt: "Niche:",
  } as ConductorTurn;
  const niche = (nicheResponse ?? "").trim();

  // --- Voice ---
  const voiceResponse: string | undefined = yield {
    message: "Describe the Brand's voice in 2–4 sentences. (Tone, sentence length, how to open/close a Reel.)",
    prompt: "Voice:",
  } as ConductorTurn;
  const voice = (voiceResponse ?? "").trim();

  // --- Language ---
  // Re-ask until the Operator supplies a non-empty language code. Cap at 3 (mirrors name loop).
  // Never fabricate a default — only Operator-supplied values enter the Brand Profile.
  const MAX_LANGUAGE_ATTEMPTS = 3;
  let language = "";
  let languageAttempts = 0;
  while (language.length === 0) {
    languageAttempts++;
    if (languageAttempts > MAX_LANGUAGE_ATTEMPTS) {
      yield {
        message: "Too many empty language attempts. A language code is required. Stopping.",
        done: true,
      };
      return undefined;
    }
    const languageResponse: string | undefined = yield {
      message: languageAttempts === 1
        ? "What is the content language code? (e.g. 'en', 'es', 'pt')"
        : "Please enter a non-empty language code (e.g. 'en', 'es', 'pt'):",
      prompt: "Language code:",
    } as ConductorTurn;
    const trimmed = (languageResponse ?? "").trim();
    if (trimmed.length > 0) {
      language = trimmed;
    }
  }

  // --- Region ---
  const regionResponse: string | undefined = yield {
    message: "What is the target region? (e.g. 'US', 'LATAM', 'BR')",
    prompt: "Region:",
  } as ConductorTurn;
  const region = (regionResponse ?? "").trim();

  // --- Platform ---
  // Re-ask until the Operator supplies one of: facebook | instagram | linkedin | youtube
  // (case-insensitive). Never fabricate a default — only Operator-supplied values enter the Brand
  // Profile. Cap at 3 (mirrors name loop). An unrecognised non-empty value triggers a re-ask that
  // names the accepted values.
  const MAX_PLATFORM_ATTEMPTS = 3;
  let platform: BrandInterviewAnswers["platform"] | "" = "";
  let platformAttempts = 0;
  while (platform === "") {
    platformAttempts++;
    if (platformAttempts > MAX_PLATFORM_ATTEMPTS) {
      yield {
        message: "Too many invalid platform attempts. A valid platform is required. Stopping.",
        done: true,
      };
      return undefined;
    }
    const platformResponse: string | undefined = yield {
      message: platformAttempts === 1
        ? "Which platform does this Brand publish to? (facebook | instagram | linkedin | youtube) Facebook, Instagram, and YouTube have verified Apify actors for Trend Research and Performance tracking today; LinkedIn is roadmap."
        : "Please enter one of: facebook, instagram, linkedin, or youtube. (Facebook, Instagram, and YouTube have verified Apify actors today; LinkedIn is roadmap.)",
      prompt: "Platform:",
    } as ConductorTurn;
    const rawPlatform = (platformResponse ?? "").trim().toLowerCase();
    if (
      rawPlatform === "facebook" ||
      rawPlatform === "instagram" ||
      rawPlatform === "linkedin" ||
      rawPlatform === "youtube"
    ) {
      platform = rawPlatform;
    }
    // On empty or unrecognised: loop continues; the next iteration shows the re-ask message.
  }

  // --- Seed pages (at least 1 required) ---
  const seedPages: string[] = [];
  let seedAttempt = 0;
  while (seedPages.length === 0) {
    seedAttempt++;
    if (seedAttempt > 5) {
      yield {
        message: "No seed pages supplied. At least one peer Page URL is required for Trend Research. Stopping.",
        done: true,
      };
      return undefined;
    }
    const seedResponse: string | undefined = yield {
      message: seedAttempt === 1
        ? "Add at least one peer/competitor Page URL for Trend Research. (e.g. 'https://www.facebook.com/SomePeerPage')"
        : "Please enter a peer Page URL (at least one is required):",
      prompt: "Seed URL:",
    } as ConductorTurn;
    const url = (seedResponse ?? "").trim();
    if (url.length > 0) {
      seedPages.push(url);
    }
  }

  // Ask for more seed pages (optional, stop on empty).
  // Cap at 10 additional entries so a misconfigured test feed cannot spin forever.
  const MAX_ADDITIONAL_SEEDS = 10;
  let additionalCount = 0;
  let moreSeed: string | undefined = yield {
    message: `Got: ${seedPages[0]}. Add another seed page? (Enter a URL or press Enter to skip)`,
    prompt: "Additional seed page (or Enter to skip):",
  } as ConductorTurn;
  while ((moreSeed ?? "").trim().length > 0 && additionalCount < MAX_ADDITIONAL_SEEDS) {
    seedPages.push((moreSeed ?? "").trim());
    additionalCount++;
    moreSeed = yield {
      message: `Added. Add another? (Enter to stop)`,
      prompt: "Additional seed page (or Enter to skip):",
    } as ConductorTurn;
  }

  // --- Build and scaffold ---
  const answers: BrandInterviewAnswers = {
    name: displayName,
    niche,
    voice,
    language,
    region,
    platform,
    seedPages,
    // Deferred fields are omitted — will be gathered before Publish/track.
  };

  const brandProfile = buildBrandProfile(answers);
  const seeds = buildSeeds(answers);
  const ledger = buildEmptyLedger();

  const scaffoldOpts = brandsRoot !== undefined
    ? { brandsRoot, templatePath }
    : { templatePath };
  try {
    await scaffoldBrand(finalSlug, { brandProfile, seeds, ledger }, scaffoldOpts);
  } catch (err: unknown) {
    yield {
      message: `Failed to create Brand "${finalSlug}": ${String(err)}`,
      done: true,
    };
    return undefined;
  }

  yield {
    message: [
      `Brand "${finalSlug}" created successfully.`,
      `  Profile: data/brands/${finalSlug}/brand-profile.yaml`,
      `  Seeds:   data/brands/${finalSlug}/seeds.yaml`,
      `  Ledger:  data/brands/${finalSlug}/ledger.json`,
      "",
      "Continuing with the pipeline...",
    ].join("\n"),
  };

  return finalSlug;
}

// ---------------------------------------------------------------------------
// conductorTurns — the testable async generator
// ---------------------------------------------------------------------------

/**
 * The conductor's turn-based async generator. Yields one `ConductorTurn` per Operator interaction.
 *
 * Tests drive this by calling `.next(/* response *\/)` on the generator, passing the Operator's
 * text response for each `prompt` turn. The `getInput` option is an alternative: it is called
 * automatically by the generator when a prompt response is needed (used by the CLI main entry).
 *
 * Design: the generator yields a `ConductorTurn` with a `prompt` when user input is required.
 * The generator-based design allows turn-by-turn unit tests without mocking stdin.
 *
 * @param brand    The Brand slug (e.g. `"mundotip"`), or undefined for no-argument mode.
 * @param options  Injectable options for testing (paths, ports, clock, input).
 */
export async function* conductorTurns(
  brand: string | undefined,
  options: RunPipelineOptions = {},
): AsyncGenerator<ConductorTurn, void, string | undefined> {
  const brandsRoot = options.brandsRoot;
  const queuePath = options.queuePath;
  const dbPath = options.dbPath ?? DEFAULT_DB_PATH;
  const templatePath = options.templatePath ?? "templates/brand-skeleton";
  const nowFn = options.now ?? (() => new Date().toISOString());
  const nowDateFn = options.nowDate ?? (() => new Date());
  const magnific = options.magnific ?? DEFAULT_MAGNIFIC_PORT;
  const apify = options.apify ?? DEFAULT_APIFY_PORT;

  // ---------------------------------------------------------------------------
  // Step 0: No-argument and unknown-slug onboarding (Slice 7)
  // ---------------------------------------------------------------------------

  // Resolve the final brand slug that the rest of the loop will use.
  // This may be: the passed-in slug (if the Brand exists), a slug picked from existing Brands,
  // or a slug derived + validated from the new-Brand interview.
  let resolvedBrand: string;

  if (brand === undefined) {
    // --- No-argument mode: ask new-vs-existing ---
    const existing = await listBrands(brandsRoot);

    if (existing.length === 0) {
      // No Brands yet — go directly to the new-Brand interview
      yield { message: "No existing Brands found. Let's create your first Brand." };
      const interviewResult: string | undefined = yield* runNewBrandInterview(
        undefined, brandsRoot, templatePath,
      );
      if (interviewResult === undefined) return;
      resolvedBrand = interviewResult;
    } else {
      // List existing Brands and ask new-vs-existing
      const brandList = existing.map((s) => `  - ${s}`).join("\n");
      const choiceResponse: string | undefined = yield {
        message: [
          "Existing Brands:",
          brandList,
        ].join("\n"),
        prompt: "Type a Brand slug to continue with an existing Brand, or type 'new' to create a new Brand:",
      } as ConductorTurn;

      const choice = (choiceResponse ?? "").trim().toLowerCase();

      if (choice === "new") {
        // Route into the new-Brand interview
        const interviewResult: string | undefined = yield* runNewBrandInterview(
          undefined, brandsRoot, templatePath,
        );
        if (interviewResult === undefined) return;
        resolvedBrand = interviewResult;
      } else if (existing.includes(choice)) {
        // Operator picked an existing Brand
        resolvedBrand = choice;
      } else {
        // Re-prompt (just once — if still invalid, stop)
        const retryResponse: string | undefined = yield {
          message: `"${choice}" is not a known Brand slug. Please type one of the listed slugs or 'new'.`,
          prompt: "Type a Brand slug or 'new':",
        } as ConductorTurn;

        const retryChoice = (retryResponse ?? "").trim().toLowerCase();
        if (retryChoice === "new") {
          const interviewResult: string | undefined = yield* runNewBrandInterview(
            undefined, brandsRoot, templatePath,
          );
          if (interviewResult === undefined) return;
          resolvedBrand = interviewResult;
        } else if (existing.includes(retryChoice)) {
          resolvedBrand = retryChoice;
        } else {
          yield {
            message: `"${retryChoice}" is not a known Brand slug and 'new' was not typed. Stopping.`,
            done: true,
          };
          return;
        }
      }
    }
  } else {
    // --- Brand was supplied: check if it exists ---
    const slugValidation = validateSlug(deriveSlug(brand));
    if (!slugValidation.ok) {
      // The supplied slug is invalid (all-non-alphanumeric)
      yield {
        message: `Cannot use "${brand}" as a Brand slug: ${slugValidation.reason}`,
        done: true,
      };
      return;
    }

    const exists = await brandExists(brand, brandsRoot);
    if (!exists) {
      // Unknown slug: offer to create that Brand
      const offerResponse: string | undefined = yield {
        message: `Brand "${brand}" not found.`,
        prompt: `Would you like to create a new Brand with slug "${brand}"? (yes/no)`,
      } as ConductorTurn;

      const accepted = (offerResponse ?? "").trim().toLowerCase();
      if (accepted === "yes" || accepted === "y") {
        // Route into the new-Brand interview with the pre-supplied slug hint
        const interviewResult: string | undefined = yield* runNewBrandInterview(
          brand, brandsRoot, templatePath,
        );
        if (interviewResult === undefined) return;
        resolvedBrand = interviewResult;
      } else {
        yield {
          message: `Understood. No Brand was created. Stopping.`,
          done: true,
        };
        return;
      }
    } else {
      resolvedBrand = brand;
    }
  }

  // From here on, `resolvedBrand` is the slug of an existing Brand on disk.
  brand = resolvedBrand;

  const brandPaths = resolveBrand(brand, brandsRoot);
  const resolvedQueuePath = queuePath ?? brandPaths.queuePath;

  yield { message: `Running pipeline for Brand: ${brand}` };

  // --- Step 2: Readiness check (never cached) ---

  // Determine whether the Channel has a performance baseline yet, for the readiness advisory.
  // The real baseline is the tracker's per-metric medians {shares, comments, reactions, views,
  // updated_at}; a baseline "exists" once `updated_at` is set. (There is no `baseline.value`.)
  // Reads through `ledger.ts`'s own `loadBaseline` (issue #205 sweep) — never a raw
  // `readFile`/`JSON.parse` of the ledger, which bypassed the store boundary and, unlike
  // `loadBaseline`, silently swallowed a genuinely CORRUPT ledger as "no baseline" instead of
  // propagating it (data-handling rule 4).
  const baseline = await loadBaseline(brandPaths.ledger);
  const baselineExists = typeof baseline.updated_at === "string" && baseline.updated_at.length > 0;

  const findings: Finding[] = await runReadiness({
    brandProfilePath: brandPaths.brandProfile,
    seedsPath: brandPaths.seeds,
    baselineExists,
    magnific,
    apify,
  });

  // The conductor is SILENT when all findings are advisory-only or there are none — EXCEPT for one
  // narrow, named carve-out (issue #253, Round 2): an actor-existence advisory (a configured Apify
  // actor slug confirmed dead or unreachable) is printed unconditionally, whether or not a `block`
  // finding also exists that run. Every other advisory-only finding keeps the general silent default.
  // Without this carve-out the advisory is computed by `probeConfiguredActors` and then simply never
  // shown to a human in the common case (a healthy Brand with one bad actor slug) — indistinguishable
  // from no check existing at all, which is the exact bug issue #253 was filed to close.
  const blockFindings = findings.filter((f) => f.severity === "block");

  if (blockFindings.length > 0) {
    const lines: string[] = ["Readiness check:"];
    for (const f of findings) {
      const icon = f.severity === "block" ? "[BLOCK]" : "[WARN]";
      lines.push(`  ${icon} (${f.phase}) ${f.message}`);
    }
    yield { message: lines.join("\n") };
  } else {
    const actorAdvisories = findings.filter(isActorExistenceFinding);
    if (actorAdvisories.length > 0) {
      const lines: string[] = ["Readiness check:"];
      for (const f of actorAdvisories) {
        lines.push(`  [WARN] (${f.phase}) ${f.message}`);
      }
      yield { message: lines.join("\n") };
    }
  }

  // Phase-scoped blocking: a research block stops the launch
  if (findingsBlockPhase(findings, "research")) {
    yield {
      message: "Cannot proceed: one or more readiness blocks prevent research from starting. Resolve the issues above and re-run.",
      done: true,
    };
    return;
  }

  // --- Step 3: Rename hint ---

  const week = isoWeek(nowDateFn());
  yield { message: `/rename ${brand} · ${week}` };

  // --- Step 4: In-flight detection and resume-vs-fresh ---

  const ideas = await loadIdeas(brandPaths.ledger, brand);
  const allJobs = await loadQueue(resolvedQueuePath);
  const brandJobs = allJobs.jobs.filter((j) => j.brand === brand);
  const phaseResult = resolvePhase(ideas, brandJobs);

  // In-flight means production is underway (an accepted Idea, or one with an Asset in flight — ADR-0011).
  // A "review" phase (only suggested Ideas) is NOT in-flight: the Operator just hasn't started yet.
  // We only ask resume-vs-fresh when actual production work is in progress — not for un-reviewed Ideas.
  const isInFlight =
    phaseResult.phase === "production" ||
    phaseResult.phase === "publish" ||
    phaseResult.phase === "tracking";

  let startFresh = false;

  if (isInFlight) {
    const gateList = phaseResult.pendingGates.length > 0
      ? `Pending gates: ${phaseResult.pendingGates.join(", ")}.`
      : "No pending gates (queue is draining).";
    const strandedNote = phaseResult.strandedIdeas.length > 0
      ? ` ${phaseResult.strandedIdeas.length} stranded Idea(s) need re-enqueue.`
      : "";

    const inFlightMessage = [
      `In-flight work detected for Brand: ${brand}`,
      `Current phase: ${phaseResult.phase}. ${gateList}${strandedNote}`,
    ].join("\n");

    const resumeResponse: string | undefined = yield {
      message: inFlightMessage,
      prompt: "resume or fresh? (type 'resume' or 'fresh')",
    } as ConductorTurn;

    let response = (resumeResponse ?? "").trim().toLowerCase();

    // Re-prompt until we get an explicit choice (no default). Capped at 3 like the name/language/
    // platform loops — an uncapped loop spins forever against the default getInput (which returns "").
    const MAX_RESUME_ATTEMPTS = 3;
    let resumeAttempts = 0;
    while (response !== "resume" && response !== "fresh") {
      resumeAttempts++;
      if (resumeAttempts > MAX_RESUME_ATTEMPTS) {
        yield {
          message: "Too many invalid attempts. A choice of 'resume' or 'fresh' is required. Stopping.",
          done: true,
        };
        return;
      }
      const retry: string | undefined = yield {
        message: `Please type 'resume' or 'fresh'. No other value is accepted.`,
        prompt: "resume or fresh? (type 'resume' or 'fresh')",
      } as ConductorTurn;
      response = (retry ?? "").trim().toLowerCase();
    }

    if (response === "resume") {
      // Re-enqueue stranded Ideas
      if (phaseResult.strandedIdeas.length > 0) {
        const lines: string[] = [`Resuming: re-enqueueing ${phaseResult.strandedIdeas.length} stranded Idea(s)...`];

        // Open + migrate the SAME SQLite database `/run-worker` drains, BY DEFAULT — never depending on
        // a markdown instruction being followed (issue #254, QA round-1 Defect 2). Migrating an
        // already-current database is a safe no-op (`runMigrations`'s own contract). If even OPENING the
        // database fails (e.g. an unwritable path), the re-enqueue loop below still runs against the
        // file queue alone — a database problem never blocks the attended, file-based pipeline.
        let db: DatabaseSync | undefined;
        try {
          db = await openDatabase(dbPath);
          runMigrations(db);
        } catch (err) {
          lines.push(`  SQL sync unavailable: could not open/migrate "${dbPath}" (${err instanceof Error ? err.message : String(err)}). Continuing with the file queue only.`);
          db = undefined;
        }

        try {
          for (const ideaId of phaseResult.strandedIdeas) {
            // Re-enqueue the SAME Recipes the Idea was originally accepted with (issue #54's recorded
            // `recipes`, issue #56). An Idea accepted before Recipe selection existed (every real Idea
            // today) carries no `recipes` — fall back to the one wired Recipe so today's single-recipe
            // path keeps working unchanged.
            const strandedIdea = findIdea(ideas, ideaId);
            const recipes = strandedIdea?.recipes && strandedIdea.recipes.length > 0
              ? strandedIdea.recipes
              : [DEFAULT_ASSET_RECIPE];
            const enqueueOptions: EnqueueOnAcceptOptions = {
              ledgerPath: brandPaths.ledger,
              queuePath: resolvedQueuePath,
              now: nowFn,
              ...(db !== undefined ? { db } : {}),
              ...(brandsRoot !== undefined ? { brandsRoot } : {}),
            };
            try {
              await enqueueOnAccept(ideaId, brand, recipes, enqueueOptions);
              lines.push(`  Enqueued: ${ideaId}`);
            } catch (err) {
              // `enqueueOnAccept` always writes the file queue BEFORE attempting the SQL sync
              // (`enqueue-on-accept.ts`'s own contract), so a thrown error here means ONLY the SQL sync
              // failed — surface it plainly (never silently), never retry, and keep processing the
              // remaining stranded Ideas rather than aborting the whole resume.
              lines.push(`  Enqueued (file queue only — SQL sync failed): ${ideaId}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        } finally {
          db?.close();
        }

        yield { message: lines.join("\n") };
      } else {
        yield { message: `Resuming from phase: ${phaseResult.phase}` };
      }
      startFresh = false;
    } else {
      // NOTE: "fresh" does NOT reset anything on disk — existing queue jobs and accepted Ideas (and
      // any Assets in flight) are left untouched. It only re-enters the loop at Gate 1 instead of resuming the
      // in-flight phase. Message says exactly that, so it does not imply a wipe it doesn't perform.
      yield {
        message: "Starting fresh from Gate 1 (Review). Existing production work is left in place — nothing on disk is reset.",
      };
      startFresh = true;
    }
  }

  // --- Step 5: Loop execution ---

  // Determine the effective phase to drive from
  const effectivePhase = startFresh ? "research" : phaseResult.phase;
  const productionBlocked = findingsBlockPhase(findings, "production");
  const publishBlocked = findingsBlockPhase(findings, "publish");

  // --- Gate 1: Review (research or review phase) ---

  if (effectivePhase === "research" || effectivePhase === "review") {
    yield {
      message: [
        `Gate 1 — Review. Brand: ${brand}`,
        `Run /run-trends ${brand} <format> to discover Trends and generate Ideas for one of the Brand's Formats, then /review-ideas ${brand} to accept or reject them.`,
        `When you have accepted Ideas, run /run-pipeline ${brand} again to continue.`,
      ].join("\n"),
      prompt: "Press Enter when done with Review (or type 'done')",
    };
    // The conductor pauses here — after the Operator responds, it continues
    // Production auto-drain happens after Review in the resumed invocation
    yield {
      message: [
        `Gate 1 complete. Brand: ${brand}`,
        "Any Ideas you accepted during /review-ideas were auto-enqueued for production; if you accepted none, nothing was enqueued.",
        `After production drains to the Cast gate, run /run-pipeline ${brand} again to continue.`,
      ].join("\n"),
      done: false,
    };
    return;
  }

  // --- Production phase: auto-drain to Cast gate ---

  if (effectivePhase === "production") {
    if (productionBlocked) {
      yield {
        message: [
          `Production is blocked for Brand: ${brand}`,
          "Resolve the readiness issues above before production can proceed.",
        ].join("\n"),
        done: true,
      };
      return;
    }

    // Check if any Ideas have an Asset paused at the Cast gate (ADR-0011: no more flat "casting"
    // status). "Waiting to be queued" now means accepted with NO Assets recorded yet (today's
    // real-ledger shape) — an Idea already at the Cast gate is still base-status "accepted" too, so
    // this must EXCLUDE it to keep the two buckets mutually exclusive (mirrors the old flat
    // accepted-vs-casting split).
    const castingIdeas = ideas.filter((i) => ideaAtGate(i, "cast"));
    const acceptedIdeas = ideas.filter((i) => i.status === "accepted" && (i.assets ?? []).length === 0);

    if (acceptedIdeas.length > 0) {
      yield {
        message: [
          `Auto-draining production queue for Brand: ${brand}`,
          `${acceptedIdeas.length} Idea(s) queued for cast generation.`,
          `The producer will drain the queue to the Cast gate. Run /queue ${brand} to see progress.`,
          `When an Idea reaches the Cast gate, run /run-pipeline ${brand} again.`,
        ].join("\n"),
        done: false,
      };
      return;
    }

    if (castingIdeas.length > 0) {
      // Gate 2: Cast pick
      yield {
        message: [
          `Gate 2 — Cast pick. Brand: ${brand}`,
          `${castingIdeas.length} Idea(s) are at the Cast gate, waiting for a Character pick.`,
          ...castingIdeas.map((i) => `  Idea: ${i.id} — run /pick-cast ${brand} ${i.id} <n>`),
          `After picking, the Asset will render unattended. Run /run-pipeline ${brand} again when done.`,
        ].join("\n"),
        prompt: "Press Enter when you have picked a Character (or type 'done')",
      };
      yield {
        message: [
          `Gate 2 acknowledged. Brand: ${brand}`,
          `The producer will complete the Asset once your Character pick is processed. Run /run-pipeline ${brand} when production reaches 'produced' status.`,
        ].join("\n"),
        done: false,
      };
      return;
    }
  }

  // --- Publish phase ---

  if (effectivePhase === "publish") {
    if (publishBlocked) {
      yield {
        message: [
          `Publish is blocked for Brand: ${brand}`,
          "Resolve the readiness issues above before publishing.",
        ].join("\n"),
        done: true,
      };
      return;
    }

    // ADR-0011: "produced" is now an Asset stage, not a flat Idea status.
    const producedIdeas = ideas.filter((i) => ideaHasAssetStatus(i, "produced"));

    if (producedIdeas.length > 0) {
      // ADR-0012: the composed Copy is stored structured on each produced Asset and surfaced VERBATIM
      // here — the Operator reviews the exact caption/hashtags they are about to publish, never a
      // summary. `/log-post` is attribution-explicit (Idea, Recipe) — the hint names both (issue #56).
      const lines: string[] = [
        `Gate 3 — Publish. Brand: ${brand}`,
        `${producedIdeas.length} Asset(s) are ready for publication.`,
      ];
      for (const idea of producedIdeas) {
        const producedAssets = (idea.assets ?? []).filter((a) => a.status === "produced");
        for (const asset of producedAssets) {
          lines.push(
            `  Idea: ${idea.id} — Recipe: ${asset.recipe} — publish and run ` +
              `/log-post ${brand} ${idea.id} ${asset.recipe} <facebook-url>`,
          );
          if (asset.copy !== undefined) {
            lines.push(`    Copy: ${asset.copy.caption}`);
            if (asset.copy.hashtags.length > 0) {
              lines.push(`    Hashtags: ${asset.copy.hashtags.join(" ")}`);
            }
          }
        }
      }
      yield {
        message: lines.join("\n"),
        prompt: "Press Enter when you have published and logged the Post URL (or type 'done')",
      };

      // After post logged, offer /track-performance and /report
      yield {
        message: [
          `Gate 3 complete. Brand: ${brand}`,
          `When engagement has accrued (give it a few days), run:`,
          `  /track-performance ${brand}`,
          `  /report ${brand}`,
        ].join("\n"),
        done: true,
      };
      return;
    }
  }

  // --- Tracking / done phase ---

  if (effectivePhase === "tracking") {
    yield {
      message: [
        `Brand: ${brand} — Posts are ready for performance tracking.`,
        `Run /track-performance ${brand} to measure performance, then /report ${brand} to see results.`,
      ].join("\n"),
      done: true,
    };
    return;
  }

  if (effectivePhase === "done") {
    const report = await reportCommand(brand, brandPaths.ledger, brandsRoot);
    yield {
      message: [
        `Weekly loop complete for Brand: ${brand}`,
        "",
        report,
      ].join("\n"),
      done: true,
    };
    return;
  }

  // Fallback
  yield {
    message: `Brand: ${brand} — pipeline state unclear. Run /queue ${brand} and /report ${brand} to check.`,
    done: true,
  };
}

// ---------------------------------------------------------------------------
// runPipelineCommand — testable wrapper
// ---------------------------------------------------------------------------

/**
 * Run the conductor and collect all turn messages into an array (for testing without spawning a
 * subprocess). When a prompt is reached, `getInput(prompt)` is called to get the Operator's
 * response; if `getInput` is not provided, a default no-op response is used (empty string).
 *
 * @param brand    The Brand slug, or undefined for no-argument mode (new-vs-existing prompt).
 * @param options  Injectable options including the `getInput` callback.
 * @returns        All `ConductorTurn` objects yielded by the generator.
 */
export async function runPipelineCommand(
  brand: string | undefined,
  options: RunPipelineOptions = {},
): Promise<ConductorTurn[]> {
  const getInput = options.getInput ?? (() => Promise.resolve(""));
  const turns: ConductorTurn[] = [];
  const gen = conductorTurns(brand, options);

  let result = await gen.next(undefined);
  while (!result.done) {
    const turn = result.value;
    turns.push(turn);
    if (turn.done) break;

    let response: string | undefined;
    if (turn.prompt !== undefined) {
      response = await getInput(turn.prompt);
    }
    result = await gen.next(response);
  }

  return turns;
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

/**
 * CLI entry: print conductor output and read responses from stdin. Only runs when invoked directly.
 * Usage:
 *   `npx tsx src/commands/run-pipeline.ts <brand>` — run for an existing Brand or onboard a new one.
 *   `npx tsx src/commands/run-pipeline.ts` (no argument) — choose between new Brand and existing Brands.
 *
 * With no argument: the conductor asks whether the Operator is starting a new Brand or working an
 * existing one. The `<brand>` argument is now optional — omitting it triggers the new-vs-existing
 * prompt rather than a usage error.
 */
export async function main(): Promise<void> {
  const brand = process.argv[2]; // may be undefined

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const getInput = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(`${prompt} `, resolve));

  // Stream the generator directly: print each turn's message BEFORE prompting for its input, so the
  // Operator sees the context ("In-flight work detected…", gate instructions, readiness findings)
  // that explains the bare prompt — not a wall of buffered text dumped only after the session ends.
  try {
    const gen = conductorTurns(brand);
    let result = await gen.next(undefined);
    while (!result.done) {
      const turn = result.value;
      process.stdout.write(turn.message + "\n");
      if (turn.done) break;

      let response: string | undefined;
      if (turn.prompt !== undefined) {
        response = await getInput(turn.prompt);
      }
      result = await gen.next(response);
    }
  } finally {
    rl.close();
  }
}

// C41: compare resolved paths, not a hand-built `file://` string — the latter breaks on paths with
// spaces (percent-encoded in `import.meta.url`) or symlinks, silently making a direct run a no-op.
const entryPoint = process.argv[1];
if (entryPoint !== undefined && fileURLToPath(import.meta.url) === resolve(entryPoint)) {
  main().catch((err: unknown) => {
    process.stderr.write(`/run-pipeline failed: ${String(err)}\n`);
    process.exitCode = 1;
  });
}
