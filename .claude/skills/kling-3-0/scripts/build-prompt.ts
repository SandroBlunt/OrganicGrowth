#!/usr/bin/env -S npx tsx
/**
 * Assemble and validate a Kling 3.0 prompt.
 *
 * Ported from build-prompt.py (issue #255) — same clause/element/shot rules, same CLI shape and exit
 * codes; only the language changed.
 *
 * Modes: T2V, I2V (optional element binding), MR (element binding, 1-3 images per element), F/L.
 * Multi-Shot (Auto / Custom, up to 6 shots, 3-15 s total) and native Audio (dialogue with attribution)
 * layer on top.
 *
 * Notes:
 *   - Multi-shot is a first-class mode in Kling 3.0; the historical "one beat per prompt" guard is
 *     removed.
 *   - Negative prompt is a separate parameter and does NOT count against the visible prompt's
 *     character budget.
 *   - 1:1 and 4:5 are supported in addition to 16:9 and 9:16.
 */

const VALID_MODES = ["T2V", "I2V", "MR", "F/L"] as const;
type Mode = (typeof VALID_MODES)[number];

const VALID_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:5"] as const;
type AspectRatio = (typeof VALID_ASPECT_RATIOS)[number];

const VALID_MULTI_SHOT = ["single", "auto", "custom"] as const;
type MultiShotMode = (typeof VALID_MULTI_SHOT)[number];

const NEGATION_TOKENS = [" no ", " not ", " without ", " avoid ", " never "] as const;
const ELEMENT_MIN = 2;
const ELEMENT_MAX = 4;
const IMAGES_PER_ELEMENT_MIN = 1;
const IMAGES_PER_ELEMENT_MAX = 3;
const DURATION_MIN_S = 3;
const DURATION_MAX_S = 15;
const MAX_SHOTS = 6;
const MOTION_INTENSITY_MIN = 0.1;
const MOTION_INTENSITY_MAX = 1.0;

export class PromptValidationError extends Error {}

function isMode(value: string): value is Mode {
  return (VALID_MODES as readonly string[]).includes(value);
}
function isAspectRatio(value: string): value is AspectRatio {
  return (VALID_ASPECT_RATIOS as readonly string[]).includes(value);
}
function isMultiShotMode(value: string): value is MultiShotMode {
  return (VALID_MULTI_SHOT as readonly string[]).includes(value);
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

export interface ElementSpec {
  readonly name?: unknown;
  readonly images?: readonly unknown[];
}

export interface ShotSpec {
  readonly durationS?: unknown;
  readonly text?: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateElements(elements: readonly ElementSpec[]): void {
  if (!(elements.length >= ELEMENT_MIN && elements.length <= ELEMENT_MAX)) {
    throw new PromptValidationError(
      `MR mode requires ${ELEMENT_MIN}..${ELEMENT_MAX} elements; got ${elements.length}.`,
    );
  }
  elements.forEach((el, index) => {
    const i = index + 1;
    if (!isPlainObject(el)) {
      throw new PromptValidationError(
        `element ${i} is not a dict. Each element must have 'name' and 'images' keys.`,
      );
    }
    const name = el["name"];
    const images = (el["images"] as readonly unknown[] | undefined) ?? [];
    if (!name || String(name).trim() === "") {
      throw new PromptValidationError(`element ${i} is missing a non-empty 'name'.`);
    }
    if (!(images.length >= IMAGES_PER_ELEMENT_MIN && images.length <= IMAGES_PER_ELEMENT_MAX)) {
      throw new PromptValidationError(
        `element ${i} (${JSON.stringify(name)}) has ${images.length} images; each element requires ` +
          `${IMAGES_PER_ELEMENT_MIN}..${IMAGES_PER_ELEMENT_MAX} images.`,
      );
    }
  });
}

function validateShots(
  shots: readonly ShotSpec[],
  multiShotMode: MultiShotMode,
  totalDuration: number | undefined,
): void {
  if (shots.length > MAX_SHOTS) {
    throw new PromptValidationError(`Multi-Shot accepts at most ${MAX_SHOTS} shots; got ${shots.length}.`);
  }
  if (multiShotMode === "custom") {
    if (shots.length === 0) {
      throw new PromptValidationError("Custom Multi-Shot requires at least one shot.");
    }
    const durations: number[] = [];
    shots.forEach((s, index) => {
      const i = index + 1;
      if (!isPlainObject(s)) {
        throw new PromptValidationError(`shot ${i} is not a dict; expected {'duration_s': N, 'text': '...'}.`);
      }
      const d = s["durationS"];
      const text = s["text"];
      if (d === undefined || d === null || typeof d !== "number" || d <= 0) {
        throw new PromptValidationError(`shot ${i} requires a positive 'duration_s'.`);
      }
      if (!text || String(text).trim() === "") {
        throw new PromptValidationError(`shot ${i} requires non-empty 'text'.`);
      }
      durations.push(d);
    });
    const total = durations.reduce((sum, d) => sum + d, 0);
    if (totalDuration !== undefined && Math.abs(total - totalDuration) > 1e-6) {
      throw new PromptValidationError(
        `Custom Multi-Shot per-shot durations sum to ${total} s but requested total duration is ` +
          `${totalDuration} s.`,
      );
    }
    if (!(total >= DURATION_MIN_S && total <= DURATION_MAX_S)) {
      throw new PromptValidationError(
        `Custom Multi-Shot total ${total} s outside the supported range ${DURATION_MIN_S}..${DURATION_MAX_S} s.`,
      );
    }
  }
}

function validateMotionIntensity(value: number | undefined): void {
  if (value === undefined) return;
  if (!(value >= MOTION_INTENSITY_MIN && value <= MOTION_INTENSITY_MAX)) {
    throw new PromptValidationError(
      `motion_intensity ${value} outside supported range ${MOTION_INTENSITY_MIN}..${MOTION_INTENSITY_MAX}.`,
    );
  }
}

export interface BuildPromptArgs {
  readonly mode: string;
  readonly subject: string;
  readonly action: string;
  readonly setting: string;
  readonly style: string;
  readonly camera: string;
  readonly motion: string;
  readonly elements?: readonly ElementSpec[] | undefined;
  readonly firstFrame?: string | undefined;
  readonly lastFrame?: string | undefined;
  readonly i2vReference?: string | undefined;
  readonly aspectRatio?: string;
  readonly multiShotMode?: string;
  readonly shots?: readonly ShotSpec[] | undefined;
  readonly totalDurationS?: number | undefined;
  readonly audio?: string | undefined;
  readonly motionIntensity?: number | undefined;
  readonly negativePrompt?: string | undefined;
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
    elements: elementsArg,
    firstFrame,
    lastFrame,
    i2vReference,
    aspectRatio = "16:9",
    multiShotMode = "single",
    shots,
    totalDurationS,
    audio,
    motionIntensity,
    negativePrompt,
  } = args;

  if (!isMode(mode)) {
    throw new PromptValidationError(
      `mode must be one of ${JSON.stringify([...VALID_MODES].sort())}; got ${JSON.stringify(mode)}`,
    );
  }
  if (!isAspectRatio(aspectRatio)) {
    throw new PromptValidationError(
      `aspect_ratio must be one of ${JSON.stringify([...VALID_ASPECT_RATIOS].sort())} for Kling 3.0; ` +
        `got ${JSON.stringify(aspectRatio)}`,
    );
  }
  if (!isMultiShotMode(multiShotMode)) {
    throw new PromptValidationError(
      `multi_shot_mode must be one of ${JSON.stringify([...VALID_MULTI_SHOT].sort())}; ` +
        `got ${JSON.stringify(multiShotMode)}`,
    );
  }
  if (totalDurationS !== undefined && !(totalDurationS >= DURATION_MIN_S && totalDurationS <= DURATION_MAX_S)) {
    throw new PromptValidationError(
      `total_duration_s ${totalDurationS} outside supported range ${DURATION_MIN_S}..${DURATION_MAX_S}.`,
    );
  }
  validateMotionIntensity(motionIntensity);

  const clauses: Record<string, string> = { subject, action, setting, style, camera, motion };
  const missing = Object.entries(clauses)
    .filter(([, v]) => !v || !v.trim())
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new PromptValidationError(
      `missing required clause(s): ${JSON.stringify(missing)}. The motion clause is mandatory.`,
    );
  }
  if (allNegation(...Object.values(clauses))) {
    throw new PromptValidationError("every clause leans on negation tokens. Rephrase to positive description.");
  }

  let elements = elementsArg;

  if (mode === "I2V") {
    if (!i2vReference || !i2vReference.trim()) {
      throw new PromptValidationError("I2V mode requires an i2v_reference (start frame) image.");
    }
    if (elements && elements.length > 0) validateElements(elements);
  }

  if (mode === "MR") {
    elements = elements ?? [];
    validateElements(elements);
  }

  if (mode === "F/L") {
    if (!firstFrame || !firstFrame.trim()) throw new PromptValidationError("F/L mode requires a first_frame.");
    if (!lastFrame || !lastFrame.trim()) throw new PromptValidationError("F/L mode requires a last_frame.");
  }

  if (multiShotMode !== "single") {
    validateShots(shots ?? [], multiShotMode, totalDurationS);
  }

  const parts: string[] = [];
  if (mode === "I2V") {
    parts.push(`Reference (start frame): ${i2vReference!.trim()}`);
    if (elements && elements.length > 0) {
      parts.push("Bound elements:");
      elements.forEach((el, index) => {
        const i = index + 1;
        const images = (el.images as readonly unknown[]) ?? [];
        parts.push(`  Element ${i} — ${el.name}: ${images.length} images.`);
        images.forEach((img, j) => {
          parts.push(`    image ${i}.${j + 1}: ${img}`);
        });
      });
    }
    parts.push("");
  }
  if (mode === "MR") {
    parts.push("Elements:");
    (elements ?? []).forEach((el, index) => {
      const i = index + 1;
      const name = el.name;
      const imgs = (el.images as readonly unknown[]) ?? [];
      parts.push(`  Element ${i} — ${name}: ${imgs.length} images.`);
      imgs.forEach((img, j) => {
        parts.push(`    image ${i}.${j + 1}: ${img}`);
      });
    });
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

  if (multiShotMode === "auto") {
    parts.push(`Multi-Shot: auto (model plans transitions; up to ${MAX_SHOTS} shots).`);
    if (shots && shots.length > 0) {
      shots.forEach((s, index) => {
        const text = typeof s.text === "string" ? s.text.trim() : "";
        parts.push(`  Shot ${index + 1}: ${text}`);
      });
    }
  } else if (multiShotMode === "custom") {
    parts.push("Multi-Shot: custom (per-shot durations).");
    (shots ?? []).forEach((s, index) => {
      const text = typeof s.text === "string" ? s.text.trim() : "";
      parts.push(`  Shot ${index + 1} (${s.durationS}s): ${text}`);
    });
  }

  if (audio && audio.trim()) parts.push(`Audio: ${audio.trim()}`);
  if (motionIntensity !== undefined) parts.push(`Motion intensity: ${motionIntensity}`);

  parts.push("");
  parts.push(`[aspect_ratio=${aspectRatio}]`);
  if (totalDurationS !== undefined) parts.push(`[duration_s=${totalDurationS}]`);
  if (negativePrompt && negativePrompt.trim()) {
    parts.push("");
    parts.push(
      `[negative_prompt (separate field; not counted in prompt char budget): ${negativePrompt.trim()}]`,
    );
  }
  return parts.join("\n");
}

function parseJsonList(raw: readonly string[] | undefined, flagName: string): unknown[] | undefined {
  if (!raw || raw.length === 0) return undefined;
  const out: unknown[] = [];
  for (const r of raw) {
    try {
      out.push(JSON.parse(r));
    } catch (exc) {
      throw new PromptValidationError(
        `${flagName} value ${JSON.stringify(r)} is not valid JSON: ${(exc as Error).message}`,
      );
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
  element: string[] | undefined;
  firstFrame: string | undefined;
  lastFrame: string | undefined;
  i2vReference: string | undefined;
  aspectRatio: string;
  multiShotMode: string;
  shot: string[] | undefined;
  totalDurationS: number | undefined;
  audio: string | undefined;
  motionIntensity: number | undefined;
  negativePrompt: string | undefined;
}

const HELP_TEXT = `usage: build-prompt.ts --mode {T2V,I2V,MR,F/L} --subject SUBJECT --action ACTION
                       --setting SETTING --style STYLE --camera CAMERA --motion MOTION [options]

Assemble a Kling 3.0 prompt.

options:
  --mode {T2V,I2V,MR,F/L}   required
  --subject SUBJECT          required
  --action ACTION             required
  --setting SETTING           required
  --style STYLE                required
  --camera CAMERA               required
  --motion MOTION                required
  --element ELEMENT              JSON {"name":"subject","images":["a","b"]}; repeat 2..4 for MR (1..3 images each).
  --first-frame FIRST_FRAME
  --last-frame LAST_FRAME
  --i2v-reference I2V_REFERENCE
  --aspect-ratio {16:9,9:16,1:1,4:5}   default 16:9
  --multi-shot-mode {single,auto,custom}   default single
  --shot SHOT                     JSON {"duration_s":N,"text":"..."}; repeat for custom/auto (max 6).
  --total-duration-s TOTAL_DURATION_S
  --audio AUDIO
  --motion-intensity MOTION_INTENSITY
  --negative-prompt NEGATIVE_PROMPT
`;

function parseArgs(argv: readonly string[]): ParsedArgs {
  const elements: string[] = [];
  let hasElements = false;
  const shots: string[] = [];
  let hasShots = false;
  const values: Record<string, string> = {};
  let aspectRatio = "16:9";
  let multiShotMode = "single";
  let totalDurationS: number | undefined;
  let motionIntensity: number | undefined;

  let i = 0;
  while (i < argv.length) {
    const token = argv[i]!;
    if (token === "--help" || token === "-h") {
      process.stdout.write(HELP_TEXT);
      process.exit(0);
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
      case "--element":
        elements.push(next());
        hasElements = true;
        break;
      case "--first-frame":
        values["firstFrame"] = next();
        break;
      case "--last-frame":
        values["lastFrame"] = next();
        break;
      case "--i2v-reference":
        values["i2vReference"] = next();
        break;
      case "--aspect-ratio":
        aspectRatio = next();
        break;
      case "--multi-shot-mode":
        multiShotMode = next();
        break;
      case "--shot":
        shots.push(next());
        hasShots = true;
        break;
      case "--total-duration-s":
        totalDurationS = Number.parseInt(next(), 10);
        break;
      case "--audio":
        values["audio"] = next();
        break;
      case "--motion-intensity":
        motionIntensity = Number.parseFloat(next());
        break;
      case "--negative-prompt":
        values["negativePrompt"] = next();
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
    element: hasElements ? elements : undefined,
    firstFrame: values["firstFrame"],
    lastFrame: values["lastFrame"],
    i2vReference: values["i2vReference"],
    aspectRatio,
    multiShotMode,
    shot: hasShots ? shots : undefined,
    totalDurationS,
    audio: values["audio"],
    motionIntensity,
    negativePrompt: values["negativePrompt"],
  };
}

function toElementSpecs(raw: unknown[] | undefined): ElementSpec[] | undefined {
  if (raw === undefined) return undefined;
  return raw as ElementSpec[];
}

function toShotSpecs(raw: unknown[] | undefined): ShotSpec[] | undefined {
  if (raw === undefined) return undefined;
  return raw.map((s) => {
    if (isPlainObject(s) && "duration_s" in s) {
      const { duration_s, ...rest } = s as Record<string, unknown> & { duration_s?: unknown };
      return { ...rest, durationS: duration_s } as ShotSpec;
    }
    return s as ShotSpec;
  });
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
    const elements = toElementSpecs(parseJsonList(args.element, "--element"));
    const shots = toShotSpecs(parseJsonList(args.shot, "--shot"));
    const prompt = buildPrompt({
      mode: args.mode,
      subject: args.subject,
      action: args.action,
      setting: args.setting,
      style: args.style,
      camera: args.camera,
      motion: args.motion,
      elements,
      firstFrame: args.firstFrame,
      lastFrame: args.lastFrame,
      i2vReference: args.i2vReference,
      aspectRatio: args.aspectRatio,
      multiShotMode: args.multiShotMode,
      shots,
      totalDurationS: args.totalDurationS,
      audio: args.audio,
      motionIntensity: args.motionIntensity,
      negativePrompt: args.negativePrompt,
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
