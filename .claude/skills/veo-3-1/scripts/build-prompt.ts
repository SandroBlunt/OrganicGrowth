#!/usr/bin/env -S npx tsx
/**
 * Assemble and validate a Veo 3.1 prompt.
 *
 * Ported from build-prompt.py (issue #255) — same clause/mode-exclusivity/timestamp rules, same CLI
 * shape and exit codes; only the language changed.
 *
 * Modes:
 *   - T2V — text-to-video.
 *   - I2V — image-to-video, single starting frame.
 *   - Ingredients (alias: MR, R2V) — 1-3 reference images, mutually exclusive with F/L. Audio
 *     supported.
 *   - F/L — first-and-last frame, mutually exclusive with Ingredients. Audio supported.
 *   - AddRemove — surgical add/remove of an object on an existing clip. Uses Veo 2 model. NO audio
 *     (--audio is rejected).
 *
 * Layered:
 *   - Timestamp prompting: pass --timestamp-segment repeated; segments must sum to the requested
 *     duration. Used inside any mode for multi-shot in one generation.
 *   - Dialogue/SFX/Ambient/Music syntax in the audio block.
 *   - Negative prompt accepts noun phrases only.
 */

const VALID_MODES = ["T2V", "I2V", "MR", "Ingredients", "R2V", "F/L", "AddRemove"] as const;
type Mode = (typeof VALID_MODES)[number];

const INGREDIENTS_ALIASES = new Set(["MR", "R2V", "Ingredients"]);
const VALID_ASPECT_RATIOS = ["16:9", "9:16"] as const;
type AspectRatio = (typeof VALID_ASPECT_RATIOS)[number];

const NEGATION_TOKENS = [" no ", " not ", " without ", " avoid ", " never "] as const;
const VALID_DURATIONS = new Set([4, 6, 8]);
const INGREDIENTS_MIN = 1;
const INGREDIENTS_MAX = 3;
const TIMESTAMP_RE = /^\[(\d{2}):(\d{2})-(\d{2}):(\d{2})\]/;

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

export interface TimestampSegment {
  readonly startS?: number;
  readonly endS?: number;
  readonly bracket?: string;
  readonly text?: string;
}

/**
 * Accepts { startS, endS, text } or { bracket: '[MM:SS-MM:SS]', text }. Returns the duration in
 * seconds.
 */
function parseSegmentToSeconds(s: TimestampSegment): number {
  let start: number;
  let end: number;
  if (s.startS !== undefined && s.endS !== undefined) {
    start = s.startS;
    end = s.endS;
  } else if (s.bracket !== undefined) {
    const m = TIMESTAMP_RE.exec(s.bracket.trim());
    if (!m) {
      throw new PromptValidationError(
        `timestamp segment bracket ${JSON.stringify(s.bracket)} must match format [MM:SS-MM:SS].`,
      );
    }
    start = Number.parseInt(m[1]!, 10) * 60 + Number.parseInt(m[2]!, 10);
    end = Number.parseInt(m[3]!, 10) * 60 + Number.parseInt(m[4]!, 10);
  } else {
    throw new PromptValidationError(
      "timestamp segment requires either {'start_s', 'end_s'} or {'bracket': '[MM:SS-MM:SS]'}.",
    );
  }
  if (end <= start) {
    throw new PromptValidationError(`timestamp segment end (${end}) must be > start (${start}).`);
  }
  return end - start;
}

function validateTimestampSegments(segments: readonly TimestampSegment[], duration: number | undefined): void {
  if (segments.length === 0) return;
  const durs = segments.map(parseSegmentToSeconds);
  const total = durs.reduce((sum, d) => sum + d, 0);
  if (duration !== undefined && Math.abs(total - duration) > 1e-6) {
    throw new PromptValidationError(
      `timestamp segments sum to ${total} s but requested duration is ${duration} s.`,
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
  readonly references?: readonly string[] | undefined;
  readonly firstFrame?: string | undefined;
  readonly lastFrame?: string | undefined;
  readonly audio?: string | undefined;
  readonly aspectRatio?: string;
  readonly durationS?: number | undefined;
  readonly timestampSegments?: readonly TimestampSegment[] | undefined;
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
    references,
    firstFrame,
    lastFrame,
    audio,
    aspectRatio = "16:9",
    durationS,
    timestampSegments,
    negativePrompt,
  } = args;

  if (!isMode(mode)) {
    throw new PromptValidationError(
      `mode must be one of ${JSON.stringify([...VALID_MODES].sort())}; got ${JSON.stringify(mode)}`,
    );
  }
  if (!isAspectRatio(aspectRatio)) {
    throw new PromptValidationError(
      `aspect_ratio must be one of ${JSON.stringify([...VALID_ASPECT_RATIOS].sort())} for Veo 3.1; ` +
        `got ${JSON.stringify(aspectRatio)}`,
    );
  }
  if (durationS !== undefined && !VALID_DURATIONS.has(durationS)) {
    throw new PromptValidationError(
      `duration_s must be one of ${JSON.stringify([...VALID_DURATIONS].sort())}; got ${JSON.stringify(durationS)}`,
    );
  }

  // Negative-prompt syntax: noun phrases only (no "no X" / "don't").
  if (negativePrompt && negativePrompt.trim()) {
    const npLower = " " + negativePrompt.toLowerCase().trim() + " ";
    const bad = [" no ", " don't ", " do not ", " without "].filter((t) => npLower.includes(t));
    if (bad.length > 0) {
      throw new PromptValidationError(
        `negative_prompt must use noun phrases only (no ${bad.map((t) => t.trim()).join(",")}). ` +
          "Veo 3.1 expects comma-separated nouns, not negation syntax.",
      );
    }
  }

  const clauses: Record<string, string> = { subject, action, setting, style, camera, motion };
  const missing = Object.entries(clauses)
    .filter(([, v]) => !v || !v.trim())
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new PromptValidationError(
      `missing required clause(s): ${JSON.stringify(missing)}. The motion clause is mandatory; the ` +
        "model fills with bias when omitted.",
    );
  }
  if (allNegation(...Object.values(clauses))) {
    throw new PromptValidationError("every clause leans on negation tokens. Rephrase to positive description.");
  }

  const refs = references ?? [];
  const hasFlInputs = Boolean(firstFrame) || Boolean(lastFrame);
  const isIngredients = INGREDIENTS_ALIASES.has(mode);

  if (mode === "I2V") {
    if (refs.length !== 1) {
      throw new PromptValidationError(`I2V mode requires exactly one reference (frame 1); got ${refs.length}.`);
    }
    if (hasFlInputs) {
      throw new PromptValidationError("I2V mode does not accept first_frame / last_frame inputs.");
    }
  }

  if (isIngredients) {
    if (!(refs.length >= INGREDIENTS_MIN && refs.length <= INGREDIENTS_MAX)) {
      throw new PromptValidationError(
        `Ingredients mode requires ${INGREDIENTS_MIN}..${INGREDIENTS_MAX} references; got ${refs.length}.`,
      );
    }
    if (hasFlInputs) {
      throw new PromptValidationError(
        "Ingredients mode is mutually exclusive with first_frame/last_frame (F/L) inputs. Choose one " +
          "or the other.",
      );
    }
  }

  if (mode === "F/L") {
    if (refs.length > 0) {
      throw new PromptValidationError(
        "F/L mode is mutually exclusive with Ingredients-style references. Choose F/L or Ingredients, " +
          "not both.",
      );
    }
    if (!firstFrame || !firstFrame.trim()) throw new PromptValidationError("F/L mode requires a first_frame input.");
    if (!lastFrame || !lastFrame.trim()) throw new PromptValidationError("F/L mode requires a last_frame input.");
  }

  if (mode === "AddRemove") {
    if (audio && audio.trim()) {
      throw new PromptValidationError(
        "AddRemove mode uses the Veo 2 model and does NOT generate audio. Drop the audio input or " +
          "switch to a 3.1 mode.",
      );
    }
  }

  validateTimestampSegments(timestampSegments ?? [], durationS);

  const parts: string[] = [];
  if (isIngredients && refs.length > 0) {
    const canonical = mode === "Ingredients" ? "Ingredients to Video" : mode;
    parts.push(`References (${canonical}; 1-3, mutually exclusive with F/L):`);
    refs.forEach((role, i) => parts.push(`  ${i + 1}. ${role}`));
    parts.push("");
  }
  if (mode === "I2V" && refs.length > 0) {
    parts.push(`Reference (frame 1): ${refs[0]}`);
    parts.push("");
  }
  if (mode === "F/L") {
    parts.push(`First frame: ${firstFrame!.trim()}`);
    parts.push(`Last frame: ${lastFrame!.trim()}`);
    parts.push("");
  }
  if (mode === "AddRemove") {
    parts.push("[AddRemove mode — uses the Veo 2 model. Audio will NOT be generated.]");
    parts.push("");
  }

  if (timestampSegments && timestampSegments.length > 0) {
    parts.push("Timestamp segments:");
    for (const s of timestampSegments) {
      let label = s.bracket;
      if (!label && s.startS !== undefined && s.endS !== undefined) {
        label = `[${String(Math.trunc(s.startS)).padStart(2, "0")}-${String(Math.trunc(s.endS)).padStart(2, "0")}]`;
      }
      parts.push(`  ${label}  ${(s.text ?? "").trim()}`);
    }
    parts.push("");
  }

  parts.push(camera.trim());
  parts.push(subject.trim());
  parts.push(action.trim());
  parts.push(setting.trim());
  parts.push(style.trim());
  parts.push(`Motion: ${motion.trim()}`);
  if (audio && audio.trim()) {
    parts.push("");
    parts.push(`Audio: ${audio.trim()}`);
  }
  parts.push("");
  parts.push(`[aspect_ratio=${aspectRatio}]`);
  if (durationS !== undefined) parts.push(`[duration_s=${durationS}]`);
  if (negativePrompt && negativePrompt.trim()) {
    parts.push(`[negative_prompt (noun phrases only): ${negativePrompt.trim()}]`);
  }
  return parts.join("\n");
}

function parseSegmentsArg(raw: readonly string[] | undefined): unknown[] | undefined {
  if (!raw || raw.length === 0) return undefined;
  const out: unknown[] = [];
  for (const r of raw) {
    try {
      out.push(JSON.parse(r));
    } catch (exc) {
      throw new PromptValidationError(`--timestamp-segment value ${JSON.stringify(r)} is not valid JSON: ${(exc as Error).message}`);
    }
  }
  return out;
}

function toTimestampSegments(raw: unknown[] | undefined): TimestampSegment[] | undefined {
  if (raw === undefined) return undefined;
  return raw.map((s) => {
    if (typeof s === "object" && s !== null) {
      const obj = s as Record<string, unknown>;
      const seg: Record<string, unknown> = {};
      if ("start_s" in obj) seg["startS"] = obj["start_s"];
      if ("end_s" in obj) seg["endS"] = obj["end_s"];
      if ("bracket" in obj) seg["bracket"] = obj["bracket"];
      if ("text" in obj) seg["text"] = obj["text"];
      return seg as TimestampSegment;
    }
    return s as TimestampSegment;
  });
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
  firstFrame: string | undefined;
  lastFrame: string | undefined;
  audio: string | undefined;
  aspectRatio: string;
  durationS: number | undefined;
  timestampSegment: string[] | undefined;
  negativePrompt: string | undefined;
}

const HELP_TEXT = `usage: build-prompt.ts --mode {T2V,I2V,MR,Ingredients,R2V,F/L,AddRemove} --subject SUBJECT
                       --action ACTION --setting SETTING --style STYLE --camera CAMERA
                       --motion MOTION [options]

Assemble a Veo 3.1 prompt.

options:
  --mode {T2V,I2V,MR,Ingredients,R2V,F/L,AddRemove}   required
  --subject SUBJECT          required
  --action ACTION              required
  --setting SETTING            required
  --style STYLE                 required
  --camera CAMERA                required
  --motion MOTION                 required
  --reference REFERENCE             repeatable.
  --first-frame FIRST_FRAME
  --last-frame LAST_FRAME
  --audio AUDIO
  --aspect-ratio {16:9,9:16}   default 16:9
  --duration-s {4,6,8}
  --timestamp-segment TIMESTAMP_SEGMENT   JSON {"bracket":"[00:00-00:02]","text":"..."} or {"start_s":0,"end_s":2,"text":"..."}.
  --negative-prompt NEGATIVE_PROMPT
`;

function parseArgs(argv: readonly string[]): ParsedArgs {
  const references: string[] = [];
  let hasReferences = false;
  const segments: string[] = [];
  let hasSegments = false;
  const values: Record<string, string> = {};
  let aspectRatio = "16:9";
  let durationS: number | undefined;

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
      case "--reference":
        references.push(next());
        hasReferences = true;
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
      case "--duration-s":
        durationS = Number.parseInt(next(), 10);
        break;
      case "--timestamp-segment":
        segments.push(next());
        hasSegments = true;
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
    reference: hasReferences ? references : undefined,
    firstFrame: values["firstFrame"],
    lastFrame: values["lastFrame"],
    audio: values["audio"],
    aspectRatio,
    durationS,
    timestampSegment: hasSegments ? segments : undefined,
    negativePrompt: values["negativePrompt"],
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
    const segments = toTimestampSegments(parseSegmentsArg(args.timestampSegment));
    const prompt = buildPrompt({
      mode: args.mode,
      subject: args.subject,
      action: args.action,
      setting: args.setting,
      style: args.style,
      camera: args.camera,
      motion: args.motion,
      references: args.reference,
      firstFrame: args.firstFrame,
      lastFrame: args.lastFrame,
      audio: args.audio,
      aspectRatio: args.aspectRatio,
      durationS: args.durationS,
      timestampSegments: segments,
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
