/**
 * Author idea-2026-08-14-01's News Carousel Production Spec (Gemini 3.7 Flash story), FRESH.
 * Reuses Straw Motion's REAL, committed baseline clause params (STRAW_MOTION_BASELINE) so every
 * fixed clause is byte-verbatim, then self-audits against the DAILY doc and saves the spec.
 */
import { readFile } from "node:fs/promises";
import { STRAW_MOTION_BASELINE } from "../../src/production-spec/fixtures/news-carousel-straw-motion-specs.ts";
import {
  CAROUSEL_ROLES,
  isCarouselHeroRole,
  type CarouselRole,
  type CarouselSlide,
} from "../../src/production-spec/news-carousel-contract.ts";
import { validateNewsCarouselSpec } from "../../src/production-spec/news-carousel-validate.ts";
import { auditNewsCarouselAuthorPhase } from "../../src/production-spec/news-carousel-author-checklist.ts";
import { saveSpec, specPathFor } from "../../src/production-spec/store.ts";

const B = STRAW_MOTION_BASELINE;
const DAILY_DOC = "/Users/CaxtonTaylor/Developer/OrganicGrowth/data/brands/straw-motion/baseline-prompts/unhypped-daily/news-carousel.md";
const IDEAS_ROOT = "/Users/CaxtonTaylor/Developer/OrganicGrowth/data/brands/straw-motion/ideas/unhypped-daily";
const RUN = "2026-08-14";

type CardStyle = "full_width" | "floating_toast" | "top_card";
type BottomCardStyle = Exclude<CardStyle, "top_card">;

function photoClause(cardStyle: BottomCardStyle): string {
  return cardStyle === "full_width"
    ? "A full frame high quality photograph, cropped to the top ~70% of the frame, that photo " +
        "filling its own region edge to edge with no black margins"
    : "A full frame high quality photograph filling the entire frame edge to edge with no black margins";
}

// Hero-only logo clause (hook ~1/3 width, cta ~1/6 width) + doc-grounded black-plate counters.
function logoClause(edge: "top" | "bottom", role: CarouselRole): string {
  const scale =
    role === "cta"
      ? "no wider than roughly a sixth of the frame width"
      : "no wider than roughly a third of the frame width";
  return (
    `Along the ${edge} edge of the photo, lay ${B.logoReferencePhrase} ${B.logoReferenceName} ` +
    `horizontally, small and subtle in scale — ${scale} — ` +
    "so it stays a quiet brand mark and never competes with the headline or stat callout for " +
    `attention. ${B.heroLogoClauses[0]} ${B.logoNameGuardrailInstruction} ${B.heroLogoClauses[1]} ` +
    "Prefer no darkening at all: the white lettering sits directly on the photograph and reads by " +
    "contrast alone, placed over a darker area of the frame. A visible rectangle, plate, panel, bar " +
    "or box behind the logo is a rendering error."
  );
}

function cardSizeClause(role: CarouselRole): string {
  const clause = isCarouselHeroRole(role) ? B.heroTextCardMinPctClause : B.standardTextCardMinPctClause;
  return `On this slide, ${clause}, so the on-card text reads as the carousel's own visual lead.`;
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

function cardClause(cardStyle: BottomCardStyle): string {
  return cardStyle === "full_width"
    ? "Below the photo is a solid white rounded card sitting on top of the image like a native app UI " +
        "panel, full width, edge to edge, sized per the card-size rule below."
    : "Near the bottom of the frame, inset with a visible margin of photo on all sides (not " +
        "touching the frame edges), floats a solid white rounded card, sized per the card-size rule " +
        "below. A soft dark gradient vignette sits behind the card, in the photo, for legibility and " +
        "separation — never a hard-edged solid black bar or box — in addition to its own subtle " +
        "drop shadow.";
}

// Single-company rows carry the QA "no company name/wordmark/lettering" guard (2026-08-11).
function pillClause(companies: readonly string[]): string {
  let logoRow = "";
  if (companies.length === 1) {
    logoRow =
      ` Positioned next to the pill is a single tiny ${companies[0]} product logo, with no company ` +
      "name, wordmark or any other lettering beside it.";
  } else if (companies.length > 1) {
    logoRow = ` Positioned next to the pill are ${companies.length} tiny real product logos (${companies.join(", ")}) in a row.`;
  }
  return (
    "Inside the card, top-left, is a pill-shaped badge — a fully rounded, stadium-shaped outline " +
    `with a thin black border and a white fill — containing the text "${B.pillText}" centered inside ` +
    `it, set in Inter font, black text. Render the text inside the pill exactly as "${B.pillText}" — ` +
    `capital U, capital N, every other letter lowercase. ${B.neverAllCapsInstruction}${logoRow}`
  );
}

function cardTextClause(stat: string, line: string): string {
  return (
    `Below that, in large bold black display type, is the stat callout "${stat}", and beneath it, ` +
    "in clearly readable near-black sentence-case text (no smaller than roughly 13-14px " +
    `equivalent), the supporting line "${line}" All text on the card ` +
    `— inside the "${B.pillText}" pill, the stat callout, and the supporting line — is set in Inter.`
  );
}

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

function buildImagePrompt(s: AuthoredSlide): string {
  const logo = isCarouselHeroRole(s.role) ? logoClause(s.logoEdge, s.role) : "";
  if (s.cardStyle === "top_card") {
    return [
      B.fixedClauses[0],
      "Across the top of the frame is a solid white rounded card sitting on top of the image like a " +
        "native app UI panel, full width, sized per the card-size rule below.",
      pillClause(s.companies),
      cardTextClause(s.statCallout, s.text),
      cardSizeClause(s.role),
      `Below the white card, the photograph fills the rest of the frame as a full-bleed background ` +
        `layer, edge to edge with no black margins on any side, showing ${s.subject}.`,
      logo,
      insetClause(s.inset),
      B.fixedClauses[2],
    ]
      .filter((c) => c.length > 0)
      .join(" ");
  }
  return [
    `${B.fixedClauses[0]} ${photoClause(s.cardStyle)}, of ${s.subject}.`,
    logo,
    insetClause(s.inset),
    cardClause(s.cardStyle),
    pillClause(s.companies),
    cardTextClause(s.statCallout, s.text),
    cardSizeClause(s.role),
    B.fixedClauses[2],
  ]
    .filter((c) => c.length > 0)
    .join(" ");
}

const SLIDES: readonly AuthoredSlide[] = [
  {
    role: "hook",
    cardStyle: "full_width",
    logoEdge: "top",
    statCallout: "21 days apart.",
    companies: ["Google"],
    text:
      "Google shipped Gemini 3.7 Flash just 21 days after 3.6 Flash. The model you wired in this " +
      "month is already last-gen.",
    subject:
      "a close, slightly overhead shot of a single 27-inch monitor on a developer's desk showing " +
      "Google AI Studio open in a browser, the Gemini model dropdown expanded so both 'Gemini 3.6 " +
      "Flash' and 'Gemini 3.7 Flash' are visible with 3.7 Flash freshly highlighted as the new " +
      "selection; a mechanical keyboard and a half-empty glass of water in the foreground, cool " +
      "evening desk light, shallow depth of field, the real Google AI Studio interface and Gemini " +
      "branding rendered from real reference, any on-screen text kept minimal and legible",
    inset: null,
  },
  {
    role: "then",
    cardStyle: "floating_toast",
    logoEdge: "top",
    statCallout: "Once a year.",
    companies: [],
    text:
      "A big model upgrade used to land once or twice a year. You had months to plan the move and " +
      "test it.",
    subject:
      "a candid photograph of a software developer in their early thirties standing at a " +
      "wall-mounted paper year planner, pen in hand, marking a single quarter of the grid while the " +
      "rest sits empty; a calm home office with a plant and a mug of coffee on the windowsill, soft " +
      "morning light, realistic skin and paper texture, shallow depth of field, no screens in focus",
    inset: null,
  },
  {
    role: "shift",
    cardStyle: "top_card",
    logoEdge: "bottom",
    statCallout: "3 weeks later.",
    companies: ["Google"],
    text:
      "Google shipped Gemini 3.7 Flash 21 days after 3.6, tuned for coding, web dev, and agent work.",
    subject:
      "a real, recognizable photograph of Demis Hassabis, the CEO of Google DeepMind, on a " +
      "conference stage in front of a large dark screen reading Gemini, mid-gesture as he presents; " +
      "grounded in real public photos of him, matching his real appearance, a Google DeepMind " +
      "backdrop, stage lighting, photojournalistic framing, the scene reading as a genuine product " +
      "announcement moment and never a fabricated or unflattering situation",
    inset: null,
  },
  {
    role: "proof",
    cardStyle: "floating_toast",
    logoEdge: "top",
    statCallout: "49 to 65.",
    companies: ["Google"],
    text:
      "On the DeepSWE coding test it jumped from 49.0% to 65.3%. Code Arena Elo landed at 1588.",
    subject:
      "a laptop screen filling most of the frame on a tidy desk, a code editor open beside a " +
      "terminal where a coding agent built on the Google Gemini API works through a multi-step " +
      "software task with several steps already checked off; a second small monitor behind it shows " +
      "a simple bar chart of a benchmark score climbing; warm focused desk light, real device " +
      "materials and screen glow, the on-screen code and UI kept out of sharp focus so no fine text " +
      "needs to be legible, shallow depth of field",
    inset: {
      corner: "bottom-right corner of the photo",
      subject: "the benchmark bar chart reaching its highest point",
      caption: "65.3%",
    },
  },
  {
    role: "different",
    cardStyle: "full_width",
    logoEdge: "top",
    statCallout: "Half price.",
    companies: ["Google"],
    text:
      "This drop ships at 50% off. That is $0.75 in and $3.75 out per million tokens, a deliberate " +
      "hook.",
    subject:
      "a candid over-the-shoulder photograph of a startup founder at a kitchen-table workspace " +
      "looking at the Google AI Studio pricing page open on a laptop, the per-million-token rates " +
      "visible but the fine text soft and out of focus; a paper notebook with quick sums and a " +
      "pocket calculator beside the laptop, late-evening lamp light, realistic hands and desk " +
      "clutter, shallow depth of field",
    inset: null,
  },
  {
    role: "next",
    cardStyle: "floating_toast",
    logoEdge: "top",
    statCallout: "Doubles in January.",
    companies: ["Google"],
    text:
      "That intro price doubles to $1.50 and $7.50 in January. Budget for the jump before you commit.",
    subject:
      "a close photograph of a desk calendar flipped to January with the first week circled in red " +
      "pen, a small paper price tag tucked beside it, and a developer's hand pausing over the page; " +
      "a pocket calculator and a coffee cup just in frame, cool overhead office light, realistic " +
      "paper and ink texture, shallow depth of field",
    inset: null,
  },
  {
    role: "cta",
    cardStyle: "full_width",
    logoEdge: "top",
    statCallout: "No hype.",
    companies: ["Google"],
    text:
      "We track what shipped and what it costs you, minus the hype. Follow Straw Motion.",
    subject:
      "the same 27-inch monitor and desk as the opening slide, framed identically as a closing " +
      "bookend, Google AI Studio open with Gemini 3.7 Flash now the selected model; the same " +
      "mechanical keyboard and glass of water, the same cool evening desk light and shallow depth " +
      "of field, so the final slide reads as a matching end card to the first",
    inset: null,
  },
];

async function main(): Promise<void> {
  if (SLIDES.length !== CAROUSEL_ROLES.length) throw new Error("slide count mismatch");

  const slides: CarouselSlide[] = SLIDES.map((s, i) => ({
    slide_index: i,
    role: s.role,
    card_style: s.cardStyle,
    stat_callout: s.statCallout,
    text: s.text,
    companies: s.companies,
    image_prompt: buildImagePrompt(s),
  }));
  const spec = { slides };

  // Text-length sanity (visible, though validate also checks).
  for (const s of slides) {
    console.log(
      `slide ${s.slide_index} ${s.role.padEnd(9)} style=${s.card_style.padEnd(14)} ` +
        `textLen=${[...s.text].length} stat="${s.stat_callout}" companies=[${s.companies.join(", ")}]`,
    );
  }

  const rawDoc = await readFile(DAILY_DOC, "utf8");
  // De-wrap markdown blockquote line-wrapping so verbatim clause verification is not defeated by the
  // doc's own `\n> ` line breaks (the two real-media clauses appear only in the wrapped template
  // section; every other clause also appears continuously in the Examples JSON). This is a
  // whitespace normalization only — it changes no semantic content.
  const docText = rawDoc.replace(/\n>\s?/g, " ").replace(/\n\s+/g, " ").replace(/\s+/g, " ");
  const structural = validateNewsCarouselSpec(spec);
  const audit = auditNewsCarouselAuthorPhase(spec, [], B, docText);

  console.log("\n== validateNewsCarouselSpec ==", structural.ok);
  if (!structural.ok) console.log(JSON.stringify(structural.errors, null, 2));

  console.log("\n== auditNewsCarouselAuthorPhase ok ==", audit.ok);
  for (const item of audit.items) {
    console.log(`  [${item.ok === null ? "JUDGE" : item.ok ? "PASS " : "FAIL "}] ${item.id}${item.detail ? " :: " + item.detail : ""}`);
  }

  if (!structural.ok || !audit.ok) {
    console.log("\nNOT SAVING — audit failed.");
    process.exitCode = 1;
    return;
  }

  const path = specPathFor("idea-2026-08-14-01", RUN, IDEAS_ROOT, "news-carousel", "daily");
  await saveSpec(spec, path);
  console.log("\nSAVED spec ->", path);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
