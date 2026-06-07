/**
 * Tests for the new-Brand onboarding extensions to the `/run-pipeline` conductor.
 *
 * Covers:
 *   - AC1: Unknown slug → offer to create Brand; accept → interview + scaffold; decline → done.
 *   - AC2: No argument → new-vs-existing prompt listing existing Brands; pick existing → runs; pick new → interview.
 *   - AC3: Staged interview — only pre-scout fields asked (niche, voice, language/region, platform, seed pages).
 *   - AC4: Never invents brand facts — scaffolded brand-profile reflects only Operator answers.
 *   - AC5: Slug validation — all-non-alphanumeric name rejected with clear message; no directory created.
 *
 * All tests are hermetic:
 *   - No live Magnific Space calls (fake MagniticReadinessPort injected).
 *   - No live Apify calls (fake ApifyReadinessPort injected).
 *   - No credits spent, no board mutation.
 *   - All file I/O uses temp directories.
 *
 * The Magnific fake is explicitly flagged — MAGNIFIC FAKE comments below.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as yamlParse } from "yaml";

import {
  runPipelineCommand,
  type ConductorTurn,
  type RunPipelineOptions,
} from "./run-pipeline.ts";
import type { MagniticReadinessPort, ApifyReadinessPort } from "./run-pipeline-ports.ts";

// ---------------------------------------------------------------------------
// MAGNIFIC FAKE — injected in ALL tests; never the live Space
// ---------------------------------------------------------------------------

/** Healthy fake Magnific port: Space accessible, credits OK. */
function makeMagniticFake(opts: { accessible?: boolean; creditsOk?: boolean } = {}): MagniticReadinessPort {
  return {
    async probeSpace() {
      return {
        accessible: opts.accessible ?? true,
        creditsOk: opts.creditsOk ?? true,
      };
    },
  };
}

/** Healthy fake Apify port: token valid. */
function makeApifyFake(opts: { tokenValid?: boolean } = {}): ApifyReadinessPort {
  return {
    async probeToken() {
      return opts.tokenValid ?? true;
    },
  };
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

interface OnboardingFixturePaths {
  brandsRoot: string;
  queuePath: string;
  tmpRoot: string;
}

/**
 * Create a temp brands root (no Brands inside it by default).
 * Optionally pre-create a Brand directory for tests that need an existing Brand.
 */
async function withEmptyBrandsRoot(
  fn: (paths: OnboardingFixturePaths) => Promise<void>,
): Promise<void> {
  const tmpRoot = await mkdtemp(join(tmpdir(), "og-onboarding-"));
  const brandsRoot = join(tmpRoot, "brands");
  const queuePath = join(tmpRoot, "queue.json");
  await mkdir(brandsRoot, { recursive: true });
  try {
    await fn({ brandsRoot, queuePath, tmpRoot });
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

const HEALTHY_PROFILE_YAML = `
channel:
  name: TestBrand
  platform: facebook
  url: "https://www.facebook.com/testbrand"
niche: "Test niche for testing"
voice: "Test voice for testing"
formats: [reel]
language: en
region: US
banned_words: ["bad-word"]
brand_safety: []
`.trim();

const HEALTHY_SEEDS_YAML = `
seed_pages:
  - "https://www.facebook.com/seed1"
language: en
region: US
`.trim();

const EMPTY_LEDGER = JSON.stringify({ ideas: [], baseline: { updated_at: null } }, null, 2);

/** Pre-create an existing Brand directory with healthy config files. */
async function createExistingBrand(brandsRoot: string, slug: string): Promise<void> {
  const brandDir = join(brandsRoot, slug);
  await mkdir(brandDir, { recursive: true });
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(brandDir, "brand-profile.yaml"), HEALTHY_PROFILE_YAML, "utf8");
  await writeFile(join(brandDir, "seeds.yaml"), HEALTHY_SEEDS_YAML, "utf8");
  await writeFile(join(brandDir, "ledger.json"), EMPTY_LEDGER, "utf8");
}

/** Standard healthy options for tests. MAGNIFIC FAKE + APIFY FAKE always injected. */
function healthyOptions(
  paths: OnboardingFixturePaths,
  extra: Partial<RunPipelineOptions> = {},
): RunPipelineOptions {
  return {
    brandsRoot: paths.brandsRoot,
    queuePath: paths.queuePath,
    now: () => "2026-06-06T10:00:00.000Z",
    nowDate: () => new Date("2026-06-01T00:00:00.000Z"),
    magnific: makeMagniticFake(),  // MAGNIFIC FAKE
    apify: makeApifyFake(),         // APIFY FAKE
    templatePath: "templates/brand-skeleton",
    ...extra,
  };
}

function allMessages(turns: ConductorTurn[]): string {
  return turns.map((t) => t.message).join("\n---\n");
}

// ===========================================================================
// AC1: Unknown slug → offer to create Brand
// ===========================================================================

describe("onboarding — AC1: Unknown slug offers to create Brand", () => {
  it("shows an offer-to-create message naming the unknown slug", async () => {
    await withEmptyBrandsRoot(async (paths) => {
      // Provide 'no' to decline creation so the test doesn't need to drive the interview
      const turns = await runPipelineCommand("newbrand", {
        ...healthyOptions(paths),
        getInput: async () => "no",
      });
      const out = allMessages(turns);
      assert.match(out, /newbrand/i, "Offer message must name the unknown slug");
      assert.match(out, /create|onboard|new brand/i, "Offer message must mention creation");
    });
  });

  it("prompts the Operator to accept or decline", async () => {
    await withEmptyBrandsRoot(async (paths) => {
      const promptsSeen: string[] = [];
      await runPipelineCommand("newbrand", {
        ...healthyOptions(paths),
        getInput: async (prompt) => {
          promptsSeen.push(prompt);
          return "no";
        },
      });
      const hasOfferPrompt = promptsSeen.some((p) => /yes|no|create|accept|decline/i.test(p));
      assert.ok(hasOfferPrompt, "A prompt asking to accept or decline must be shown");
    });
  });

  it("stops cleanly when Operator declines with no Brand directory created", async () => {
    await withEmptyBrandsRoot(async (paths) => {
      const turns = await runPipelineCommand("newbrand", {
        ...healthyOptions(paths),
        getInput: async () => "no",
      });
      const doneTurn = turns.find((t) => t.done === true);
      assert.ok(doneTurn, "Conductor must stop with done:true when Operator declines");

      // No Brand directory should have been created
      const { stat: fsStat } = await import("node:fs/promises");
      let existed = false;
      try {
        await fsStat(join(paths.brandsRoot, "newbrand"));
        existed = true;
      } catch {
        // expected — directory should not exist
      }
      assert.equal(existed, false, "No Brand directory should be created when Operator declines");
    });
  });

  it("starts the interview when Operator accepts", async () => {
    await withEmptyBrandsRoot(async (paths) => {
      const promptsSeen: string[] = [];
      // Accept creation, then provide interview answers, then stop
      let promptCount = 0;
      await runPipelineCommand("newbrand", {
        ...healthyOptions(paths),
        getInput: async (prompt) => {
          promptsSeen.push(prompt);
          promptCount++;
          if (promptCount === 1) return "yes"; // accept creation offer
          // Provide interview answers in sequence
          if (/niche/i.test(prompt)) return "Home improvement tips";
          if (/voice/i.test(prompt)) return "Friendly and direct";
          if (/language/i.test(prompt)) return "en";
          if (/region/i.test(prompt)) return "US";
          if (/platform/i.test(prompt)) return "facebook";
          // Must check for "additional" BEFORE the generic seed/page match so the loop terminates.
          if (/additional|enter to skip/i.test(prompt)) return "";
          if (/seed|page/i.test(prompt)) return "https://www.facebook.com/peer1";
          return "done";
        },
      });
      // The interview must ask for niche, voice, language/region, platform, seed pages
      const askedNiche = promptsSeen.some((p) => /niche/i.test(p));
      const askedVoice = promptsSeen.some((p) => /voice/i.test(p));
      const askedSeed = promptsSeen.some((p) => /seed|page/i.test(p));
      assert.ok(askedNiche, "Interview must ask for niche");
      assert.ok(askedVoice, "Interview must ask for voice");
      assert.ok(askedSeed, "Interview must ask for at least one seed page");
    });
  });

  it("scaffolds the Brand directory after a successful interview", async () => {
    await withEmptyBrandsRoot(async (paths) => {
      let promptCount = 0;
      await runPipelineCommand("newbrand", {
        ...healthyOptions(paths),
        getInput: async (prompt) => {
          promptCount++;
          if (promptCount === 1) return "yes";
          if (/niche/i.test(prompt)) return "Home improvement tips";
          if (/voice/i.test(prompt)) return "Friendly and direct";
          if (/language/i.test(prompt)) return "en";
          if (/region/i.test(prompt)) return "US";
          if (/platform/i.test(prompt)) return "facebook";
          // Stop the additional-seed loop before the generic seed/page match.
          if (/additional|enter to skip/i.test(prompt)) return "";
          if (/seed|page/i.test(prompt)) return "https://www.facebook.com/peer1";
          return "done";
        },
      });

      // Brand directory must exist after interview
      const { stat: fsStat } = await import("node:fs/promises");
      const s = await fsStat(join(paths.brandsRoot, "newbrand"));
      assert.ok(s.isDirectory(), "Brand directory must be created after a successful interview");
    });
  });
});

// ===========================================================================
// AC2: No argument → new-vs-existing prompt
// ===========================================================================

describe("onboarding — AC2: No argument triggers new-vs-existing prompt", () => {
  it("lists existing Brands when no argument is given and Brands exist", async () => {
    await withEmptyBrandsRoot(async (paths) => {
      // Pre-create a Brand
      await createExistingBrand(paths.brandsRoot, "mundotip");

      const turns = await runPipelineCommand(undefined as unknown as string, {
        ...healthyOptions(paths),
        getInput: async () => "mundotip", // pick existing
      });
      const out = allMessages(turns);
      assert.match(out, /mundotip/i, "Existing Brand slugs must be listed");
    });
  });

  it("asks new-vs-existing when no argument is given", async () => {
    await withEmptyBrandsRoot(async (paths) => {
      await createExistingBrand(paths.brandsRoot, "mundotip");

      const promptsSeen: string[] = [];
      await runPipelineCommand(undefined as unknown as string, {
        ...healthyOptions(paths),
        getInput: async (prompt) => {
          promptsSeen.push(prompt);
          return "mundotip"; // pick existing
        },
      });
      const hasNewVsExisting = promptsSeen.some((p) => /new|existing|brand|create/i.test(p));
      assert.ok(hasNewVsExisting, "A new-vs-existing prompt must be shown when no argument is given");
    });
  });

  it("continues with the existing Brand when Operator picks one", async () => {
    await withEmptyBrandsRoot(async (paths) => {
      await createExistingBrand(paths.brandsRoot, "mundotip");

      const turns = await runPipelineCommand(undefined as unknown as string, {
        ...healthyOptions(paths),
        getInput: async (prompt) => {
          if (/new|existing|brand|create/i.test(prompt)) return "mundotip";
          return "done";
        },
      });
      const out = allMessages(turns);
      // After picking mundotip, the conductor should proceed with that brand
      assert.match(out, /mundotip/i, "Conductor must proceed with the picked Brand");
    });
  });

  it("notes no existing Brands when none exist and goes to new-Brand interview", async () => {
    await withEmptyBrandsRoot(async (paths) => {
      // No Brands in the root
      const turns = await runPipelineCommand(undefined as unknown as string, {
        ...healthyOptions(paths),
        getInput: async (prompt) => {
          // Provide name to start interview, then quit
          if (/name/i.test(prompt)) return "TestBrand";
          if (/niche/i.test(prompt)) return "Home tips";
          if (/voice/i.test(prompt)) return "Friendly";
          if (/language/i.test(prompt)) return "en";
          if (/region/i.test(prompt)) return "US";
          if (/platform/i.test(prompt)) return "facebook";
          // Stop the additional-seed loop before the generic seed/page match.
          if (/additional|enter to skip/i.test(prompt)) return "";
          if (/seed|page/i.test(prompt)) return "https://www.facebook.com/peer1";
          return "done";
        },
      });
      const out = allMessages(turns);
      // Should mention no Brands exist OR just go to the interview
      const mentionsNoExisting = /no brand|no existing|first brand/i.test(out);
      const hasInterviewOutput = /niche|voice|seed/i.test(out) || turns.length > 1;
      assert.ok(
        mentionsNoExisting || hasInterviewOutput,
        "When no Brands exist, conductor should either mention it or go directly to interview",
      );
    });
  });
});

// ===========================================================================
// AC3: Staged interview — pre-scout fields only
// ===========================================================================

describe("onboarding — AC3: Staged interview asks only pre-scout fields", () => {
  it("does NOT ask for Channel URL during the pre-scout interview", async () => {
    await withEmptyBrandsRoot(async (paths) => {
      const promptsSeen: string[] = [];
      let promptCount = 0;
      await runPipelineCommand("newbrand", {
        ...healthyOptions(paths),
        getInput: async (prompt) => {
          promptsSeen.push(prompt);
          promptCount++;
          if (promptCount === 1) return "yes"; // accept creation
          if (/niche/i.test(prompt)) return "Home tips";
          if (/voice/i.test(prompt)) return "Friendly";
          if (/language/i.test(prompt)) return "en";
          if (/region/i.test(prompt)) return "US";
          if (/platform/i.test(prompt)) return "facebook";
          // Stop the additional-seed loop before the generic seed/page match.
          if (/additional|enter to skip/i.test(prompt)) return "";
          if (/seed|page/i.test(prompt)) return "https://www.facebook.com/peer1";
          return "done";
        },
      });
      const askedChannelUrl = promptsSeen.some((p) => /channel\s*url|page\s*url|facebook\.com.*your/i.test(p));
      assert.equal(askedChannelUrl, false, "Channel URL must NOT be asked in the pre-scout interview");
    });
  });

  it("does NOT ask for banned words during the pre-scout interview", async () => {
    await withEmptyBrandsRoot(async (paths) => {
      const promptsSeen: string[] = [];
      let promptCount = 0;
      await runPipelineCommand("newbrand", {
        ...healthyOptions(paths),
        getInput: async (prompt) => {
          promptsSeen.push(prompt);
          promptCount++;
          if (promptCount === 1) return "yes";
          if (/niche/i.test(prompt)) return "Home tips";
          if (/voice/i.test(prompt)) return "Friendly";
          if (/language/i.test(prompt)) return "en";
          if (/region/i.test(prompt)) return "US";
          if (/platform/i.test(prompt)) return "facebook";
          // Stop the additional-seed loop before the generic seed/page match.
          if (/additional|enter to skip/i.test(prompt)) return "";
          if (/seed|page/i.test(prompt)) return "https://www.facebook.com/peer1";
          return "done";
        },
      });
      const askedBannedWords = promptsSeen.some((p) => /banned.?word/i.test(p));
      assert.equal(askedBannedWords, false, "Banned words must NOT be asked in the pre-scout interview");
    });
  });

  it("does NOT ask for required CTA during the pre-scout interview", async () => {
    await withEmptyBrandsRoot(async (paths) => {
      const promptsSeen: string[] = [];
      let promptCount = 0;
      await runPipelineCommand("newbrand", {
        ...healthyOptions(paths),
        getInput: async (prompt) => {
          promptsSeen.push(prompt);
          promptCount++;
          if (promptCount === 1) return "yes";
          if (/niche/i.test(prompt)) return "Home tips";
          if (/voice/i.test(prompt)) return "Friendly";
          if (/language/i.test(prompt)) return "en";
          if (/region/i.test(prompt)) return "US";
          if (/platform/i.test(prompt)) return "facebook";
          // Stop the additional-seed loop before the generic seed/page match.
          if (/additional|enter to skip/i.test(prompt)) return "";
          if (/seed|page/i.test(prompt)) return "https://www.facebook.com/peer1";
          return "done";
        },
      });
      const askedCta = promptsSeen.some((p) => /\bcta\b|call.to.action/i.test(p));
      assert.equal(askedCta, false, "Required CTA must NOT be asked in the pre-scout interview");
    });
  });

  it("does NOT ask for required hashtags during the pre-scout interview", async () => {
    await withEmptyBrandsRoot(async (paths) => {
      const promptsSeen: string[] = [];
      let promptCount = 0;
      await runPipelineCommand("newbrand", {
        ...healthyOptions(paths),
        getInput: async (prompt) => {
          promptsSeen.push(prompt);
          promptCount++;
          if (promptCount === 1) return "yes";
          if (/niche/i.test(prompt)) return "Home tips";
          if (/voice/i.test(prompt)) return "Friendly";
          if (/language/i.test(prompt)) return "en";
          if (/region/i.test(prompt)) return "US";
          if (/platform/i.test(prompt)) return "facebook";
          // Stop the additional-seed loop before the generic seed/page match.
          if (/additional|enter to skip/i.test(prompt)) return "";
          if (/seed|page/i.test(prompt)) return "https://www.facebook.com/peer1";
          return "done";
        },
      });
      const askedHashtags = promptsSeen.some((p) => /hashtag/i.test(p));
      assert.equal(askedHashtags, false, "Required hashtags must NOT be asked in the pre-scout interview");
    });
  });
});

// ===========================================================================
// AC4: Never invents brand facts
// ===========================================================================

describe("onboarding — AC4: Never invents brand facts", () => {
  it("brand-profile.yaml contains exactly the niche the Operator supplied", async () => {
    await withEmptyBrandsRoot(async (paths) => {
      const expectedNiche = "Precision woodworking and joinery techniques";
      let promptCount = 0;
      await runPipelineCommand("woodcraft", {
        ...healthyOptions(paths),
        getInput: async (prompt) => {
          promptCount++;
          if (promptCount === 1) return "yes";
          if (/niche/i.test(prompt)) return expectedNiche;
          if (/voice/i.test(prompt)) return "Technical and precise";
          if (/language/i.test(prompt)) return "en";
          if (/region/i.test(prompt)) return "US";
          if (/platform/i.test(prompt)) return "facebook";
          // Stop the additional-seed loop before the generic seed/page match.
          if (/additional|enter to skip/i.test(prompt)) return "";
          if (/seed|page/i.test(prompt)) return "https://www.facebook.com/woodpeer";
          return "done";
        },
      });

      const profileText = await readFile(join(paths.brandsRoot, "woodcraft", "brand-profile.yaml"), "utf8");
      const parsed = yamlParse(profileText) as Record<string, unknown>;
      assert.equal(parsed["niche"], expectedNiche, "Niche must be exactly the Operator's answer");
    });
  });

  it("brand-profile.yaml has empty channel.url (not fabricated) when not supplied", async () => {
    await withEmptyBrandsRoot(async (paths) => {
      let promptCount = 0;
      await runPipelineCommand("emptyurl", {
        ...healthyOptions(paths),
        getInput: async (prompt) => {
          promptCount++;
          if (promptCount === 1) return "yes";
          if (/niche/i.test(prompt)) return "Home tips";
          if (/voice/i.test(prompt)) return "Friendly";
          if (/language/i.test(prompt)) return "en";
          if (/region/i.test(prompt)) return "US";
          if (/platform/i.test(prompt)) return "facebook";
          // Stop the additional-seed loop before the generic seed/page match.
          if (/additional|enter to skip/i.test(prompt)) return "";
          if (/seed|page/i.test(prompt)) return "https://www.facebook.com/peer1";
          return "done";
        },
      });

      const profileText = await readFile(join(paths.brandsRoot, "emptyurl", "brand-profile.yaml"), "utf8");
      const parsed = yamlParse(profileText) as { channel?: { url?: string } };
      // channel.url must be empty or absent — never a fabricated URL
      const url = parsed.channel?.url ?? "";
      assert.doesNotMatch(url, /http|TODO|example/i, "channel.url must not be a fabricated URL");
    });
  });

  it("seeds.yaml contains exactly the seed page the Operator supplied", async () => {
    await withEmptyBrandsRoot(async (paths) => {
      const expectedSeed = "https://www.facebook.com/specificpeerpage";
      let promptCount = 0;
      await runPipelineCommand("seedcheck", {
        ...healthyOptions(paths),
        getInput: async (prompt) => {
          promptCount++;
          if (promptCount === 1) return "yes";
          if (/niche/i.test(prompt)) return "Home tips";
          if (/voice/i.test(prompt)) return "Friendly";
          if (/language/i.test(prompt)) return "en";
          if (/region/i.test(prompt)) return "US";
          if (/platform/i.test(prompt)) return "facebook";
          // Stop the additional-seed loop before the generic seed/page match.
          if (/additional|enter to skip/i.test(prompt)) return "";
          if (/seed|page/i.test(prompt)) return expectedSeed;
          return "done";
        },
      });

      const seedsText = await readFile(join(paths.brandsRoot, "seedcheck", "seeds.yaml"), "utf8");
      const parsed = yamlParse(seedsText) as Record<string, unknown>;
      const pages = parsed["seed_pages"] as string[];
      assert.ok(Array.isArray(pages));
      assert.ok(pages.includes(expectedSeed), `seeds.yaml must contain exactly "${expectedSeed}"`);
    });
  });
});

// ===========================================================================
// AC5: Slug validation — invalid name rejected with clear message
// ===========================================================================

describe("onboarding — AC5: Slug validation before scaffolding", () => {
  it("rejects an all-non-alphanumeric Brand slug argument with a clear message", async () => {
    await withEmptyBrandsRoot(async (paths) => {
      // The conductor receives "!!!" as the brand argument.
      // slugify("!!!") === "" — the conductor must reject before offering to create.
      const turns = await runPipelineCommand("!!!", {
        ...healthyOptions(paths),
        getInput: async () => "yes",
      });
      const out = allMessages(turns);
      // Since "!!!" slugifies to "" which is invalid, the conductor must NOT create a directory.
      const { stat: fsStat } = await import("node:fs/promises");
      let anyDirCreated = false;
      try {
        await fsStat(join(paths.brandsRoot, "!!!"));
        anyDirCreated = true;
      } catch { /* not found — expected */ }
      assert.equal(anyDirCreated, false, "No directory should be created for invalid slug '!!!'");
      // The output should indicate the slug is invalid
      assert.match(out, /invalid|not valid|no letters|no numbers|cannot|valid/i, "Output must indicate invalid slug");
      const hasStop = turns.some((t) => t.done);
      assert.ok(hasStop, "Conductor must stop with done:true for an invalid slug");
    });
  });

  it("rejects an invalid name entered during the no-argument interview", async () => {
    await withEmptyBrandsRoot(async (paths) => {
      // No-argument mode: no Brands exist, so conductor goes straight to new-Brand interview.
      // The Operator supplies "???" as the Brand name — which slugifies to "" — the conductor
      // must reject it and re-ask (up to the attempt limit).
      let nameAttempt = 0;
      const turns = await runPipelineCommand(undefined as unknown as string, {
        ...healthyOptions(paths),
        getInput: async (prompt) => {
          if (/name/i.test(prompt)) {
            nameAttempt++;
            // Keep supplying invalid name — conductor should reject each time
            return "???";
          }
          if (/niche/i.test(prompt)) return "Home tips";
          if (/voice/i.test(prompt)) return "Friendly";
          if (/language/i.test(prompt)) return "en";
          if (/region/i.test(prompt)) return "US";
          if (/platform/i.test(prompt)) return "facebook";
          if (/seed|page/i.test(prompt)) return "https://www.facebook.com/peer1";
          return "done";
        },
      });
      const out = allMessages(turns);
      // The output must mention the invalid name at least once
      assert.match(out, /not a valid|no letters|no numbers|invalid|cannot/i, "Output must flag the invalid name");
      // After exceeding attempt limit the conductor stops
      const hasStop = turns.some((t) => t.done);
      assert.ok(hasStop, "Conductor must eventually stop after too many invalid name attempts");
    });
  });

  it("no Brand directory created when slug is invalid", async () => {
    await withEmptyBrandsRoot(async (paths) => {
      await runPipelineCommand("!!!", {
        ...healthyOptions(paths),
        getInput: async () => "yes",
      });
      const { stat: fsStat } = await import("node:fs/promises");
      let anyDirCreated = false;
      try {
        await fsStat(join(paths.brandsRoot, "!!!"));
        anyDirCreated = true;
      } catch { /* not found — expected */ }
      assert.equal(anyDirCreated, false, "No directory should be created for slug '!!!'");
    });
  });
});
