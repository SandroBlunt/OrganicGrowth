/**
 * Compose per-platform Copy for idea-2026-08-14-01's News Carousel, in the Unhypped Daily voice.
 * I (the LLM) hand-write each platform's caption; this script hands off to the deterministic checkers
 * (injectRequiredParts -> weaveLinkedInMentions for LinkedIn -> validateCopy/validateCopyForPlatform).
 */
import { getRecipe } from "../../src/recipe/registry.ts";
import { loadCopyRules, loadChannels } from "../../src/production-spec/brand-profile.ts";
import { newsCarouselSlideNarrative } from "../../src/copy/news-carousel-slide-narrative.ts";
import { injectRequiredParts } from "../../src/copy/inject.ts";
import { weaveLinkedInMentions } from "../../src/copy/linkedin-mentions.ts";
import {
  validateCopy,
  validateCopyForPlatform,
  checkCombinedCaptionHashtagsCap,
} from "../../src/copy/validate.ts";
import { platformCopyShapeFor } from "../../src/copy/platform-shape.ts";
import { auditCopyPhase } from "../../src/recipe/phase-contract.ts";
import type { CopyInput } from "../../src/copy/draft.ts";
import type { Copy, CopyVariant } from "../../src/copy/contract.ts";
import { readFile, writeFile } from "node:fs/promises";

const PROFILE = "/Users/CaxtonTaylor/Developer/OrganicGrowth/data/brands/straw-motion/brand-profile.yaml";
const SPEC = "/Users/CaxtonTaylor/Developer/OrganicGrowth/data/brands/straw-motion/ideas/unhypped-daily/2026-W33/friday-14-august/idea-01.news-carousel.spec.json";
const OUT_JSON = "/Users/CaxtonTaylor/Developer/OrganicGrowth/scratch/w33/copy-idea01.json";

// --- My hand-written captions + hashtags, per targeted platform (Unhypped Daily voice) ---
const FB = `Google just shipped Gemini 3.7 Flash, and here is the part nobody puts on the slide: it landed 21 days after 3.6 Flash. If you wired 3.6 into your product this month, you are already a version behind.

The upgrade is real. On the DeepSWE coding test it jumped from 49.0% to 65.3%, and it lands at 1588 on Code Arena. It is genuinely better at coding, web dev, and agent work.

Here is the catch. That launch price of $0.75 in and $3.75 out per million tokens is 50% off, and it doubles to $1.50 and $7.50 in January. The cheap intro is a hook to pull you off whatever you run now, right before the real bill shows up.

Cheap today is not cheap in five months. Would you switch your whole stack for a discount that expires? Tell us in the comments.`;

const IG = `Google shipped Gemini 3.7 Flash just 21 days after 3.6 Flash. If you integrated 3.6 this month, you are already a version behind.

The gains are real. DeepSWE coding jumped from 49.0% to 65.3%, and it hits 1588 on Code Arena. Better at coding, web dev, and agent work.

The catch: the launch price of $0.75 in and $3.75 out per million tokens is half off, and it doubles to $1.50 and $7.50 in January. The discount is a hook, not a gift.

Would you move your stack for a price that expires? Tell us in the comments.`;

const LI = `@Google shipped Gemini 3.7 Flash 21 days after 3.6 Flash. If your team integrated 3.6 earlier this month, you are already maintaining a last-generation model.

The improvement is measurable. On the DeepSWE coding benchmark it moved from 49.0% to 65.3%, and it lands at 1588 on Code Arena Elo, with real gains in coding, web development, and agent workflows.

The part worth planning for: the introductory price of $0.75 input and $3.75 output per million tokens is a 50% discount, and it doubles to $1.50 and $7.50 in January. That cheap launch window is designed to move developers off competing APIs before the full price returns.

Two questions for engineering leaders. Is the migration cost worth a five-month discount? And can your team absorb this release cadence without integration fatigue?

We cover what actually shipped and what it really costs you. Follow Straw Motion for the unhypped read on every big AI move.`;

const X = `Google shipped Gemini 3.7 Flash just 21 days after 3.6. Coding jumped 49 to 65 on DeepSWE. The catch: the 50% launch price doubles in January. The cheap intro is a hook, not a gift. Budget before you commit.`;

const TT = `Google dropped Gemini 3.7 Flash 21 days after 3.6. Cheaper today, sure. But that 50% deal doubles in January. The discount is bait 👀`;

const CAPTIONS: Record<string, { caption: string; hashtags: string[] }> = {
  facebook: { caption: FB, hashtags: ["#Gemini", "#GoogleAI", "#AInews", "#DeveloperTools", "#AI"] },
  instagram: { caption: IG, hashtags: ["#Gemini", "#GoogleAI", "#AInews", "#DeveloperTools", "#AI", "#GeminiFlash"] },
  linkedin: { caption: LI, hashtags: ["#Gemini", "#GoogleAI", "#AI", "#DeveloperTools"] },
  x: { caption: X, hashtags: ["#Gemini", "#GoogleAI"] },
  tiktok: { caption: TT, hashtags: ["#Gemini", "#GoogleAI", "#AInews"] },
};

async function main(): Promise<void> {
  const recipe = getRecipe("news-carousel")!;
  const rules = await loadCopyRules(PROFILE);
  const channels = await loadChannels(PROFILE);
  const spec = JSON.parse(await readFile(SPEC, "utf8"));
  const slideNarrative = newsCarouselSlideNarrative(spec);

  const input: CopyInput = {
    title: "Google shipped Gemini 3.7 Flash three weeks after 3.6 and cut the price in half",
    angle: "Rapid release cadence plus a temporary 50% intro price that doubles in January.",
    slideNarrative,
  };

  // Only the platforms this carousel targets (youtube belongs to the short-script Recipe).
  const targeted = channels.filter((c) => ["facebook", "instagram", "linkedin", "x", "tiktok"].includes(c.platform));

  const variants: CopyVariant[] = [];
  let primaryVariant: CopyVariant | null = null;
  let anyFail = false;

  for (const ch of targeted) {
    const hand = CAPTIONS[ch.platform];
    if (!hand) { console.log(`NO CAPTION for ${ch.platform}`); anyFail = true; continue; }
    let injected = injectRequiredParts({ caption: hand.caption, hashtags: hand.hashtags }, rules);

    const mentionsSupported = platformCopyShapeFor(ch.platform)?.supportsMentions === true;
    let unresolved: readonly string[] = [];
    let caption = injected.caption;
    if (mentionsSupported) {
      const woven = await weaveLinkedInMentions(injected.caption, input);
      caption = woven.caption;
      unresolved = woven.unresolvedMentions;
    }
    const candidate: Copy = { caption, hashtags: injected.hashtags };

    const res = ch.primary
      ? validateCopy(candidate, recipe.copyShape, rules)
      : validateCopyForPlatform(candidate, ch.platform, recipe.copyShape, rules);
    const combined = ch.primary ? checkCombinedCaptionHashtagsCap(candidate, ch.platform) : null;
    const errors = [...res.errors, ...(combined ? [combined] : [])];

    const capLen = [...caption].length;
    const combinedLen = [...`${caption} ${injected.hashtags.join(" ")}`].length;
    console.log(`\n=== ${ch.platform}${ch.primary ? " (PRIMARY)" : ""} === capLen=${capLen} combined=${combinedLen} unresolved=[${unresolved.join(",")}]`);
    if (errors.length === 0) {
      console.log("  VALID");
    } else {
      anyFail = true;
      console.log("  ERRORS:", JSON.stringify(errors));
    }

    const v: CopyVariant = {
      platform: ch.platform,
      caption,
      hashtags: injected.hashtags,
      ...(unresolved.length > 0 ? { unresolvedMentions: unresolved } : {}),
    };
    variants.push(v);
    if (ch.primary) primaryVariant = v;
  }

  const primary = primaryVariant ?? variants[0]!;
  const finalCopy: Copy = { caption: primary.caption, hashtags: primary.hashtags, variants };

  // Producer's own copy-phase self-audit against the primary variant.
  const audit = auditCopyPhase(recipe, { candidateCopy: { caption: primary.caption, hashtags: primary.hashtags }, rules });
  console.log("\n== auditCopyPhase ok ==", audit.ok);
  for (const it of audit.items) console.log(`  [${it.ok === null ? "JUDGE" : it.ok ? "PASS" : "FAIL"}] ${it.id}${it.detail ? " :: " + it.detail : ""}`);

  if (anyFail || !audit.ok) {
    console.log("\nNOT WRITING — a variant failed.");
    process.exitCode = 1;
    return;
  }
  await writeFile(OUT_JSON, JSON.stringify(finalCopy, null, 2) + "\n");
  console.log("\nWROTE copy ->", OUT_JSON);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
