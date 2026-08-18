#!/usr/bin/env -S npx tsx
/**
 * Assemble and validate a Grok Imagine image prompt for front-end use.
 *
 * Ported from build-prompt.py (issue #255) — same clause rules, same moderation-safety scanner, same
 * CLI shape and exit codes; only the language changed.
 *
 * This is a prompt-assembly helper: it builds the natural-language prompt string a user pastes into a
 * Grok Imagine surface (grok.com, X, or the Grok Imagine app) to generate a still image. It does NOT
 * call any API. On-screen settings (aspect ratio, resolution) are recorded for the operator's reference
 * and printed in a trailing settings block; they are not part of the prompt the model reads.
 *
 * Modes:
 *   - T2I  : text-to-image, from a text prompt only.
 *   - edit : image editing / image-to-image on one uploaded image, using the "change + keep" structure.
 *
 * Grok Imagine prompt rules enforced here:
 *   - subject-first natural-language prose. The subject leads the prompt; Grok weights what comes first
 *     most heavily.
 *   - lighting is the highest-leverage element and is REQUIRED for T2I.
 *   - a named style / medium (cinematic, photorealistic, illustration, concept art, film still, ...) is
 *     REQUIRED for T2I.
 *   - word budget 30-80 words; hard ceiling of 100 words (over-long prompts dilute the lead subject).
 *   - edit mode: exactly one reference (the uploaded image) and BOTH a change clause and a keep clause
 *     (the "change + keep" structure is the most reliable way to hold consistency).
 *   - positive direction only: no negation-only prompts. A short "keep / preserve" clause is the
 *     sanctioned exception in edit mode.
 *   - moderation-safety scanner (the signature feature): image filters scan for photorealism signals,
 *     violence, and quality-spam that raises realism flags. The scanner refuses on a hit and offers the
 *     guide's safer rephrasing. `--override-safety` bypasses it, accepting a higher flag risk.
 */

const VALID_MODES = ["T2I", "edit"] as const;
type Mode = (typeof VALID_MODES)[number];

const VALID_ASPECT_RATIOS = [
  "1:1", "16:9", "9:16", "4:5", "5:4", "3:4", "4:3", "3:2", "2:3", "auto",
] as const;
type AspectRatio = (typeof VALID_ASPECT_RATIOS)[number];

const NEGATION_TOKENS = [" no ", " not ", " without ", " avoid ", " never "] as const;
const WORD_BUDGET_MIN = 30;
const WORD_BUDGET_MAX = 80;
const WORD_HARD_CEILING = 100;

/**
 * Moderation risk table (from the Grok Imagine image guide § Safeguards). Each entry: [literal risk
 * term, category, safer rephrasing]. Image filters scan predicted realism, violence, and quality-spam
 * that inflates realism scores. On a hit the build refuses and points the user to the safer
 * alternative, unless overrideSafety is set.
 */
const RISK_TABLE: ReadonlyArray<readonly [string, string, string]> = [
  // Direct violence language -> stage / theatrical / choreographed framing.
  ["fight", "violence", "an athletic stage routine or theatrical performance"],
  ["strike", "violence", "a precise choreographed sequence"],
  ["punch", "violence", "a stage-combat aesthetic, controlled and performative"],
  ["blood", "violence", "dramatic stage makeup or a theatrical effect"],
  ["injury", "violence", "a dramatic rehearsal pose"],
  ["attack", "violence", "a precise choreographed sequence"],
  // Extreme-photorealism cues -> cinematic / stylized / concept framing.
  ["8k photorealistic", "extreme-photorealism", "a cinematic film still or high-contrast film-noir look"],
  ["raw footage", "extreme-photorealism", "a cinematic film still"],
  ["cctv", "extreme-photorealism", "a stylized cinematic look"],
  ["documentary realism", "extreme-photorealism", "a high-contrast film-noir or concept-art look"],
  ["ultra-realistic", "extreme-photorealism", "concept art or painterly"],
  ["ultra realistic", "extreme-photorealism", "concept art or painterly"],
  // Quality-spam -> drop it; lighting and style carry quality, and these tokens can raise realism flags
  // for little gain.
  ["8k", "quality-spam", "drop the resolution hype; let lighting and style carry quality"],
  ["ultra-detailed", "quality-spam", "drop it; let lighting and style carry quality"],
  ["masterpiece", "quality-spam", "drop it; let lighting and style carry quality"],
  ["best quality", "quality-spam", "drop it; let lighting and style carry quality"],
];

export class PromptValidationError extends Error {}

function isMode(value: string): value is Mode {
  return (VALID_MODES as readonly string[]).includes(value);
}

function isAspectRatio(value: string): value is AspectRatio {
  return (VALID_ASPECT_RATIOS as readonly string[]).includes(value);
}

function hasNegation(text: string): boolean {
  if (!text) return false;
  const padded = " " + text.toLowerCase().trim() + " ";
  return NEGATION_TOKENS.some((tok) => padded.includes(tok));
}

function allNegation(...clauses: string[]): boolean {
  const populated = clauses.filter((c) => c && c.trim());
  if (populated.length === 0) return false;
  return populated.every((c) => hasNegation(c));
}

function wordCount(...clauses: string[]): number {
  return clauses
    .filter((c) => c && c.trim())
    .reduce((total, c) => total + c.split(/\s+/).filter((w) => w.length > 0).length, 0);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Returns the list of moderation-risk hits across all clauses. Longer phrases are matched first and
 * their span is blanked out so a contained shorter token (e.g. "8k" inside "8k photorealistic") does
 * not double-count. Only the first occurrence of each term is reported.
 */
function scanModeration(...clauses: string[]): Array<readonly [string, string, string]> {
  let work = clauses
    .filter((c) => c && c.trim())
    .join(" ")
    .toLowerCase();
  const hits: Array<readonly [string, string, string]> = [];
  const byLengthDesc = [...RISK_TABLE].sort((a, b) => b[0].length - a[0].length);
  for (const [term, category, safer] of byLengthDesc) {
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`);
    const match = pattern.exec(work);
    if (match) {
      hits.push([term, category, safer]);
      const start = match.index;
      const end = start + match[0].length;
      work = work.slice(0, start) + " ".repeat(end - start) + work.slice(end);
    }
  }
  return hits;
}

function raiseOnModeration(hits: ReadonlyArray<readonly [string, string, string]>): never {
  const lines = hits.map(([term, category, safer]) => `  - ${JSON.stringify(term)} (${category}) -> ${safer}`);
  throw new PromptValidationError(
    "moderation-safety scanner flagged high-risk terms. Grok Imagine's image filters scan predicted " +
      "realism, violence, and quality-spam. Rephrase each term (or re-run with --override-safety to " +
      "accept a higher flag risk):\n" + lines.join("\n"),
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRefs(raw: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const r of raw) {
    if (isPlainObject(r)) {
      const role = r["role"];
      if (role === undefined || role === null || String(role).trim() === "") {
        throw new PromptValidationError("every reference requires a non-empty 'role'.");
      }
      out.push(String(role));
    } else {
      out.push(String(r));
    }
  }
  return out;
}

function settingsBlock(aspectRatio: string): string[] {
  return [
    "",
    "[on-screen settings (pick these in the UI; NOT part of the prompt the model reads):",
    `  aspect_ratio=${aspectRatio}`,
    "  resolution=auto (Grok Imagine sizes the output; not prompt text)",
    "]",
  ];
}

export interface BuildPromptArgs {
  readonly mode: string;
  readonly subject?: string;
  readonly environment?: string;
  readonly lighting?: string;
  readonly camera?: string;
  readonly style?: string;
  readonly details?: string;
  readonly change?: string;
  readonly keep?: string;
  readonly references?: readonly unknown[] | undefined;
  readonly aspectRatio?: string;
  readonly overrideSafety?: boolean;
}

export function buildPrompt(args: BuildPromptArgs): string {
  const {
    mode,
    subject = "",
    environment = "",
    lighting = "",
    camera = "",
    style = "",
    details = "",
    change = "",
    keep = "",
    references,
    aspectRatio = "1:1",
    overrideSafety = false,
  } = args;

  if (!isMode(mode)) {
    throw new PromptValidationError(
      `mode must be one of ${JSON.stringify([...VALID_MODES].sort())}; got ${JSON.stringify(mode)}`,
    );
  }
  if (!isAspectRatio(aspectRatio)) {
    throw new PromptValidationError(
      `aspect_ratio must be one of ${JSON.stringify([...VALID_ASPECT_RATIOS].sort())}; ` +
        `got ${JSON.stringify(aspectRatio)}`,
    );
  }

  if (mode === "T2I") {
    return buildT2I({ subject, environment, lighting, camera, style, details, aspectRatio, overrideSafety });
  }
  return buildEdit({ change, keep, lighting, style, camera, details, references, aspectRatio, overrideSafety });
}

function buildT2I(args: {
  subject: string;
  environment: string;
  lighting: string;
  camera: string;
  style: string;
  details: string;
  aspectRatio: string;
  overrideSafety: boolean;
}): string {
  const { subject, environment, lighting, camera, style, details, aspectRatio, overrideSafety } = args;

  if (!subject || !subject.trim()) {
    throw new PromptValidationError(
      "T2I requires a subject clause — the main subject leads the prompt and Grok weights it most heavily.",
    );
  }
  if (!lighting || !lighting.trim()) {
    throw new PromptValidationError(
      "T2I requires a lighting clause — lighting is the highest-leverage element (e.g. 'soft golden " +
        "hour', 'high-contrast film-noir', 'neon rim light').",
    );
  }
  if (!style || !style.trim()) {
    throw new PromptValidationError(
      "T2I requires a named style / medium (e.g. 'cinematic film still', 'photorealistic', 'concept " +
        "art', 'digital illustration').",
    );
  }

  if (allNegation(subject, environment, lighting, camera, style, details)) {
    throw new PromptValidationError(
      "every clause leans on negation tokens. Describe what you DO want; Grok Imagine has no " +
        "negative-prompt field and does not honour in-prompt negation reliably.",
    );
  }

  const wc = wordCount(subject, environment, lighting, camera, style, details);
  if (wc > WORD_HARD_CEILING) {
    throw new PromptValidationError(
      `prompt is ${wc} words; over ${WORD_HARD_CEILING} dilutes the lead subject. Trim toward the ` +
        `${WORD_BUDGET_MIN}-${WORD_BUDGET_MAX} word budget — cut adjectives, not subjects.`,
    );
  }

  if (!overrideSafety) {
    const hits = scanModeration(subject, environment, lighting, camera, style, details);
    if (hits.length > 0) raiseOnModeration(hits);
  }

  const parts: string[] = [];
  for (const clause of [subject, environment, lighting, camera, style, details]) {
    if (clause && clause.trim()) parts.push(clause.trim());
  }
  parts.push(...settingsBlock(aspectRatio));
  return parts.join("\n");
}

function buildEdit(args: {
  change: string;
  keep: string;
  lighting: string;
  style: string;
  camera: string;
  details: string;
  references: readonly unknown[] | undefined;
  aspectRatio: string;
  overrideSafety: boolean;
}): string {
  const { change, keep, lighting, style, camera, details, references, aspectRatio, overrideSafety } = args;

  const refs = normalizeRefs(references ?? []);
  if (refs.length !== 1) {
    throw new PromptValidationError(`edit mode requires exactly one reference (the uploaded image); got ${refs.length}.`);
  }
  if (!change || !change.trim()) {
    throw new PromptValidationError(
      "edit mode requires a change clause — what to change (lighting, background, expression, " +
        "clothing, weather, ...).",
    );
  }
  if (!keep || !keep.trim()) {
    throw new PromptValidationError(
      "edit mode requires a keep clause — what must stay identical (face, expression, pose, clothing, " +
        "composition, identity, framing). The 'change + keep' structure is the most reliable way to " +
        "hold consistency.",
    );
  }

  // The keep clause is a sanctioned preserve statement, so the negation guard only trips when the
  // *change* content itself is all-negation.
  if (allNegation(change, lighting, style, camera, details)) {
    throw new PromptValidationError(
      "the change instruction leans entirely on negation tokens. State the change as a positive " +
        "instruction; the keep clause is where you name what to preserve.",
    );
  }

  const wc = wordCount(change, keep, lighting, style, camera, details);
  if (wc > WORD_HARD_CEILING) {
    throw new PromptValidationError(
      `prompt is ${wc} words; over ${WORD_HARD_CEILING} dilutes the edit. Trim toward the ` +
        `${WORD_BUDGET_MIN}-${WORD_BUDGET_MAX} word budget.`,
    );
  }

  if (!overrideSafety) {
    const hits = scanModeration(change, keep, lighting, style, camera, details);
    if (hits.length > 0) raiseOnModeration(hits);
  }

  const parts: string[] = [`Reference: ${refs[0]}.`];
  let changeLine = change.trim();
  if (![".", "!", "?"].some((suffix) => changeLine.endsWith(suffix))) {
    changeLine += ".";
  }
  parts.push(changeLine);
  for (const clause of [lighting, camera, style, details]) {
    if (clause && clause.trim()) parts.push(clause.trim());
  }
  parts.push(`Keep ${keep.trim()} exactly the same.`);
  parts.push(...settingsBlock(aspectRatio));
  return parts.join("\n");
}

function parseRefsArg(raw: readonly string[] | undefined): unknown[] | undefined {
  if (!raw || raw.length === 0) return undefined;
  const out: unknown[] = [];
  for (const r of raw) {
    try {
      out.push(JSON.parse(r));
    } catch {
      out.push(r);
    }
  }
  return out;
}

interface ParsedArgs {
  mode: string;
  subject: string;
  environment: string;
  lighting: string;
  camera: string;
  style: string;
  details: string;
  change: string;
  keep: string;
  reference: string[] | undefined;
  aspectRatio: string;
  overrideSafety: boolean;
}

const HELP_TEXT = `usage: build-prompt.ts --mode {T2I,edit} [options]

Assemble a Grok Imagine image prompt with validation.

options:
  --mode {T2I,edit}              required
  --subject SUBJECT              T2I: the main subject; leads the prompt.
  --environment ENVIRONMENT      T2I: the environment and setting.
  --lighting LIGHTING            required for T2I; the highest-leverage element.
  --camera CAMERA                camera angle / shot type / lens.
  --style STYLE                  required for T2I; named style / medium.
  --details DETAILS              optional finishing details.
  --change CHANGE                edit: what to change (required for edit).
  --keep KEEP                    edit: what must stay identical (required for edit).
  --reference REFERENCE          edit: plain string or JSON {"role": "..."}; repeatable, exactly one required.
  --aspect-ratio {1:1,16:9,9:16,4:5,5:4,3:4,4:3,3:2,2:3,auto}   default 1:1
  --override-safety              bypass the moderation-safety scanner.
`;

function parseArgs(argv: readonly string[]): ParsedArgs {
  const references: string[] = [];
  let hasReference = false;
  const values: Record<string, string> = {};
  let aspectRatio = "1:1";
  let overrideSafety = false;

  let i = 0;
  while (i < argv.length) {
    const token = argv[i]!;
    if (token === "--help" || token === "-h") {
      process.stdout.write(HELP_TEXT);
      process.exit(0);
    }
    if (token === "--override-safety") {
      overrideSafety = true;
      i += 1;
      continue;
    }
    const eq = token.indexOf("=");
    const flag = eq === -1 ? token : token.slice(0, eq);
    const inlineValue = eq === -1 ? undefined : token.slice(eq + 1);
    const next = (): string => {
      if (inlineValue !== undefined) return inlineValue;
      i += 1;
      const v = argv[i];
      if (v === undefined) throw new PromptValidationError(`argument ${flag}: expected one argument`);
      return v;
    };

    switch (flag) {
      case "--mode":
        values["mode"] = next();
        break;
      case "--subject":
        values["subject"] = next();
        break;
      case "--environment":
        values["environment"] = next();
        break;
      case "--lighting":
        values["lighting"] = next();
        break;
      case "--camera":
        values["camera"] = next();
        break;
      case "--style":
        values["style"] = next();
        break;
      case "--details":
        values["details"] = next();
        break;
      case "--change":
        values["change"] = next();
        break;
      case "--keep":
        values["keep"] = next();
        break;
      case "--reference":
        references.push(next());
        hasReference = true;
        break;
      case "--aspect-ratio":
        aspectRatio = next();
        break;
      default:
        throw new PromptValidationError(`unrecognized arguments: ${token}`);
    }
    i += 1;
  }

  if (values["mode"] === undefined) {
    throw new PromptValidationError("the following arguments are required: --mode");
  }

  return {
    mode: values["mode"],
    subject: values["subject"] ?? "",
    environment: values["environment"] ?? "",
    lighting: values["lighting"] ?? "",
    camera: values["camera"] ?? "",
    style: values["style"] ?? "",
    details: values["details"] ?? "",
    change: values["change"] ?? "",
    keep: values["keep"] ?? "",
    reference: hasReference ? references : undefined,
    aspectRatio,
    overrideSafety,
  };
}

function main(argv: readonly string[]): number {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (exc) {
    if (exc instanceof PromptValidationError) {
      process.stderr.write(`PromptValidationError: ${exc.message}\n`);
      return 2;
    }
    throw exc;
  }

  try {
    const refs = parseRefsArg(args.reference);
    const prompt = buildPrompt({
      mode: args.mode,
      subject: args.subject,
      environment: args.environment,
      lighting: args.lighting,
      camera: args.camera,
      style: args.style,
      details: args.details,
      change: args.change,
      keep: args.keep,
      references: refs,
      aspectRatio: args.aspectRatio,
      overrideSafety: args.overrideSafety,
    });
    process.stdout.write(prompt + "\n");
    return 0;
  } catch (exc) {
    if (exc instanceof PromptValidationError) {
      process.stderr.write(`PromptValidationError: ${exc.message}\n`);
      return 2;
    }
    throw exc;
  }
}

const isMainModule = process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  process.exitCode = main(process.argv.slice(2));
}
