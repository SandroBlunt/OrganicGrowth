#!/usr/bin/env -S npx tsx
/**
 * Assemble and validate a Seedance 2.0 prompt.
 *
 * Ported from build-prompt.py (issue #255) — same clause/mix-budget rules, same CLI shape and exit
 * codes; only the language changed.
 *
 * Modes: T2V, I2V, MR (per-modality caps + mix-budget heuristic), F/L.
 *
 * Per-modality caps (documented): images <= 9, videos <= 3, audios <= 3
 *
 * Mix-budget heuristic (vendor-unconfirmed):
 *   - if any video or audio present, images >= 2
 *   - effective video cap 2 (3 documented but not recommended)
 *   - effective audio cap 2 (3 documented but not recommended)
 */

const VALID_MODES = ["T2V", "I2V", "MR", "F/L"] as const;
type Mode = (typeof VALID_MODES)[number];

const VALID_ASPECT_RATIOS = ["16:9", "9:16"] as const;
type AspectRatio = (typeof VALID_ASPECT_RATIOS)[number];

const VALID_REF_TYPES = ["image", "video", "audio"] as const;
type RefType = (typeof VALID_REF_TYPES)[number];

const NEGATION_TOKENS = [" no ", " not ", " without ", " avoid ", " never "] as const;
const DOC_MAX_IMAGES = 9;
const DOC_MAX_VIDEOS = 3;
const DOC_MAX_AUDIOS = 3;
const HEURISTIC_EFFECTIVE_VIDEO_CAP = 2;
const HEURISTIC_EFFECTIVE_AUDIO_CAP = 2;
const HEURISTIC_MIN_IMAGES_WHEN_AV_PRESENT = 2;

export class PromptValidationError extends Error {}

function isMode(value: string): value is Mode {
  return (VALID_MODES as readonly string[]).includes(value);
}
function isAspectRatio(value: string): value is AspectRatio {
  return (VALID_ASPECT_RATIOS as readonly string[]).includes(value);
}
function isRefType(value: unknown): value is RefType {
  return typeof value === "string" && (VALID_REF_TYPES as readonly string[]).includes(value);
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

export interface ReferenceSpec {
  readonly type?: unknown;
  readonly role?: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateMr(references: readonly ReferenceSpec[], override: boolean): Record<RefType, number> {
  const counts: Record<RefType, number> = { image: 0, video: 0, audio: 0 };
  for (const r of references) {
    const t = isPlainObject(r) ? r["type"] : undefined;
    if (!isRefType(t)) {
      throw new PromptValidationError(`reference type ${JSON.stringify(t)} not in ${JSON.stringify([...VALID_REF_TYPES].sort())}.`);
    }
    const role = isPlainObject(r) ? r["role"] : undefined;
    if (!role || String(role).trim() === "") {
      throw new PromptValidationError("every reference requires a non-empty 'role'.");
    }
    counts[t] += 1;
  }

  // Documented caps — hard.
  if (counts.image > DOC_MAX_IMAGES) {
    throw new PromptValidationError(`image references ${counts.image} exceeds documented cap ${DOC_MAX_IMAGES}.`);
  }
  if (counts.video > DOC_MAX_VIDEOS) {
    throw new PromptValidationError(`video references ${counts.video} exceeds documented cap ${DOC_MAX_VIDEOS}.`);
  }
  if (counts.audio > DOC_MAX_AUDIOS) {
    throw new PromptValidationError(`audio references ${counts.audio} exceeds documented cap ${DOC_MAX_AUDIOS}.`);
  }

  // Heuristic caps — soft, override-able.
  const violations: string[] = [];
  if ((counts.video > 0 || counts.audio > 0) && counts.image < HEURISTIC_MIN_IMAGES_WHEN_AV_PRESENT) {
    violations.push(
      `video or audio present but image count ${counts.image} below floor ${HEURISTIC_MIN_IMAGES_WHEN_AV_PRESENT}`,
    );
  }
  if (counts.video > HEURISTIC_EFFECTIVE_VIDEO_CAP) {
    violations.push(
      `video count ${counts.video} exceeds effective heuristic cap ${HEURISTIC_EFFECTIVE_VIDEO_CAP} ` +
        `(documented max is ${DOC_MAX_VIDEOS}; field experience says blending occurs above 2)`,
    );
  }
  if (counts.audio > HEURISTIC_EFFECTIVE_AUDIO_CAP) {
    violations.push(
      `audio count ${counts.audio} exceeds effective heuristic cap ${HEURISTIC_EFFECTIVE_AUDIO_CAP} ` +
        `(documented max is ${DOC_MAX_AUDIOS}; field experience says blending occurs above 2)`,
    );
  }

  if (violations.length > 0 && !override) {
    throw new PromptValidationError(
      "MR mix-budget heuristic violated: " +
        violations.join("; ") +
        ". Pass override_mix_budget=True to bypass; the heuristic is vendor-unconfirmed (verify " +
        "against latest official docs).",
    );
  }
  return counts;
}

export interface BuildPromptArgs {
  readonly mode: string;
  readonly subject: string;
  readonly action: string;
  readonly setting: string;
  readonly style: string;
  readonly camera: string;
  readonly motion: string;
  readonly references?: readonly ReferenceSpec[] | undefined;
  readonly i2vReference?: string | undefined;
  readonly firstFrame?: string | undefined;
  readonly lastFrame?: string | undefined;
  readonly audio?: string | undefined;
  readonly aspectRatio?: string;
  readonly overrideMixBudget?: boolean;
}

export function buildPrompt(args: BuildPromptArgs): string {
  const {
    mode,
    subject,
    action,
    setting,
    style,
    camera,
    motion,
    references,
    i2vReference,
    firstFrame,
    lastFrame,
    audio,
    aspectRatio = "16:9",
    overrideMixBudget = false,
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

  const clauses: Record<string, string> = { subject, action, setting, style, camera, motion };
  const missing = Object.entries(clauses)
    .filter(([, v]) => !v || !v.trim())
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new PromptValidationError(`missing required clause(s): ${JSON.stringify(missing)}.`);
  }
  if (allNegation(...Object.values(clauses))) {
    throw new PromptValidationError("every clause leans on negation tokens; rephrase to positive.");
  }

  let counts: Record<RefType, number> = { image: 0, video: 0, audio: 0 };
  if (mode === "I2V") {
    if (!i2vReference || !i2vReference.trim()) {
      throw new PromptValidationError("I2V mode requires an i2v_reference.");
    }
  }
  if (mode === "MR") {
    const refs = references ?? [];
    if (refs.length === 0) {
      throw new PromptValidationError("MR mode requires at least 1 reference.");
    }
    counts = validateMr(refs, overrideMixBudget);
  }
  if (mode === "F/L") {
    if (!firstFrame || !firstFrame.trim()) throw new PromptValidationError("F/L mode requires a first_frame.");
    if (!lastFrame || !lastFrame.trim()) throw new PromptValidationError("F/L mode requires a last_frame.");
  }

  const parts: string[] = [];
  if (mode === "I2V") {
    parts.push(`Reference (frame 1): ${i2vReference!.trim()}`);
    parts.push("");
  }
  if (mode === "MR") {
    parts.push("References:");
    // Group by type.
    const groups: Record<RefType, string[]> = { image: [], video: [], audio: [] };
    for (const r of references ?? []) {
      const t = r.type as RefType;
      groups[t].push(String(r.role));
    }
    if (groups.image.length > 0) {
      parts.push(`  Images (${counts.image}/${DOC_MAX_IMAGES}):`);
      groups.image.forEach((role, i) => parts.push(`    ${i + 1}. ${role}`));
    }
    if (groups.video.length > 0) {
      parts.push(`  Videos (${counts.video}/${DOC_MAX_VIDEOS}):`);
      groups.video.forEach((role, i) => parts.push(`    ${i + 1}. [video] ${role}`));
    }
    if (groups.audio.length > 0) {
      parts.push(`  Audios (${counts.audio}/${DOC_MAX_AUDIOS}):`);
      groups.audio.forEach((role, i) => parts.push(`    ${i + 1}. [audio] ${role}`));
    }
    if (overrideMixBudget) {
      parts.push("  [heuristic-override: user accepted mix-budget violation]");
    }
    parts.push("");
  }
  if (mode === "F/L") {
    parts.push(`First frame: ${firstFrame!.trim()}`);
    parts.push(`Last frame: ${lastFrame!.trim()}`);
    parts.push("");
  }

  parts.push(subject.trim());
  parts.push(action.trim());
  parts.push(setting.trim());
  parts.push(style.trim());
  parts.push(camera.trim());
  parts.push(`Motion: ${motion.trim()}`);
  if (audio && audio.trim()) parts.push(`Audio: ${audio.trim()}`);
  parts.push("");
  parts.push(`[aspect_ratio=${aspectRatio}]`);
  return parts.join("\n");
}

function parseRefs(raw: readonly string[] | undefined): ReferenceSpec[] | undefined {
  if (!raw || raw.length === 0) return undefined;
  const out: ReferenceSpec[] = [];
  for (const r of raw) {
    try {
      out.push(JSON.parse(r) as ReferenceSpec);
    } catch (exc) {
      throw new PromptValidationError(`--reference value ${JSON.stringify(r)} is not valid JSON: ${(exc as Error).message}`);
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
  motion: string;
  reference: string[] | undefined;
  i2vReference: string | undefined;
  firstFrame: string | undefined;
  lastFrame: string | undefined;
  audio: string | undefined;
  aspectRatio: string;
  overrideMixBudget: boolean;
}

const HELP_TEXT = `usage: build-prompt.ts --mode {T2V,I2V,MR,F/L} --subject SUBJECT --action ACTION
                       --setting SETTING --style STYLE --camera CAMERA --motion MOTION [options]

Assemble a Seedance 2.0 prompt.

options:
  --mode {T2V,I2V,MR,F/L}   required
  --subject SUBJECT          required
  --action ACTION              required
  --setting SETTING            required
  --style STYLE                 required
  --camera CAMERA                required
  --motion MOTION                 required
  --reference REFERENCE             JSON {"type":"image|video|audio","role":"..."}; repeat for MR.
  --i2v-reference I2V_REFERENCE
  --first-frame FIRST_FRAME
  --last-frame LAST_FRAME
  --audio AUDIO
  --aspect-ratio {16:9,9:16}   default 16:9
  --override-mix-budget          bypass the vendor-unconfirmed mix-budget heuristic for MR.
`;

function parseArgs(argv: readonly string[]): ParsedArgs {
  const references: string[] = [];
  let hasReferences = false;
  const values: Record<string, string> = {};
  let aspectRatio = "16:9";
  let overrideMixBudget = false;

  let i = 0;
  while (i < argv.length) {
    const token = argv[i]!;
    if (token === "--help" || token === "-h") {
      process.stdout.write(HELP_TEXT);
      process.exit(0);
    }
    if (token === "--override-mix-budget") {
      overrideMixBudget = true;
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
      case "--motion":
        values["motion"] = next();
        break;
      case "--reference":
        references.push(next());
        hasReferences = true;
        break;
      case "--i2v-reference":
        values["i2vReference"] = next();
        break;
      case "--first-frame":
        values["firstFrame"] = next();
        break;
      case "--last-frame":
        values["lastFrame"] = next();
        break;
      case "--audio":
        values["audio"] = next();
        break;
      case "--aspect-ratio":
        aspectRatio = next();
        break;
      default:
        throw new PromptValidationError(`unrecognized arguments: ${token}`);
    }
    i += 1;
  }

  for (const required of ["mode", "subject", "action", "setting", "style", "camera", "motion"]) {
    if (values[required] === undefined) {
      throw new PromptValidationError(`the following arguments are required: --${required}`);
    }
  }

  return {
    mode: values["mode"]!,
    subject: values["subject"]!,
    action: values["action"]!,
    setting: values["setting"]!,
    style: values["style"]!,
    camera: values["camera"]!,
    motion: values["motion"]!,
    reference: hasReferences ? references : undefined,
    i2vReference: values["i2vReference"],
    firstFrame: values["firstFrame"],
    lastFrame: values["lastFrame"],
    audio: values["audio"],
    aspectRatio,
    overrideMixBudget,
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
    const refs = parseRefs(args.reference);
    const prompt = buildPrompt({
      mode: args.mode,
      subject: args.subject,
      action: args.action,
      setting: args.setting,
      style: args.style,
      camera: args.camera,
      motion: args.motion,
      references: refs,
      i2vReference: args.i2vReference,
      firstFrame: args.firstFrame,
      lastFrame: args.lastFrame,
      audio: args.audio,
      aspectRatio: args.aspectRatio,
      overrideMixBudget: args.overrideMixBudget,
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
