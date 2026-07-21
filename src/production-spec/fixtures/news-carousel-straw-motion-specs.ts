/**
 * The `produce-news-carousel` Skill's graduated output — Straw Motion's REAL baseline strings,
 * proving issue #87 AC2 (the graduated map-#77 prototype yields a spec that passes BOTH #81's
 * validator AND #85's author-phase checklist).
 *
 * Unlike `news-carousel-author-checklist-specs.ts`'s `TEST_BASELINE` (deliberately a STAND-IN,
 * different from any one real Brand/Format, proving the checklist is genuinely parameterized —
 * issue #85), `STRAW_MOTION_BASELINE` below is the OPPOSITE proof: it carries Straw Motion's own,
 * real, committed strings — read from
 * `data/brands/straw-motion/baseline-prompts/unhypped-news/news-carousel.md` (issue #83) — so a
 * companion test can assert the Skill's target output is genuinely on-contract for a REAL (Brand x
 * Format), not just an invented one.
 *
 * `strawMotionIdeaOneCarouselSpec()` is idea-01's 7 on-contract prompts (map ticket #77's validated
 * prototype output, 10/10 on the author checklist), assembled here from clause CONSTANTS that are
 * themselves verbatim substrings of the real committed document (verified by
 * `news-carousel-straw-motion-fixture.test.ts`, which reads the document and asserts containment) —
 * mirroring the Skill's own step 2 ("assemble each prompt from the baseline template, swapping only
 * the bracketed parts; keep every fixed clause verbatim").
 *
 * `IDEA_01_AUTHORED_SLIDES`'s "shift"/"proof"/"different"/"next" `text` values were rewritten (issue
 * #108): the ORIGINAL authored copy joined clauses with em dashes ("...same move — ChatGPT Work,
 * Claude Cowork, Muse Spark — AI that finishes tasks...") — a live, reproduction-confirmed instance of
 * the exact "tell" issue #108 forbids, caught by this file's own companion test once the new
 * `no-dash-tells` checklist item landed. Rewritten as separate short sentences, meaning preserved,
 * still within `CAROUSEL_TEXT_MAX_CHARS` (140).
 */

import { CAROUSEL_ROLES, type CarouselRole, type CarouselSlide } from "../news-carousel-contract.ts";
import type { NewsCarouselBaselineParams } from "../news-carousel-author-checklist.ts";

// ---------------------------------------------------------------------------
// Straw Motion's REAL Baseline Prompt strings (news-carousel.md, "★ THE BASELINE PROMPT")
// ---------------------------------------------------------------------------

/** The real, committed document's own logo reference-image name (news-carousel.md line 63). */
const LOGO_REFERENCE_NAME = "Straw_Motion_Logo";

/** The real, committed document's own pill/eyebrow badge text (news-carousel.md line 71). */
const PILL_TEXT = "Unhypped News";

/** The real, committed document's own never-all-caps guardrail sentence (news-carousel.md line 72-73). */
const NEVER_ALL_CAPS_INSTRUCTION =
  "Never render it in all-caps/uppercase lettering, no matter the surrounding typography style.";

/**
 * Five clauses that appear VERBATIM in the real document's reusable template AND in both of its
 * confirmed worked examples (`3.1-final`/`3.2-final`) — mirroring
 * `news-carousel-author-checklist-specs.ts`'s `TEST_BASELINE.fixedClauses` shape (5 entries), but
 * these five are Straw Motion's REAL strings, not a stand-in.
 */
const FIXED_CLAUSES = [
  "A vertical viral Instagram news post.",
  "Render the logo exactly as provided in the reference image: do not change its shape, " +
    "proportions, or color in any way, and do not restyle it to match the scene.",
  "A soft dark vignette sits behind it for legibility against the photo.",
  "solid white rounded card",
  "Clean editorial social media news page layout. Photorealistic, crisp bold typography overlay " +
    "for the photo, clean flat UI-card typography for the card.",
] as const; // a fixed 5-tuple (not a general array) so indexed access below stays non-undefined

/** The document's two confirmed card styles (news-carousel.md, "Card style" bullet). */
const CONFIRMED_CARD_STYLES: readonly string[] = ["full_width", "floating_toast"];

/** Straw Motion's real `unhypped-news` × `news-carousel` Baseline Prompt, as `auditNewsCarouselAuthorPhase` needs it. */
export const STRAW_MOTION_BASELINE: NewsCarouselBaselineParams = {
  logoReferenceName: LOGO_REFERENCE_NAME,
  pillText: PILL_TEXT,
  neverAllCapsInstruction: NEVER_ALL_CAPS_INSTRUCTION,
  fixedClauses: FIXED_CLAUSES,
  confirmedCardStyles: CONFIRMED_CARD_STYLES,
};

// ---------------------------------------------------------------------------
// The image-prompt assembler — the Skill's step 2, mirroring the document's reusable template
// ---------------------------------------------------------------------------

type CardStyle = "full_width" | "floating_toast";

function photoClause(cardStyle: CardStyle): string {
  return cardStyle === "full_width"
    ? "A full frame high quality photograph, cropped to the top ~70% of the frame"
    : "A full frame high quality photograph filling the entire frame edge to edge";
}

function logoClause(edge: "top" | "bottom"): string {
  return (
    `Along the ${edge} edge of the photo, lay the connected reference image ${LOGO_REFERENCE_NAME} ` +
    "horizontally, small and subtle in scale — no wider than roughly a third of the frame width — " +
    "so it stays a quiet brand mark and never competes with the headline or stat callout for " +
    `attention. ${FIXED_CLAUSES[1]} ${FIXED_CLAUSES[2]}`
  );
}

interface Inset {
  readonly corner: string;
  readonly subject: string;
  readonly caption?: string;
}

function insetClause(inset: Inset | null): string {
  if (inset === null) return "";
  return inset.caption
    ? `In the ${inset.corner}, a small circular inset photo shows a close-up of ${inset.subject}, ` +
        `with the text "${inset.caption}" above it.`
    : `In the ${inset.corner}, a small circular inset photo shows a close-up of ${inset.subject}. ` +
        "No caption text.";
}

function cardClause(cardStyle: CardStyle): string {
  return cardStyle === "full_width"
    ? "Below the photo, filling the bottom ~30% of the frame, is a solid white rounded card " +
        "sitting on top of the image like a native app UI panel, full width, edge to edge."
    : "Near the bottom of the frame, inset with a visible margin of photo on all sides (not " +
        "touching the frame edges), floats a compact solid white rounded card, like a notification " +
        "toast. A soft dark vignette sits behind the card, in the photo, for legibility and " +
        "separation — in addition to its own subtle drop shadow.";
}

function pillClause(companies: readonly string[]): string {
  const logoRow =
    companies.length > 0
      ? ` Positioned next to the pill are ${companies.length} tiny real product logos (${companies.join(", ")}) in a row.`
      : "";
  return (
    "Inside the card, top-left, is a pill-shaped badge — a fully rounded, stadium-shaped outline " +
    `with a thin black border and a white fill — containing the text "${PILL_TEXT}" centered inside ` +
    `it, set in Inter font, black text. Render the text inside the pill exactly as "${PILL_TEXT}" — ` +
    `capital U, capital N, every other letter lowercase. ${NEVER_ALL_CAPS_INSTRUCTION}${logoRow}`
  );
}

function cardTextClause(stat: string, line: string): string {
  return (
    `Below that, in large bold black display type, is the stat callout "${stat}", and beneath it, ` +
    `in smaller near-black sentence-case text, the supporting line "${line}" All text on the card ` +
    `— inside the "${PILL_TEXT}" pill, the stat callout, and the supporting line — is set in Inter.`
  );
}

function buildImagePrompt(input: {
  readonly cardStyle: CardStyle;
  readonly logoEdge: "top" | "bottom";
  readonly subject: string;
  readonly companies: readonly string[];
  readonly statCallout: string;
  readonly text: string;
  readonly inset: Inset | null;
}): string {
  return [
    `${FIXED_CLAUSES[0]} ${photoClause(input.cardStyle)}, of ${input.subject}.`,
    logoClause(input.logoEdge),
    insetClause(input.inset),
    cardClause(input.cardStyle),
    pillClause(input.companies),
    cardTextClause(input.statCallout, input.text),
    FIXED_CLAUSES[4],
  ]
    .filter((clause) => clause.length > 0)
    .join(" ");
}

// ---------------------------------------------------------------------------
// idea-01's authored per-slide content (map ticket #77's validated prototype, 10/10)
// ---------------------------------------------------------------------------

interface AuthoredSlide {
  readonly role: CarouselRole;
  readonly cardStyle: CardStyle;
  readonly logoEdge: "top" | "bottom";
  readonly statCallout: string;
  readonly companies: readonly string[];
  readonly text: string;
  readonly subject: string;
  readonly inset: Inset | null;
}

const IDEA_01_AUTHORED_SLIDES: readonly AuthoredSlide[] = [
  {
    role: "hook",
    cardStyle: "full_width",
    logoEdge: "top",
    statCallout: "3 companies.",
    companies: ["OpenAI", "Anthropic", "Meta"],
    text: "A week ago your AI answered questions. This week it clocked into a job.",
    subject:
      "a desk filling the frame with two laptops side by side — the left screen glowing dim blue " +
      "with a plain chat conversation, the right screen glowing warm and bright with a task-tracker " +
      "mid-completion, a checkbox caught mid-tick; same desk, same lighting, only the screen content " +
      "and colour temperature differ left to right",
    inset: null,
  },
  {
    role: "then",
    cardStyle: "floating_toast",
    logoEdge: "top",
    statCallout: "Just answers.",
    companies: ["OpenAI", "Anthropic", "Meta"],
    text: '"AI assistant" meant a chat window. You asked, it answered, you still did the work.',
    subject:
      "a single laptop on a plain desk, its screen showing an ordinary AI chat conversation — a " +
      "question typed, a paragraph answered, nothing more; calm slightly dim room light, shallow " +
      "depth of field",
    inset: null,
  },
  {
    role: "shift",
    cardStyle: "full_width",
    logoEdge: "top",
    statCallout: "Same week.",
    companies: ["OpenAI", "Anthropic", "Meta"],
    text:
      "OpenAI, Anthropic, and Meta all made the same move. ChatGPT Work, Claude Cowork, and Muse " +
      "Spark. AI that finishes tasks, not just talks.",
    subject:
      "an overhead desk shot of three different laptops arranged side by side, each screen glowing " +
      "with a distinct, believable task-assistant interface mid-task — three separate tools at " +
      "work, none claiming to be any real product's actual screen; real device materials and screen " +
      "glow, shallow depth of field on the nearest laptop",
    inset: null,
  },
  {
    role: "proof",
    cardStyle: "floating_toast",
    logoEdge: "top",
    statCallout: "Off your list.",
    companies: ["OpenAI", "Anthropic", "Meta"],
    text:
      "Each one can take something off your list. Write the follow-up, run the report, handle the " +
      "busywork. It never needs babysitting.",
    subject:
      "a laptop screen filling most of the frame on a clean desk, showing a task-and-checklist app " +
      "with one item's checkbox actively ticking itself off; a coffee cup steaming just in frame, " +
      "warm mid-morning window light, nobody in frame",
    inset: {
      corner: "bottom-right corner of the photo",
      subject: "the checklist item's checkmark completing",
      caption: "JOB: DONE",
    },
  },
  {
    role: "different",
    cardStyle: "full_width",
    logoEdge: "top",
    statCallout: "Time back.",
    companies: ["OpenAI", "Anthropic", "Meta"],
    text: "For a small business, that's real time back. You still need to check the work before it goes out.",
    subject:
      "a candid, believable photograph of a small-business owner in their late thirties leaning " +
      "back in a chair, relaxed, a coffee mug in hand, glancing at a wristwatch; a laptop sits " +
      "softly out of focus behind them with a single document flagged for a quick review; natural " +
      "window light, realistic skin and fabric texture, shallow depth of field",
    inset: null,
  },
  {
    role: "next",
    cardStyle: "floating_toast",
    logoEdge: "top",
    statCallout: "Not a one-off.",
    companies: ["OpenAI", "Anthropic", "Meta"],
    text:
      "Three competitors landing this at once means it's not a one-off. Expect every AI tool you use " +
      "to start moving this way.",
    subject:
      "an overhead desk shot with three different devices — a laptop, a tablet, and a phone — each " +
      "screen realistically lit and each showing a different, distinct app interface, hinting the " +
      "same 'AI finishes the task' idea now showing up everywhere; real device materials and screen " +
      "glow, shallow depth of field on the nearest device",
    inset: null,
  },
  {
    role: "cta",
    cardStyle: "full_width",
    logoEdge: "top",
    statCallout: "Follow along.",
    companies: ["OpenAI", "Anthropic", "Meta"],
    text: 'Follow along as we track how far "hands-off AI" actually gets.',
    subject:
      "the same desk-with-two-laptops scene as the opening slide, framed the same way as a matching " +
      "end card — one screen showing a plain chat, the other a task-tracker mid-completion; " +
      "consistent lighting and composition so the last slide reads as a bookend to the first",
    inset: null,
  },
];

if (IDEA_01_AUTHORED_SLIDES.length !== CAROUSEL_ROLES.length) {
  // Defensive, mirrors the registry's own import-time guards: fail loudly if this fixture's role
  // list ever drifts from the contract's CAROUSEL_ROLES instead of silently authoring the wrong count.
  throw new Error(
    "news-carousel-straw-motion-specs: IDEA_01_AUTHORED_SLIDES does not have CAROUSEL_ROLES.length entries.",
  );
}

/**
 * idea-01's graduated 7-slide News Carousel Production Spec — Straw Motion's real Baseline Prompt
 * strings, assembled the same way the `produce-news-carousel` Skill's step 2 does (issue #87 AC2).
 * Untyped as `Record<string, unknown>` (matching `fixtures/news-carousel-specs.ts`'s own
 * convention) so it can be fed straight to `validateNewsCarouselSpec`/`auditNewsCarouselAuthorPhase`
 * as an untrusted candidate, exactly like a real Skill's JSON output would be.
 */
export function strawMotionIdeaOneCarouselSpec(): Record<string, unknown> {
  const slides: CarouselSlide[] = IDEA_01_AUTHORED_SLIDES.map((s, i) => ({
    slide_index: i,
    role: s.role,
    card_style: s.cardStyle,
    stat_callout: s.statCallout,
    text: s.text,
    companies: s.companies,
    image_prompt: buildImagePrompt(s),
  }));
  return { slides };
}
