#!/usr/bin/env -S npx tsx
/**
 * Assemble and validate a Happy Horse prompt for front-end use.
 *
 * Ported from build-prompt.py (issue #255) — same clause rules, same CLI shape and exit codes; only
 * the language changed.
 *
 * This is a prompt-assembly helper: it builds the natural-language prompt string a user pastes into
 * the Happy Horse front-end (happy-horse.ai, running Alibaba's HappyHorse-1.0). It does NOT call any
 * API. On-screen settings (duration, resolution, aspect ratio) are recorded for the operator and
 * printed in a trailing settings block; they are not part of the prompt the model reads.
 *
 * Modes: T2V, I2V (first-frame), R2V (up to 5 reference assets), edit.
 *
 * Happy Horse prompt rules enforced here:
 *   - subject+action leads, then camera, then style, then environment; audio block placed LAST.
 *   - camera clause names one of the six named moves (pan, tilt, dolly, zoom, orbit, crane) or
 *     'static' — soft check; --override-camera bypasses it for prose-only moves like 'tracking shot'.
 *   - reference assets bound with @Image1 / @Video1 tokens.
 *   - I2V: exactly one first-frame image. R2V / edit: 1..5 reference assets.
 *   - native audio: dialogue requires a language; audio always last.
 *   - duration 4..15 s; resolution in {480p, 720p, 1080p}; aspect ratio in the supported set.
 *   - assembled prompt under the ~2500-character front-end limit.
 *   - no negation-only prompts (Happy Horse has no negative-prompt field).
 */

const VALID_MODES = ["T2V", "I2V", "R2V", "edit"] as const;
type Mode = (typeof VALID_MODES)[number];

const VALID_RESOLUTIONS = ["480p", "720p", "1080p"] as const;
type Resolution = (typeof VALID_RESOLUTIONS)[number];

const VALID_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;
type AspectRatio = (typeof VALID_ASPECT_RATIOS)[number];

const VALID_REF_KINDS = ["image", "video"] as const;
type RefKind = (typeof VALID_REF_KINDS)[number];

const NAMED_CAMERA_MOVES = ["pan", "tilt", "dolly", "zoom", "orbit", "crane", "static"] as const;
const NEGATION_TOKENS = [" no ", " not ", " without ", " avoid ", " never "] as const;
const DURATION_MIN = 4;
const DURATION_MAX = 15;
const REF_CAP = 5;
const CHAR_LIMIT = 2500;

export class PromptValidationError extends Error {}

function isMode(value: string): value is Mode {
  return (VALID_MODES as readonly string[]).includes(value);
}
function isResolution(value: string): value is Resolution {
  return (VALID_RESOLUTIONS as readonly string[]).includes(value);
}
function isAspectRatio(value: string): value is AspectRatio {
  return (VALID_ASPECT_RATIOS as readonly string[]).includes(value);
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
      const kind = r["kind"] ?? "image";
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
      out.push({ kind: "image", role: String(r) });
    }
  }
  return out;
}

/** True when the camera clause mentions a named move or 'static'. */
function cameraNamesMove(camera: string): boolean {
  const lowered = camera.toLowerCase();
  return NAMED_CAMERA_MOVES.some((move) => lowered.includes(move));
}

interface DialogueLine {
  readonly language: string;
  readonly line: string;
}

/** Dialogue arg format: 'language|line'. */
function parseDialogue(raw: string | undefined): DialogueLine | undefined {
  if (!raw || !raw.trim()) return undefined;
  if (!raw.includes("|")) {
    throw new PromptValidationError(
      "dialogue must be 'language|line', e.g. 'English|she says, \"You made it.\"'. A language is " +
        "required for accurate lip-sync.",
    );
  }
  const idx = raw.indexOf("|");
  const lang = raw.slice(0, idx);
  const line = raw.slice(idx + 1);
  if (!lang.trim()) throw new PromptValidationError("dialogue requires a language.");
  if (!line.trim()) throw new PromptValidationError("dialogue requires a line.");
  return { language: lang.trim(), line: line.trim() };
}

function settingsBlock(duration: number, resolution: string, aspectRatio: string): string[] {
  return [
    "",
    "[on-screen settings (pick these in the UI; NOT part of the prompt the model reads):",
    `  duration_s=${duration}`,
    `  resolution=${resolution}`,
    `  aspect_ratio=${aspectRatio}`,
    "]",
  ];
}

function formatSequence(rawBeats: readonly string[]): string {
  const beats = rawBeats.map((b) => b.trim()).filter((b) => b.length > 0);
  if (beats.length === 0) return "";
  if (beats.length === 1) return beats[0]! + ".";
  if (beats.length === 2) return `First, ${beats[0]}. Then, ${beats[1]}.`;
  const parts = [`First, ${beats[0]}.`];
  for (const b of beats.slice(1, -1)) {
    parts.push(`Then, ${b}.`);
  }
  parts.push(`Finally, ${beats[beats.length - 1]}.`);
  return parts.join(" ");
}

export interface BuildPromptArgs {
  readonly mode: string;
  readonly subject: string;
  readonly action: string;
  readonly camera: string;
  readonly style?: string;
  readonly environment?: string;
  readonly references?: readonly unknown[] | undefined;
  readonly dialogue?: string | undefined;
  readonly sfx?: string | undefined;
  readonly ambience?: string | undefined;
  readonly music?: string | undefined;
  readonly sequence?: readonly string[] | undefined;
  readonly duration?: number;
  readonly resolution?: string;
  readonly aspectRatio?: string;
  readonly overrideCamera?: boolean;
}

export function buildPrompt(args: BuildPromptArgs): string {
  const {
    mode,
    subject,
    action,
    camera,
    style = "",
    environment = "",
    references,
    dialogue,
    sfx,
    ambience,
    music,
    sequence,
    duration = 5,
    resolution = "1080p",
    aspectRatio = "16:9",
    overrideCamera = false,
  } = args;

  if (!isMode(mode)) {
    throw new PromptValidationError(
      `mode must be one of ${JSON.stringify([...VALID_MODES].sort())}; got ${JSON.stringify(mode)}`,
    );
  }
  if (!subject || !subject.trim()) throw new PromptValidationError(`${mode} requires a subject clause.`);
  if (!action || !action.trim()) throw new PromptValidationError(`${mode} requires an action clause.`);
  if (!camera || !camera.trim()) {
    throw new PromptValidationError(`${mode} requires a camera clause (name a move or 'static').`);
  }
  if (!cameraNamesMove(camera) && !overrideCamera) {
    throw new PromptValidationError(
      "camera clause names none of the six named moves (pan, tilt, dolly, zoom, orbit, crane) nor " +
        "'static'. Pass override_camera=True (CLI: --override-camera) to allow a prose-only move such " +
        "as 'tracking shot' or 'reference @Video1 for camera movement'.",
    );
  }
  if (!isResolution(resolution)) {
    throw new PromptValidationError(
      `resolution must be one of ${JSON.stringify([...VALID_RESOLUTIONS].sort())}; got ${JSON.stringify(resolution)}`,
    );
  }
  if (!isAspectRatio(aspectRatio)) {
    throw new PromptValidationError(
      `aspect_ratio must be one of ${JSON.stringify([...VALID_ASPECT_RATIOS].sort())}; ` +
        `got ${JSON.stringify(aspectRatio)}`,
    );
  }
  if (!(duration >= DURATION_MIN && duration <= DURATION_MAX)) {
    throw new PromptValidationError(
      `duration must be ${DURATION_MIN}..${DURATION_MAX} seconds; got ${duration}.`,
    );
  }
  if (allNegation(subject, action, camera, style, environment)) {
    throw new PromptValidationError(
      "every clause leans on negation tokens. Rephrase to positive description; Happy Horse has no " +
        "negative-prompt field.",
    );
  }

  const refs = normalizeRefs(references ?? []);
  if (mode === "I2V") {
    const imgs = refs.filter((r) => r.kind === "image");
    if (imgs.length !== 1 || refs.length !== 1) {
      throw new PromptValidationError(
        `I2V requires exactly one reference image (the first frame); got ${refs.length} reference(s).`,
      );
    }
  } else if (mode === "R2V" || mode === "edit") {
    if (!(refs.length >= 1 && refs.length <= REF_CAP)) {
      throw new PromptValidationError(`${mode} requires 1..${REF_CAP} reference assets; got ${refs.length}.`);
    }
  } else if (mode === "T2V" && refs.length > 0) {
    throw new PromptValidationError("T2V takes no reference assets; use I2V, R2V, or edit.");
  }

  const dlg = parseDialogue(dialogue);

  const parts: string[] = [];

  // Reference-token binding line.
  if (refs.length > 0) {
    let imageIdx = 0;
    let videoIdx = 0;
    const bound: string[] = [];
    for (const r of refs) {
      let tok: string;
      if (r.kind === "video") {
        videoIdx += 1;
        tok = `@Video${videoIdx}`;
      } else {
        imageIdx += 1;
        tok = `@Image${imageIdx}`;
      }
      bound.push(`${tok}: ${r.role}`);
    }
    if (mode === "I2V") {
      parts.push(`Use @Image1 as the first frame (${refs[0]!.role}).`);
    } else if (mode === "edit") {
      parts.push("Edit; " + bound.join("; ") + ".");
    } else {
      parts.push("Use " + bound.join("; ") + ".");
    }
  }

  // Subject + action (leads), optional sequence beats.
  parts.push(`${subject.trim()} ${action.trim()}`.trim());
  if (sequence && sequence.length > 0) {
    parts.push("Sequence: " + formatSequence(sequence));
  }

  // Camera, style, environment.
  parts.push(`Camera: ${camera.trim()}.`);
  if (style && style.trim()) parts.push(`Style: ${style.trim()}.`);
  if (environment && environment.trim()) parts.push(`Environment: ${environment.trim()}.`);

  // Audio block — always LAST.
  const audioLines: string[] = [];
  if (dlg) audioLines.push(`  Dialogue (${dlg.language}): ${dlg.line}`);
  if (sfx && sfx.trim()) audioLines.push(`  SFX: ${sfx.trim()}.`);
  if (ambience && ambience.trim()) audioLines.push(`  Ambience: ${ambience.trim()}.`);
  if (music && music.trim()) audioLines.push(`  Music: ${music.trim()}.`);
  if (audioLines.length > 0) {
    parts.push("Audio:");
    parts.push(...audioLines);
  }

  const body = parts.join("\n");
  if (body.length > CHAR_LIMIT) {
    throw new PromptValidationError(
      `assembled prompt is ${body.length} characters; over the ${CHAR_LIMIT}-character front-end ` +
        "limit. Trim it.",
    );
  }

  const out = [...parts, ...settingsBlock(duration, resolution, aspectRatio)];
  return out.join("\n");
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
  camera: string;
  style: string;
  environment: string;
  reference: string[] | undefined;
  dialogue: string | undefined;
  sfx: string | undefined;
  ambience: string | undefined;
  music: string | undefined;
  sequence: string[] | undefined;
  duration: number;
  resolution: string;
  aspectRatio: string;
  overrideCamera: boolean;
}

const HELP_TEXT = `usage: build-prompt.ts --mode {T2V,I2V,R2V,edit} --subject SUBJECT --action ACTION
                       --camera CAMERA [options]

Assemble a Happy Horse prompt with validation.

options:
  --mode {T2V,I2V,R2V,edit}   required
  --subject SUBJECT            required
  --action ACTION               required
  --camera CAMERA                required; name a move or 'static'.
  --style STYLE
  --environment ENVIRONMENT
  --reference REFERENCE          plain string (image) or JSON {"kind":"image|video","role":"..."};
                                  repeatable. I2V=1 image; R2V/edit=1..5.
  --dialogue DIALOGUE            'language|line'; language required.
  --sfx SFX
  --ambience AMBIENCE
  --music MUSIC
  --beat BEAT                    sequence beat; repeat for First/then/finally.
  --duration DURATION             default 5
  --resolution {480p,720p,1080p}  default 1080p
  --aspect-ratio {16:9,9:16,1:1,4:3,3:4}   default 16:9
  --override-camera              allow a camera clause naming none of the six moves nor 'static'.
`;

function parseArgs(argv: readonly string[]): ParsedArgs {
  const references: string[] = [];
  let hasReference = false;
  const beats: string[] = [];
  let hasBeats = false;
  const values: Record<string, string> = {};
  let duration = 5;
  let resolution = "1080p";
  let aspectRatio = "16:9";
  let overrideCamera = false;

  let i = 0;
  while (i < argv.length) {
    const token = argv[i]!;
    if (token === "--help" || token === "-h") {
      process.stdout.write(HELP_TEXT);
      process.exit(0);
    }
    if (token === "--override-camera") {
      overrideCamera = true;
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
      case "--camera":
        values["camera"] = next();
        break;
      case "--style":
        values["style"] = next();
        break;
      case "--environment":
        values["environment"] = next();
        break;
      case "--reference":
        references.push(next());
        hasReference = true;
        break;
      case "--dialogue":
        values["dialogue"] = next();
        break;
      case "--sfx":
        values["sfx"] = next();
        break;
      case "--ambience":
        values["ambience"] = next();
        break;
      case "--music":
        values["music"] = next();
        break;
      case "--beat":
        beats.push(next());
        hasBeats = true;
        break;
      case "--duration":
        duration = Number.parseInt(next(), 10);
        break;
      case "--resolution":
        resolution = next();
        break;
      case "--aspect-ratio":
        aspectRatio = next();
        break;
      default:
        throw new PromptValidationError(`unrecognized arguments: ${token}`);
    }
    i += 1;
  }

  for (const required of ["mode", "subject", "action", "camera"]) {
    if (values[required] === undefined) {
      throw new PromptValidationError(`the following arguments are required: --${required}`);
    }
  }

  return {
    mode: values["mode"]!,
    subject: values["subject"]!,
    action: values["action"]!,
    camera: values["camera"]!,
    style: values["style"] ?? "",
    environment: values["environment"] ?? "",
    reference: hasReference ? references : undefined,
    dialogue: values["dialogue"],
    sfx: values["sfx"],
    ambience: values["ambience"],
    music: values["music"],
    sequence: hasBeats ? beats : undefined,
    duration,
    resolution,
    aspectRatio,
    overrideCamera,
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
      camera: args.camera,
      style: args.style,
      environment: args.environment,
      references: refs,
      dialogue: args.dialogue,
      sfx: args.sfx,
      ambience: args.ambience,
      music: args.music,
      sequence: args.sequence,
      duration: args.duration,
      resolution: args.resolution,
      aspectRatio: args.aspectRatio,
      overrideCamera: args.overrideCamera,
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
