#!/usr/bin/env -S npx tsx
/**
 * Assemble and validate a Seedream 5.0 Pro prompt for front-end use.
 *
 * Ported from build-prompt.py (issue #255) — same clause/word-budget/colour-validation rules, same CLI
 * shape and exit codes; only the language changed.
 *
 * This is a prompt-assembly helper: it builds the natural-language prompt string a user pastes into a
 * Seedream 5.0 front-end (Dreamina / Jimeng, Doubao, fal, wavespeed, ComfyUI). It does NOT call any
 * API. On-screen settings (aspect ratio, resolution, image count) are recorded for the operator's
 * reference and printed in a trailing settings block; they are not part of the prompt the model reads.
 *
 * Modes: T2I, Design (high-density info layout), Edit (grounded precision edit), MR (reference by
 * ordinal "Image N"), sequential-set.
 *
 * Seedream 5.0 prompt rules enforced here:
 *   - subject-first natural-language prose in SPACE order (Subject, Palette & style, Arrangement,
 *     Camera & light, Extra detail); earlier concepts are weighted more heavily.
 *   - 30-100 word budget; a hard ceiling at 120 words (over-long prompts confuse the model).
 *   - in-image text must be wrapped in double quotes (renders literally in any of the 14 supported
 *     languages).
 *   - Edit: exactly one reference (the uploaded image); a marked target and an optional recolour value
 *     that must be a hex code or a swatch/Image reference.
 *   - MR: 1..10 references, addressed by on-screen order (Image 1, Image 2...), identity anchored on
 *     Image 1.
 *   - sequential-set: a named set count (2..8), one global style lock.
 *   - resolution ceiling is 2K (2048 px) — a 4K request is rejected.
 *   - layer separation is a cross-cutting request appended to the prompt.
 *   - no negation-only prompts (Seedream has no negative-prompt field).
 */

const VALID_MODES = ["T2I", "Design", "Edit", "MR", "sequential-set"] as const;
type Mode = (typeof VALID_MODES)[number];

const VALID_ASPECT_RATIOS = [
  "1:1", "16:9", "9:16", "4:5", "5:4", "3:4", "4:3", "3:2", "2:3", "21:9", "auto",
] as const;
type AspectRatio = (typeof VALID_ASPECT_RATIOS)[number];

// Seedream 5.0 Pro is a 2K model: 1K or 2K (max 2048 px), or auto. There is deliberately NO 4K tier
// (this differs from Seedream 4.5).
const VALID_RESOLUTIONS = ["1K", "2K", "auto"] as const;
type Resolution = (typeof VALID_RESOLUTIONS)[number];

const NEGATION_TOKENS = [" no ", " not ", " without ", " avoid ", " never "] as const;
const WORD_BUDGET_MIN = 30;
const WORD_BUDGET_MAX = 100;
const WORD_HARD_CEILING = 120;
const MR_REF_CAP = 10;
const SET_COUNT_MIN = 2;
const SET_COUNT_MAX = 8;
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export class PromptValidationError extends Error {}

function isMode(value: string): value is Mode {
  return (VALID_MODES as readonly string[]).includes(value);
}
function isAspectRatio(value: string): value is AspectRatio {
  return (VALID_ASPECT_RATIOS as readonly string[]).includes(value);
}
function isResolution(value: string): value is Resolution {
  return (VALID_RESOLUTIONS as readonly string[]).includes(value);
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

/** A recolour/material value must be a hex code or a swatch/Image reference. Returns the normalised
 *  value or throws. */
function validateColor(color: string): string {
  const c = color.trim();
  if (HEX_RE.test(c)) return c;
  const low = c.toLowerCase();
  if (low.includes("swatch") || /image\s*\d/.test(low)) return c;
  throw new PromptValidationError(
    "recolour value must be a hex code (e.g. '#1E3A8A') or reference a swatch / an uploaded image " +
      `(e.g. 'swatch: teal', 'match Image 2'); got ${JSON.stringify(color)}.`,
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

function settingsBlock(aspectRatio: string, resolution: string, setCount: number | undefined): string[] {
  const block = [
    "",
    "[on-screen settings (pick these in the UI; NOT part of the prompt the model reads):",
    `  aspect_ratio=${aspectRatio}`,
    `  resolution=${resolution}`,
  ];
  if (setCount !== undefined) block.push(`  image_count=${setCount}`);
  block.push("]");
  return block;
}

function layersLine(): string {
  return (
    "Layer separation: split the result into independent transparent layers (title / subject / " +
    "background / elements); export as PNG."
  );
}

export interface BuildPromptArgs {
  readonly mode: string;
  readonly subject: string;
  readonly action?: string;
  readonly setting?: string;
  readonly style?: string;
  readonly camera?: string;
  readonly references?: readonly unknown[] | undefined;
  readonly frames?: readonly string[] | undefined;
  readonly setCount?: number | undefined;
  readonly target?: string | undefined;
  readonly color?: string | undefined;
  readonly layers?: boolean;
  readonly inImageText?: string | undefined;
  readonly textLanguage?: string | undefined;
  readonly aspectRatio?: string;
  readonly resolution?: string;
}

export function buildPrompt(args: BuildPromptArgs): string {
  const {
    mode,
    subject,
    action = "",
    setting = "",
    style = "",
    camera = "",
    references,
    frames,
    setCount,
    target,
    color,
    layers = false,
    inImageText,
    textLanguage,
    aspectRatio = "1:1",
    resolution = "2K",
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
  if (!isResolution(resolution)) {
    throw new PromptValidationError(
      `resolution must be one of ${JSON.stringify([...VALID_RESOLUTIONS].sort())}; got ` +
        `${JSON.stringify(resolution)}. Seedream 5.0 Pro is a 2K model — there is no 4K tier.`,
    );
  }
  if (inImageText !== undefined && inImageText.trim()) {
    if (!inImageText.includes('"')) {
      throw new PromptValidationError(
        "in-image text must be wrapped in double quotes so Seedream renders it literally, e.g. " +
          "'the title \"VISIT KYOTO\"'.",
      );
    }
  }

  if (mode === "sequential-set") {
    return buildSequentialSet({
      subject,
      style,
      frames,
      setCount,
      layers,
      inImageText,
      textLanguage,
      aspectRatio,
      resolution,
    });
  }

  return buildStill({
    mode,
    subject,
    action,
    setting,
    style,
    camera,
    references,
    target,
    color,
    layers,
    inImageText,
    textLanguage,
    aspectRatio,
    resolution,
  });
}

function buildStill(opts: {
  mode: Mode;
  subject: string;
  action: string;
  setting: string;
  style: string;
  camera: string;
  references: readonly unknown[] | undefined;
  target: string | undefined;
  color: string | undefined;
  layers: boolean;
  inImageText: string | undefined;
  textLanguage: string | undefined;
  aspectRatio: string;
  resolution: string;
}): string {
  const { mode, subject, action, setting, style, camera, references, target, color, layers, inImageText, textLanguage, aspectRatio, resolution } = opts;

  if (!subject || !subject.trim()) throw new PromptValidationError(`${mode} requires a subject clause.`);
  if (!style || !style.trim()) throw new PromptValidationError(`${mode} requires a style clause.`);

  if (allNegation(subject, action, setting, style, camera)) {
    throw new PromptValidationError(
      "every clause leans on negation tokens. Rephrase to positive description; Seedream has no " +
        "negative-prompt field and does not honour in-prompt negation reliably.",
    );
  }

  let refs: string[] = [];
  let normalisedColor: string | undefined;
  if (mode === "Edit") {
    refs = normalizeRefs(references ?? []);
    if (refs.length !== 1) {
      throw new PromptValidationError(`Edit mode requires exactly one reference (the uploaded image); got ${refs.length}.`);
    }
    if (color !== undefined && color.trim()) {
      normalisedColor = validateColor(color);
    }
  } else if (mode === "MR") {
    refs = normalizeRefs(references ?? []);
    if (!(refs.length >= 1 && refs.length <= MR_REF_CAP)) {
      throw new PromptValidationError(`MR mode requires 1..${MR_REF_CAP} references; got ${refs.length}.`);
    }
  }

  const wc = wordCount(subject, action, setting, style, camera);
  if (wc > WORD_HARD_CEILING) {
    throw new PromptValidationError(
      `prompt is ${wc} words; over ${WORD_HARD_CEILING} confuses Seedream. Trim toward the ` +
        `${WORD_BUDGET_MIN}-${WORD_BUDGET_MAX} word budget — cut adjectives, not subjects.`,
    );
  }

  const parts: string[] = [];
  if (mode === "Design") {
    parts.push("High-density design brief:");
  } else if (mode === "Edit") {
    parts.push(`Reference: ${refs[0]}.`);
    if (target && target.trim()) parts.push(`Target: ${target.trim()}.`);
    parts.push("");
  } else if (mode === "MR") {
    parts.push("Using the uploaded images:");
    refs.forEach((role, i) => parts.push(`  Image ${i + 1}: ${role}.`));
    parts.push("");
  }

  for (const c of [subject, action, setting, style, camera]) {
    if (c && c.trim()) parts.push(c.trim());
  }

  if (normalisedColor) {
    parts.push(`Colour / material value: ${normalisedColor}.`);
  }

  if (inImageText && inImageText.trim()) {
    let line = `In-image text: ${inImageText.trim()}.`;
    if (textLanguage && textLanguage.trim()) line += ` (language: ${textLanguage.trim()})`;
    parts.push(line);
  }

  if (layers) {
    parts.push(layersLine());
  }

  parts.push(...settingsBlock(aspectRatio, resolution, undefined));
  return parts.join("\n");
}

function buildSequentialSet(opts: {
  subject: string;
  style: string;
  frames: readonly string[] | undefined;
  setCount: number | undefined;
  layers: boolean;
  inImageText: string | undefined;
  textLanguage: string | undefined;
  aspectRatio: string;
  resolution: string;
}): string {
  const { subject, style, frames: framesArg, setCount, layers, inImageText, textLanguage, aspectRatio, resolution } = opts;

  if (!subject || !subject.trim()) {
    throw new PromptValidationError("sequential-set requires a subject held constant across the set.");
  }
  if (!style || !style.trim()) {
    throw new PromptValidationError(
      "sequential-set requires a single global style/lighting clause held constant across the whole set.",
    );
  }
  if (setCount === undefined) {
    throw new PromptValidationError(
      "sequential-set requires an explicit set count (e.g. --set-count 6). Without it the model " +
        "returns a single image.",
    );
  }
  if (!(setCount >= SET_COUNT_MIN && setCount <= SET_COUNT_MAX)) {
    throw new PromptValidationError(
      `sequential-set count must be ${SET_COUNT_MIN}..${SET_COUNT_MAX}; got ${setCount}. For larger ` +
        "sets, split into two and share an anchor image to hold identity.",
    );
  }
  const frames = framesArg ?? [];
  if (frames.length > 0 && frames.length > setCount) {
    throw new PromptValidationError(
      `got ${frames.length} per-image states but the set count is ${setCount}; states must not ` +
        "exceed the count.",
    );
  }

  const parts: string[] = [
    `Generate a set of ${setCount} images of ${subject.trim()}.`,
    `Style and lighting (same across the whole set): ${style.trim()}.`,
  ];
  if (frames.length > 0) {
    parts.push("Across the set, change only:");
    for (const f of frames) parts.push(`  ${f.trim()}`);
  }
  if (inImageText && inImageText.trim()) {
    let line = `In-image text: ${inImageText.trim()}.`;
    if (textLanguage && textLanguage.trim()) line += ` (language: ${textLanguage.trim()})`;
    parts.push(line);
  }
  if (layers) {
    parts.push(layersLine());
  }

  parts.push(...settingsBlock(aspectRatio, resolution, setCount));
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
  action: string;
  setting: string;
  style: string;
  camera: string;
  reference: string[] | undefined;
  frame: string[] | undefined;
  setCount: number | undefined;
  target: string | undefined;
  color: string | undefined;
  layers: boolean;
  inImageText: string | undefined;
  textLanguage: string | undefined;
  aspectRatio: string;
  resolution: string;
}

const HELP_TEXT = `usage: build-prompt.ts --mode {T2I,Design,Edit,MR,sequential-set} --subject SUBJECT [options]

Assemble a Seedream 5.0 Pro prompt with validation.

options:
  --mode {T2I,Design,Edit,MR,sequential-set}   required
  --subject SUBJECT                              required
  --action ACTION
  --setting SETTING
  --style STYLE
  --camera CAMERA
  --reference REFERENCE                              plain string or JSON {"role": "..."}.
  --frame FRAME                                        per-image state for sequential-set mode.
  --set-count SET_COUNT                                  number of images in a sequential set (2..8).
  --target TARGET                                          Edit mode: the marked element, in words.
  --color COLOR                                              Edit mode: hex code or swatch/Image reference.
  --layers                                                     request layer separation.
  --in-image-text IN_IMAGE_TEXT                                  literal text to render; MUST be double-quoted.
  --text-language TEXT_LANGUAGE                                    optional language hint for in-image text.
  --aspect-ratio {...}   default 1:1
  --resolution {1K,2K,auto}   default 2K
`;

function parseArgs(argv: readonly string[]): ParsedArgs {
  const references: string[] = [];
  let hasReferences = false;
  const frames: string[] = [];
  let hasFrames = false;
  const values: Record<string, string> = {};
  let setCount: number | undefined;
  let layers = false;
  let aspectRatio = "1:1";
  let resolution = "2K";

  let i = 0;
  while (i < argv.length) {
    const token = argv[i]!;
    if (token === "--help" || token === "-h") {
      process.stdout.write(HELP_TEXT);
      process.exit(0);
    }
    if (token === "--layers") {
      layers = true;
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
      case "--action":
        values["action"] = next();
        break;
      case "--setting":
        values["setting"] = next();
        break;
      case "--style":
        values["style"] = next();
        break;
      case "--camera":
        values["camera"] = next();
        break;
      case "--reference":
        references.push(next());
        hasReferences = true;
        break;
      case "--frame":
        frames.push(next());
        hasFrames = true;
        break;
      case "--set-count":
        setCount = Number.parseInt(next(), 10);
        break;
      case "--target":
        values["target"] = next();
        break;
      case "--color":
        values["color"] = next();
        break;
      case "--in-image-text":
        values["inImageText"] = next();
        break;
      case "--text-language":
        values["textLanguage"] = next();
        break;
      case "--aspect-ratio":
        aspectRatio = next();
        break;
      case "--resolution":
        resolution = next();
        break;
      default:
        throw new PromptValidationError(`unrecognized arguments: ${token}`);
    }
    i += 1;
  }

  if (values["mode"] === undefined) throw new PromptValidationError("the following arguments are required: --mode");
  if (values["subject"] === undefined) throw new PromptValidationError("the following arguments are required: --subject");

  return {
    mode: values["mode"],
    subject: values["subject"],
    action: values["action"] ?? "",
    setting: values["setting"] ?? "",
    style: values["style"] ?? "",
    camera: values["camera"] ?? "",
    reference: hasReferences ? references : undefined,
    frame: hasFrames ? frames : undefined,
    setCount,
    target: values["target"],
    color: values["color"],
    layers,
    inImageText: values["inImageText"],
    textLanguage: values["textLanguage"],
    aspectRatio,
    resolution,
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
      action: args.action,
      setting: args.setting,
      style: args.style,
      camera: args.camera,
      references: refs,
      frames: args.frame,
      setCount: args.setCount,
      target: args.target,
      color: args.color,
      layers: args.layers,
      inImageText: args.inImageText,
      textLanguage: args.textLanguage,
      aspectRatio: args.aspectRatio,
      resolution: args.resolution,
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
