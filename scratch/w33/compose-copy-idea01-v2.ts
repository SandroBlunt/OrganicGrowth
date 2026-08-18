/**
 * Compose idea-01 V2 Copy from the approved v2 captions (news-brief voice). Bound fixes applied:
 *  - LinkedIn: drop leading calendar emoji (max 1 emoji) + reword source so @Google isn't followed
 *    by ")" (LinkedIn inline-mention syntax check).
 *  - X: trim to <=280 combined (caption + hashtags).
 *  - TikTok: trim caption to <=150 (its platform bound), hashtags moved to the array.
 * Facebook + Instagram kept as given (Instagram's trailing hashtags moved to the hashtags array).
 */
import { getRecipe } from "../../src/recipe/registry.ts";
import { loadCopyRules, loadChannels } from "../../src/production-spec/brand-profile.ts";
import { newsCarouselSlideNarrative } from "../../src/copy/news-carousel-slide-narrative.ts";
import { injectRequiredParts } from "../../src/copy/inject.ts";
import { weaveLinkedInMentions } from "../../src/copy/linkedin-mentions.ts";
import { validateCopy, validateCopyForPlatform, checkCombinedCaptionHashtagsCap } from "../../src/copy/validate.ts";
import { platformCopyShapeFor } from "../../src/copy/platform-shape.ts";
import { auditCopyPhase } from "../../src/recipe/phase-contract.ts";
import type { CopyInput } from "../../src/copy/draft.ts";
import type { Copy, CopyVariant } from "../../src/copy/contract.ts";
import { readFile, writeFile } from "node:fs/promises";

const PROFILE = "/Users/CaxtonTaylor/Developer/OrganicGrowth/data/brands/straw-motion/brand-profile.yaml";
const SPEC = "/Users/CaxtonTaylor/Developer/OrganicGrowth/data/brands/straw-motion/ideas/unhypped-daily/2026-W33/friday-14-august/idea-01.news-carousel.spec.json";
const OUT_JSON = "/Users/CaxtonTaylor/Developer/OrganicGrowth/scratch/w33/copy-idea01-v2.json";

const FB = `🗓️ Google shipped Gemini 3.7 Flash on August 13, just 21 days after the last one.

If you wired 3.6 Flash into your product this month, you're already a version behind.

The new model targets coding, web dev, and agent work. On Google's own DeepSWE coding test the score went from 49.0% to 65.3%, and Code Arena Elo landed at 1588.

It's launching at 50% off: $0.75 in and $3.75 out per million tokens through year end.

In January that doubles to $1.50 and $7.50.

The cheap price is a hook to pull you off rivals, and it has about five months left.

What's the fastest a tool has gone stale on you? 🤔

Source: Google (@Google) on X, Ars Technica.`;

const IG_BODY = `🗓️ Google shipped Gemini 3.7 Flash just 21 days after 3.6.

The model you added this month is already a version behind.

It's built for coding, web dev, and agent work. On Google's own DeepSWE coding test the score jumped from 49.0% to 65.3%.

The launch price is 50% off: $0.75 in and $3.75 out per million tokens.

In January it doubles to $1.50 and $7.50.

That discount is a hook with about five months on the clock.

How do you keep up when models change every few weeks? 🤔

Source: Google (@Google), Ars Technica.`;

// LinkedIn: leading calendar emoji removed (max 1 emoji), source reworded so @Google is a clean
// inline mention (no trailing paren for the syntax check).
const LI = `Google shipped Gemini 3.7 Flash on August 13, 21 days after 3.6 Flash.

If your team integrated 3.6 this month, you are already on an older version.

The model is aimed at coding, web development, and agent workflows. On Google's own DeepSWE coding test, the score went from 49.0% to 65.3%. Code Arena Elo came in at 1588.

The launch price is 50% off through the end of the year. That works out to $0.75 for input and $3.75 for output per million tokens.

In January it doubles to $1.50 and $7.50.

For engineering teams, the harder cost is the pace. A new model every three weeks means another round of testing and migration.

Budget against the January price. The launch discount will be gone by then.

How is your team deciding when a model swap is worth it? 🤔

Source: @Google on X, Ars Technica.`;

// X: trimmed to fit the 280 combined cap, voice kept.
const X = `🗓️ Google shipped Gemini 3.7 Flash 21 days after 3.6.

Wire in 3.6 this month and you're already behind.

50% off now: $0.75 in, $3.75 out per million. It doubles in January.

How fast is too fast for a model to change? 🤔

Source: @Google, Ars Technica.`;

// TikTok: trimmed to fit the 150 caption cap, hashtags moved to the array.
const TT_BODY = `🗓️ Google dropped Gemini 3.7 Flash 21 days after the last one. Half price now, doubles in January. Which AI tool keeps you on the treadmill? 🤔`;

const CAPTIONS: Record<string, { caption: string; hashtags: string[] }> = {
  facebook: { caption: FB, hashtags: [] },
  instagram: { caption: IG_BODY, hashtags: ["#AInews", "#Gemini", "#AItools"] },
  linkedin: { caption: LI, hashtags: [] },
  x: { caption: X, hashtags: [] },
  tiktok: { caption: TT_BODY, hashtags: ["#AInews", "#Gemini", "#AItools"] },
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
  const targeted = channels.filter((c) => ["facebook", "instagram", "linkedin", "x", "tiktok"].includes(c.platform));

  const variants: CopyVariant[] = [];
  let primaryVariant: CopyVariant | null = null;
  let anyFail = false;

  for (const ch of targeted) {
    const hand = CAPTIONS[ch.platform];
    if (!hand) { console.log(`NO CAPTION ${ch.platform}`); anyFail = true; continue; }
    const injected = injectRequiredParts({ caption: hand.caption, hashtags: hand.hashtags }, rules);
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
    const combinedLen = [...`${caption}${injected.hashtags.length ? " " + injected.hashtags.join(" ") : ""}`].length;
    console.log(`\n=== ${ch.platform}${ch.primary ? " (PRIMARY)" : ""} === capLen=${capLen} combined=${combinedLen} unresolved=[${unresolved.join(",")}]`);
    if (errors.length === 0) console.log("  VALID");
    else { anyFail = true; console.log("  ERRORS:", JSON.stringify(errors)); }
    const v: CopyVariant = {
      platform: ch.platform, caption, hashtags: injected.hashtags,
      ...(unresolved.length > 0 ? { unresolvedMentions: unresolved } : {}),
    };
    variants.push(v);
    if (ch.primary) primaryVariant = v;
  }

  const primary = primaryVariant ?? variants[0]!;
  const finalCopy: Copy = { caption: primary.caption, hashtags: primary.hashtags, variants };
  const audit = auditCopyPhase(recipe, { candidateCopy: { caption: primary.caption, hashtags: primary.hashtags }, rules });
  console.log("\n== auditCopyPhase ok ==", audit.ok);
  for (const it of audit.items) console.log(`  [${it.ok === null ? "JUDGE" : it.ok ? "PASS" : "FAIL"}] ${it.id}${it.detail ? " :: " + it.detail : ""}`);
  if (anyFail || !audit.ok) { console.log("\nNOT WRITING."); process.exitCode = 1; return; }
  await writeFile(OUT_JSON, JSON.stringify(finalCopy, null, 2) + "\n");
  console.log("\nWROTE ->", OUT_JSON);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
