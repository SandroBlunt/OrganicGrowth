#!/usr/bin/env -S npx tsx
/**
 * Assemble and validate a Nano Banana 2 prompt.
 *
 * Ported from build-prompt.py (issue #255) — same clause/variant-cap rules, same CLI shape and exit
 * codes; only the language changed.
 *
 * Modes: T2I, I2I, MR (variant-aware caps), frame-sequence.
 *
 * Variant-aware MR caps:
 *   flash (Nano Banana 2 / Gemini 3.1 Flash Image): objects <= 10, characters <= 4, total <= 14
 *   pro   (Nano Banana Pro / Gemini 3 Pro Image): objects <= 6, characters <= 5, total <= 14
 *
 * References for MR can be passed as JSON objects: {"kind": "object" | "character", "role": "..."}.
 * Plain string references (legacy) are accepted and counted as "object".
 *
 * Configuration parameters (NOT part of the visible prompt budget):
 *   - thinking_level: "minimal" | "High"
 *   - include_thoughts: bool
 *   - grounding_web: bool (flash + pro)
 *   - grounding_image: bool (flash only)
 *   - resolution: "512" | "1K" | "2K" | "4K" (512 is flash-only)
 */

const VALID_MODES = ["T2I", "I2I", "MR", "frame-sequence"] as const;
type Mode = (typeof VALID_MODES)[number];

const VALID_ASPECT_RATIOS = [
  "1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9",
] as const;
type AspectRatio = (typeof VALID_ASPECT_RATIOS)[number];

const VALID_RESOLUTIONS = ["512", "1K", "2K", "4K"] as const;
type Resolution = (typeof VALID_RESOLUTIONS)[number];

const VALID_VARIANTS = ["flash", "pro"] as const;
type Variant = (typeof VALID_VARIANTS)[number];

const VALID_THINKING = ["minimal", "High"] as const;
type Thinking = (typeof VALID_THINKING)[number];

const VALID_REF_KINDS = ["object", "character"] as const;
type RefKind = (typeof VALID_REF_KINDS)[number];

const NEGATION_TOKENS = [" no ", " not ", " without ", " avoid ", " never "] as const;
const FRAME_SEQ_MIN = 3;
const FRAME_SEQ_MAX = 8;

interface VariantCaps {
  readonly maxObjects: number;
  readonly maxCharacters: number;
  readonly maxTotal: number;
}

const VARIANT_MR_CAPS: Readonly<Record<Variant, VariantCaps>> = {
  flash: { maxObjects: 10, maxCharacters: 4, maxTotal: 14 },
  pro: { maxObjects: 6, maxCharacters: 5, maxTotal: 14 },
};

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
function isVariant(value: string): value is Variant {
  return (VALID_VARIANTS as readonly string[]).includes(value);
}
function isThinking(value: string): value is Thinking {
  return (VALID_THINKING as readonly string[]).includes(value);
}
function isRefKind(value: unknown): value is RefKind {
  return typeof value === "string" && (VALID_REF_KINDS as readonly string[]).includes(value);
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface NormalizedRef {
  readonly kind: RefKind;
  readonly role: string;
}

function normalizeRefs(raw: readonly unknown[]): NormalizedRef[] {
  const out: NormalizedRef[] = [];
  for (const r of raw) {
    if (isPlainObject(r)) {
      const kind = r["kind"] ?? "object";
      const role = r["role"];
      if (!isRefKind(kind)) {
        throw new PromptValidationError(
          `reference kind ${JSON.stringify(kind)} not in ${JSON.stringify([...VALID_REF_KINDS].sort())}.`,
        );
      }
      if (role === undefined || role === null || String(role).trim() === "") {
        throw new PromptValidationError("every reference requires a non-empty 'role'.");
      }
      out.push({ kind, role: String(role) });
    } else {
      // Legacy plain-string reference: treated as object.
      out.push({ kind: "object", role: String(r) });
    }
  }
  return out;
}

function validateMrCaps(refs: readonly NormalizedRef[], variant: Variant): void {
  const caps = VARIANT_MR_CAPS[variant];
  const counts = { object: 0, character: 0 };
  for (const r of refs) counts[r.kind] += 1;
  const total = counts.object + counts.character;
  if (total > caps.maxTotal) {
    throw new PromptValidationError(`MR total references ${total} exceeds variant cap ${caps.maxTotal} for ${variant}.`);
  }
  if (counts.object > caps.maxObjects) {
    throw new PromptValidationError(`MR object references ${counts.object} exceeds variant cap ${caps.maxObjects} for ${variant}.`);
  }
  if (counts.character > caps.maxCharacters) {
    throw new PromptValidationError(`MR character references ${counts.character} exceeds variant cap ${caps.maxCharacters} for ${variant}.`);
  }
  if (total < 1) {
    throw new PromptValidationError("MR mode requires at least 1 reference.");
  }
}

function validateResolutionForVariant(resolution: string | undefined, variant: Variant): void {
  if (resolution === undefined) return;
  if (!isResolution(resolution)) {
    throw new PromptValidationError(`resolution ${JSON.stringify(resolution)} not in ${JSON.stringify([...VALID_RESOLUTIONS].sort())}.`);
  }
  if (resolution === "512" && variant !== "flash") {
    throw new PromptValidationError("resolution '512' is supported on the Flash variant only.");
  }
}

function validateGrounding(groundingImage: boolean, variant: Variant): void {
  if (groundingImage && variant !== "flash") {
    throw new PromptValidationError("Image Search grounding is supported on the Flash variant only.");
  }
}

function configBlock(opts: {
  aspectRatio: string;
  variant: Variant;
  resolution: string | undefined;
  thinkingLevel: Thinking;
  includeThoughts: boolean;
  groundingWeb: boolean;
  groundingImage: boolean;
}): string[] {
  const block: string[] = [];
  block.push(`[aspect_ratio=${opts.aspectRatio}]`);
  block.push(`[variant=${opts.variant}]`);
  if (opts.resolution !== undefined) block.push(`[resolution=${opts.resolution}]`);
  block.push(
    "[config (NOT part of prompt budget): " +
      `thinkingLevel=${opts.thinkingLevel}, ` +
      `includeThoughts=${String(opts.includeThoughts)}, ` +
      `grounding_web=${String(opts.groundingWeb)}, ` +
      `grounding_image=${String(opts.groundingImage)}]`,
  );
  return block;
}

export interface BuildPromptArgs {
  readonly mode: string;
  readonly subject: string;
  readonly action?: string;
  readonly setting?: string;
  readonly style: string;
  readonly camera: string;
  readonly references?: readonly unknown[] | undefined;
  readonly frames?: readonly string[] | undefined;
  readonly handoff?: string | undefined;
  readonly aspectRatio?: string;
  readonly variant?: string;
  readonly resolution?: string | undefined;
  readonly thinkingLevel?: string;
  readonly includeThoughts?: boolean;
  readonly groundingWeb?: boolean;
  readonly groundingImage?: boolean;
}

export function buildPrompt(args: BuildPromptArgs): string {
  const {
    mode,
    subject,
    action = "",
    setting = "",
    style,
    camera,
    references,
    frames,
    handoff,
    aspectRatio = "1:1",
    variant = "flash",
    resolution,
    thinkingLevel = "minimal",
    includeThoughts = false,
    groundingWeb = false,
    groundingImage = false,
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
  if (!isVariant(variant)) {
    throw new PromptValidationError(
      `variant must be one of ${JSON.stringify([...VALID_VARIANTS].sort())}; got ${JSON.stringify(variant)}`,
    );
  }
  if (!isThinking(thinkingLevel)) {
    throw new PromptValidationError(
      `thinking_level must be one of ${JSON.stringify([...VALID_THINKING].sort())}; got ${JSON.stringify(thinkingLevel)}`,
    );
  }
  validateResolutionForVariant(resolution, variant);
  validateGrounding(groundingImage, variant);

  if (mode === "frame-sequence") {
    return buildFrameSequence({
      subject,
      style,
      camera,
      frames,
      handoff,
      aspectRatio,
      variant,
      resolution,
      thinkingLevel,
      includeThoughts,
      groundingWeb,
      groundingImage,
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
    aspectRatio,
    variant,
    resolution,
    thinkingLevel,
    includeThoughts,
    groundingWeb,
    groundingImage,
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
  aspectRatio: string;
  variant: Variant;
  resolution: string | undefined;
  thinkingLevel: Thinking;
  includeThoughts: boolean;
  groundingWeb: boolean;
  groundingImage: boolean;
}): string {
  const { mode, subject, action, setting, style, camera, references, aspectRatio, variant, resolution, thinkingLevel, includeThoughts, groundingWeb, groundingImage } = opts;

  const clauses: Record<string, string> = { subject, action, setting, style, camera };
  const missing = Object.entries(clauses)
    .filter(([, v]) => !v || !v.trim())
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new PromptValidationError(`missing required clause(s) for ${mode}: ${JSON.stringify(missing)}.`);
  }
  if (allNegation(...Object.values(clauses))) {
    throw new PromptValidationError(
      "every clause leans on negation tokens. Rephrase to positive description; Nano Banana 2 does " +
        "not honour negation reliably.",
    );
  }

  if (mode === "I2I") {
    const refs = references ?? [];
    if (refs.length !== 1) {
      throw new PromptValidationError(`I2I mode requires exactly one reference; got ${refs.length}.`);
    }
  }

  let refsN: NormalizedRef[] = [];
  if (mode === "MR") {
    refsN = normalizeRefs(references ?? []);
    validateMrCaps(refsN, variant);
  }

  const parts: string[] = [];
  if (mode === "MR") {
    parts.push("References:");
    const chars = refsN.filter((r) => r.kind === "character");
    const objs = refsN.filter((r) => r.kind === "object");
    const caps = VARIANT_MR_CAPS[variant];
    if (chars.length > 0) {
      parts.push(`  Characters (${chars.length} of ${caps.maxCharacters}):`);
      chars.forEach((r, i) => parts.push(`    ${i + 1}. ${r.role}`));
    }
    if (objs.length > 0) {
      parts.push(`  Objects (${objs.length} of ${caps.maxObjects}):`);
      objs.forEach((r, i) => parts.push(`    ${i + 1}. ${r.role}`));
    }
    parts.push("");
  }

  for (const c of [subject, action, setting, style, camera]) {
    parts.push(c.trim());
  }

  parts.push("");
  parts.push(...configBlock({ aspectRatio, variant, resolution, thinkingLevel, includeThoughts, groundingWeb, groundingImage }));
  return parts.join("\n");
}

function buildFrameSequence(opts: {
  subject: string;
  style: string;
  camera: string;
  frames: readonly string[] | undefined;
  handoff: string | undefined;
  aspectRatio: string;
  variant: Variant;
  resolution: string | undefined;
  thinkingLevel: Thinking;
  includeThoughts: boolean;
  groundingWeb: boolean;
  groundingImage: boolean;
}): string {
  const { subject, style, camera, frames: framesArg, handoff, aspectRatio, variant, resolution, thinkingLevel, includeThoughts, groundingWeb, groundingImage } = opts;

  if (!subject || !subject.trim()) {
    throw new PromptValidationError("frame-sequence requires a subject held constant across frames.");
  }
  if (!style || !style.trim()) {
    throw new PromptValidationError("frame-sequence requires a style/lighting clause held constant.");
  }
  if (!camera || !camera.trim()) {
    throw new PromptValidationError("frame-sequence requires a camera clause held constant.");
  }
  if (!handoff || !handoff.trim()) {
    throw new PromptValidationError(
      "frame-sequence requires a hand-off line naming the downstream video model and its input mode " +
        "(e.g. 'Veo 3.1 first-and-last-frame').",
    );
  }
  const frames = framesArg ?? [];
  if (!(frames.length >= FRAME_SEQ_MIN && frames.length <= FRAME_SEQ_MAX)) {
    throw new PromptValidationError(
      `frame-sequence requires ${FRAME_SEQ_MIN}..${FRAME_SEQ_MAX} frames; got ${frames.length}.`,
    );
  }

  const parts: string[] = [
    `Subject (held constant): ${subject.trim()}`,
    `Style and lighting (held constant): ${style.trim()}`,
    `Camera (held constant): ${camera.trim()}`,
    `Aspect ratio: ${aspectRatio}`,
    "",
    "Sequence intent:",
  ];
  for (const f of frames) {
    parts.push(`  ${f.trim()}`);
  }
  parts.push("");
  parts.push(`Hand-off: ${handoff.trim()}`);
  parts.push("");
  parts.push(...configBlock({ aspectRatio, variant, resolution, thinkingLevel, includeThoughts, groundingWeb, groundingImage }));
  return parts.join("\n");
}

function parseRefsArg(raw: readonly string[] | undefined): unknown[] | undefined {
  if (!raw || raw.length === 0) return undefined;
  const out: unknown[] = [];
  for (const r of raw) {
    // Try JSON first; fall back to plain string for legacy compat.
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
  handoff: string | undefined;
  aspectRatio: string;
  variant: string;
  resolution: string | undefined;
  thinkingLevel: string;
  includeThoughts: boolean;
  groundingWeb: boolean;
  groundingImage: boolean;
}

const HELP_TEXT = `usage: build-prompt.ts --mode {T2I,I2I,MR,frame-sequence} --subject SUBJECT
                       --style STYLE --camera CAMERA [options]

Assemble a Nano Banana 2 prompt with validation.

options:
  --mode {T2I,I2I,MR,frame-sequence}   required
  --subject SUBJECT                      required
  --action ACTION
  --setting SETTING
  --style STYLE                            required
  --camera CAMERA                            required
  --reference REFERENCE                        plain string ("object") or JSON {"kind":"character|object","role":"..."}.
  --frame FRAME                                  repeat 3..8 times for frame-sequence mode.
  --handoff HANDOFF                                hand-off line for frame-sequence mode.
  --aspect-ratio {...}   default 1:1
  --variant {flash,pro}   default flash
  --resolution {512,1K,2K,4K}
  --thinking-level {minimal,High}   default minimal
  --include-thoughts
  --grounding-web
  --grounding-image
`;

function parseArgs(argv: readonly string[]): ParsedArgs {
  const references: string[] = [];
  let hasReferences = false;
  const frames: string[] = [];
  let hasFrames = false;
  const values: Record<string, string> = {};
  let aspectRatio = "1:1";
  let variant = "flash";
  let thinkingLevel = "minimal";
  let includeThoughts = false;
  let groundingWeb = false;
  let groundingImage = false;

  let i = 0;
  while (i < argv.length) {
    const token = argv[i]!;
    if (token === "--help" || token === "-h") {
      process.stdout.write(HELP_TEXT);
      process.exit(0);
    }
    if (token === "--include-thoughts") {
      includeThoughts = true;
      i += 1;
      continue;
    }
    if (token === "--grounding-web") {
      groundingWeb = true;
      i += 1;
      continue;
    }
    if (token === "--grounding-image") {
      groundingImage = true;
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
      case "--handoff":
        values["handoff"] = next();
        break;
      case "--aspect-ratio":
        aspectRatio = next();
        break;
      case "--variant":
        variant = next();
        break;
      case "--resolution":
        values["resolution"] = next();
        break;
      case "--thinking-level":
        thinkingLevel = next();
        break;
      default:
        throw new PromptValidationError(`unrecognized arguments: ${token}`);
    }
    i += 1;
  }

  for (const required of ["mode", "subject", "style", "camera"]) {
    if (values[required] === undefined) {
      throw new PromptValidationError(`the following arguments are required: --${required}`);
    }
  }

  return {
    mode: values["mode"]!,
    subject: values["subject"]!,
    action: values["action"] ?? "",
    setting: values["setting"] ?? "",
    style: values["style"]!,
    camera: values["camera"]!,
    reference: hasReferences ? references : undefined,
    frame: hasFrames ? frames : undefined,
    handoff: values["handoff"],
    aspectRatio,
    variant,
    resolution: values["resolution"],
    thinkingLevel,
    includeThoughts,
    groundingWeb,
    groundingImage,
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
      handoff: args.handoff,
      aspectRatio: args.aspectRatio,
      variant: args.variant,
      resolution: args.resolution,
      thinkingLevel: args.thinkingLevel,
      includeThoughts: args.includeThoughts,
      groundingWeb: args.groundingWeb,
      groundingImage: args.groundingImage,
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
