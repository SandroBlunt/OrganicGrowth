#!/usr/bin/env -S npx tsx
/**
 * Assemble and validate a Grok Imagine 1.5 video prompt for front-end use.
 *
 * Ported from build-prompt.py (issue #255) — same clause rules, same moderation-safety scanner, same
 * CLI shape and exit codes; only the language changed.
 *
 * This is a prompt-assembly helper: it builds the natural-language prompt string a user pastes into
 * Grok Imagine (grok.com, the X app, or the Grok Imagine app), which runs xAI's Grok Imagine 1.5 video
 * model. It does NOT call any API. On-screen settings (duration, aspect ratio) are recorded for the
 * operator and printed in a trailing settings block; they are not part of the prompt the model reads.
 *
 * Modes: T2V, I2V (image-to-video, preferred), extend (video extension), reference (1-7
 * style/character images).
 *
 * Grok prompt rules enforced here:
 *   - camera move front-loaded, then subject + action (with intensity and timing), then environment /
 *     atmosphere, then lighting / style; the Sound block is placed LAST.
 *   - one camera move per clip: the camera clause must name a known cinematic move (push-in, dolly,
 *     orbit, tracking, arc, pan, tilt, zoom, crane, static / locked-off, handheld) AND name only one
 *     distinct move. --override-camera bypasses both the named-move and the stacking checks.
 *   - a Sound / Audio section is REQUIRED (dialogue, SFX, ambience, or music). Grok generates native
 *     audio in the same pass; a prompt with no sound cue is refused. Sound is always placed last.
 *   - I2V: exactly one reference image (the first frame); the prompt describes only what changes.
 *     extend: exactly one source clip. reference: 1..7 style / character images. T2V: no references.
 *   - moderation-safety scanner (signature): the assembled clauses are scanned for high-risk trigger
 *     words (violence language, extreme photorealism cues, celebrity likeness). If any are found the
 *     build is REFUSED with a per-term safer alternative from the guide's rephrasing table.
 *     --override-safety is a conscious escape hatch (you accept a higher flag risk).
 *   - duration 1..15 s (5-8 s is the sweet spot); aspect ratio in the supported set.
 *   - no negation-only prompts (Grok is positive-direction; there is no negative-prompt field).
 */

const VALID_MODES = ["T2V", "I2V", "extend", "reference"] as const;
type Mode = (typeof VALID_MODES)[number];

const VALID_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;
type AspectRatio = (typeof VALID_ASPECT_RATIOS)[number];

const VALID_REF_KINDS = ["image", "video"] as const;
type RefKind = (typeof VALID_REF_KINDS)[number];

const NEGATION_TOKENS = [" no ", " not ", " without ", " avoid ", " never "] as const;
const DURATION_MIN = 1;
const DURATION_MAX = 15;
const SWEET_SPOT: readonly [number, number] = [5, 8];
const REF_CAP = 7;
const CHAR_LIMIT = 2000;

/**
 * Canonical camera-move groups. Each group maps to the surface variants that name it; synonyms
 * (static / locked-off) collapse to one group so a phrasing like "locked-off / static" is NOT read as
 * two stacked moves.
 */
const CAMERA_MOVE_GROUPS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["push-in", ["push-in", "push in"]],
  ["dolly", ["dolly"]],
  ["orbit", ["orbit", "orbits", "orbiting"]],
  ["tracking", ["tracking", "tracks", "track"]],
  ["arc", ["arc", "arcs", "arcing"]],
  ["pan", ["pan", "pans", "panning"]],
  ["tilt", ["tilt", "tilts", "tilting"]],
  ["zoom", ["zoom", "zooms", "zooming"]],
  ["crane", ["crane", "cranes", "craning"]],
  ["static", ["static", "locked-off", "locked off", "locked-down"]],
  ["handheld", ["handheld", "hand-held"]],
];

/**
 * Moderation triggers -> safer rephrasing, distilled from the guide's "risky -> safer" table plus its
 * high-risk trigger list. Keys are matched with a leading word boundary (so "fight" also catches
 * "fights", "fighting"). Multi-word keys are matched as phrases. Order matters (insertion order,
 * mirroring Python 3.7+ dict iteration order).
 */
const MODERATION_TRIGGERS: ReadonlyArray<readonly [string, string]> = [
  // Direct violence language.
  ["fight", "athletic stage routine / theatrical performance sequence / precise stage-combat rehearsal"],
  ["strike", "synchronized beat / dramatic energy of the movement / theatrical exchange"],
  ["punch", "controlled, pulled, safe stage movement / non-contact theatrical timing"],
  ["attack", "choreographed sequence / theatrical exchange"],
  ["impact", "synchronized beat / dramatic energy of the movement"],
  ["crash", "staged, choreographed collision effect / dramatic staged moment"],
  ["explosion", "stylized burst of light and smoke / cinematic effect"],
  ["blood", "remove injury cues; keep the staged scene clean"],
  ["injury", "frame as a safe, pulled, non-contact stage movement"],
  ["struggle", "controlled, deliberate, theatrical tension"],
  // Extreme photorealism cues.
  ["ultra-realistic", "cinematic film look / high-contrast cinematic style / stylized film lighting"],
  ["8k photorealistic", "cinematic film look / stylized film lighting"],
  ["photorealistic", "cinematic film look / stylized film lighting"],
  ["gritty realism", "cinematic film-noir look / high-contrast cinematic style"],
  ["raw footage", "cinematic take / continuous cinematic shot"],
  ["documentary realism", "cinematic, stylized look"],
  ["found footage", "stylized short-film look / cinematic take"],
  ["cctv", "cinematic framing (not surveillance framing)"],
  ["surveillance", "cinematic framing (not surveillance framing)"],
  // Real-people / likeness.
  ["celebrity", "an original, fictional character"],
  ["celebrities", "original, fictional characters"],
];

export class PromptValidationError extends Error {}

function isMode(value: string): value is Mode {
  return (VALID_MODES as readonly string[]).includes(value);
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

/** Returns the set of canonical camera-move groups named in the clause. */
function cameraMoveGroups(camera: string): Set<string> {
  const lowered = camera.toLowerCase();
  const found = new Set<string>();
  for (const [group, variants] of CAMERA_MOVE_GROUPS) {
    for (const v of variants) {
      if (new RegExp(`\\b${escapeRegExp(v)}\\b`).test(lowered)) {
        found.add(group);
        break;
      }
    }
  }
  return found;
}

/** Returns a list of 'field: term -> safer alternative' strings for every high-risk trigger found
 *  across the supplied clause fields. */
function scanModeration(fields: Readonly<Record<string, string>>): string[] {
  const hits: string[] = [];
  for (const [field, text] of Object.entries(fields)) {
    if (!text || !text.trim()) continue;
    const lowered = text.toLowerCase();
    for (const [trigger, safer] of MODERATION_TRIGGERS) {
      const pattern = trigger.includes(" ")
        ? new RegExp(escapeRegExp(trigger))
        : new RegExp(`\\b${escapeRegExp(trigger)}`);
      if (pattern.test(lowered)) {
        hits.push(`${field}: '${trigger}' -> ${safer}`);
      }
    }
  }
  return hits;
}

function settingsBlock(duration: number, aspectRatio: string): string[] {
  const note =
    duration >= SWEET_SPOT[0] && duration <= SWEET_SPOT[1]
      ? ""
      : ` (note: ${SWEET_SPOT[0]}-${SWEET_SPOT[1]}s is the stability sweet spot)`;
  return [
    "",
    "[on-screen settings (pick these in the UI; NOT part of the prompt the model reads):",
    `  duration_s=${duration}${note}`,
    `  aspect_ratio=${aspectRatio}`,
    "]",
  ];
}

interface DialogueLine {
  readonly line: string;
}

function parseDialogue(raw: string | undefined): DialogueLine | undefined {
  if (!raw || !raw.trim()) return undefined;
  return { line: raw.trim().replace(/^"+|"+$/g, "") };
}

export interface BuildPromptArgs {
  readonly mode: string;
  readonly camera: string;
  readonly subject: string;
  readonly action: string;
  readonly environment?: string;
  readonly style?: string;
  readonly references?: readonly unknown[] | undefined;
  readonly dialogue?: string | undefined;
  readonly sfx?: string | undefined;
  readonly ambience?: string | undefined;
  readonly music?: string | undefined;
  readonly staging?: boolean;
  readonly duration?: number;
  readonly aspectRatio?: string;
  readonly overrideCamera?: boolean;
  readonly overrideSafety?: boolean;
}

export function buildPrompt(args: BuildPromptArgs): string {
  const {
    mode,
    camera,
    subject,
    action,
    environment = "",
    style = "",
    references,
    dialogue,
    sfx,
    ambience,
    music,
    staging = false,
    duration = 6,
    aspectRatio = "16:9",
    overrideCamera = false,
    overrideSafety = false,
  } = args;

  if (!isMode(mode)) {
    throw new PromptValidationError(
      `mode must be one of ${JSON.stringify([...VALID_MODES].sort())}; got ${JSON.stringify(mode)}`,
    );
  }
  if (!camera || !camera.trim()) {
    throw new PromptValidationError(
      `${mode} requires a camera clause (name one move: push-in, dolly, orbit, tracking, arc, pan, ` +
        "tilt, zoom, crane, static, handheld).",
    );
  }
  if (!subject || !subject.trim()) {
    throw new PromptValidationError(`${mode} requires a subject clause.`);
  }
  if (!action || !action.trim()) {
    throw new PromptValidationError(`${mode} requires an action clause.`);
  }

  // --- camera: one named move per clip ---
  const groups = cameraMoveGroups(camera);
  if (!overrideCamera) {
    if (groups.size === 0) {
      throw new PromptValidationError(
        "camera clause names no known cinematic move (push-in, dolly, orbit, tracking, arc, pan, " +
          "tilt, zoom, crane, static / locked-off, handheld). Rephrase, or pass override_camera=True " +
          "(CLI: --override-camera).",
      );
    }
    if (groups.size > 1) {
      throw new PromptValidationError(
        `camera clause stacks multiple moves (${[...groups].sort().join(", ")}); Grok wants ONE ` +
          "camera move per clip. Split into separate clips (use extend to chain), or pass " +
          "override_camera=True (CLI: --override-camera).",
      );
    }
  }

  if (!isAspectRatio(aspectRatio)) {
    throw new PromptValidationError(
      `aspect_ratio must be one of ${JSON.stringify([...VALID_ASPECT_RATIOS].sort())}; ` +
        `got ${JSON.stringify(aspectRatio)}`,
    );
  }
  if (!(duration >= DURATION_MIN && duration <= DURATION_MAX)) {
    throw new PromptValidationError(
      `duration must be ${DURATION_MIN}..${DURATION_MAX} seconds (${SWEET_SPOT[0]}-${SWEET_SPOT[1]}s ` +
        `is the sweet spot); got ${duration}.`,
    );
  }

  // --- negation guard ---
  if (allNegation(subject, action, camera, environment, style)) {
    throw new PromptValidationError(
      "every clause leans on negation tokens. Rephrase to positive description; Grok is " +
        "positive-direction and has no negative-prompt field.",
    );
  }

  // --- references per mode ---
  const refs = normalizeRefs(references ?? []);
  if (mode === "T2V") {
    if (refs.length > 0) {
      throw new PromptValidationError("T2V takes no reference assets; use I2V, extend, or reference.");
    }
  } else if (mode === "I2V") {
    const imgs = refs.filter((r) => r.kind === "image");
    if (refs.length !== 1 || imgs.length !== 1) {
      throw new PromptValidationError(
        "I2V requires exactly one reference image (the first frame); got " +
          `${refs.length} reference(s). Describe ONLY what changes from that frame.`,
      );
    }
  } else if (mode === "extend") {
    if (refs.length !== 1) {
      throw new PromptValidationError(
        `extend requires exactly one source clip to continue from; got ${refs.length} reference(s).`,
      );
    }
  } else if (mode === "reference") {
    if (!(refs.length >= 1 && refs.length <= REF_CAP)) {
      throw new PromptValidationError(
        `reference mode requires 1..${REF_CAP} style / character images; got ${refs.length}.`,
      );
    }
  }

  // --- sound is REQUIRED ---
  const dlg = parseDialogue(dialogue);
  const haveSound = Boolean(dlg) || [sfx, ambience, music].some((s) => s && s.trim());
  if (!haveSound) {
    throw new PromptValidationError(
      "a Sound section is required. Grok generates native audio in the same pass — supply at least " +
        "one of dialogue, sfx, ambience, or music. Be specific and spatial.",
    );
  }

  // --- moderation-safety scanner (signature) ---
  const scanFields: Record<string, string> = {
    subject,
    action,
    camera,
    environment,
    style,
    sfx: sfx ?? "",
    ambience: ambience ?? "",
    music: music ?? "",
    dialogue: dlg ? dlg.line : "",
  };
  const hits = scanModeration(scanFields);
  if (hits.length > 0 && !overrideSafety) {
    const listed = hits.join("\n  - ");
    throw new PromptValidationError(
      "moderation-safety scanner flagged high-risk language. Grok's video filter predicts motion and " +
        "scores realism + harm; these terms raise the flag risk. Rephrase each, then retry:\n  - " +
        listed +
        "\n(Pass override_safety=True / --override-safety to proceed anyway; you accept a higher flag risk.)",
    );
  }

  // --- assemble: camera -> subject+action -> environment -> style -> Sound (last) ---
  const parts: string[] = [];

  if (mode === "I2V") {
    parts.push(
      "Begin from the attached image and preserve subject placement, face, clothing, and overall " +
        "composition. Describe only what changes.",
    );
  } else if (mode === "extend") {
    parts.push(
      "Continue from the last frame of the attached clip, holding motion, lighting, and character position.",
    );
  } else if (mode === "reference") {
    const bound = refs.map((r, i) => `Reference ${i + 1}: ${r.role}`);
    parts.push("Use the reference images for style and character consistency: " + bound.join("; ") + ".");
  }

  parts.push(`${camera.trim()}.`);
  parts.push(`${subject.trim()} ${action.trim()}`.trim());
  if (staging) {
    parts.push("Every movement is deliberate, theatrical, and safe stagecraft.");
  }
  if (environment && environment.trim()) parts.push(environment.trim());
  if (style && style.trim()) parts.push(style.trim());

  const soundBits: string[] = [];
  if (dlg) soundBits.push(`dialogue: "${dlg.line}"`);
  if (sfx && sfx.trim()) soundBits.push(sfx.trim());
  if (ambience && ambience.trim()) soundBits.push(ambience.trim());
  if (music && music.trim()) soundBits.push("music: " + music.trim());
  parts.push("Sound: " + soundBits.join("; ") + ".");

  const body = parts.join("\n");
  if (body.length > CHAR_LIMIT) {
    throw new PromptValidationError(
      `assembled prompt is ${body.length} characters; over the ${CHAR_LIMIT}-character keep-it-tight ` +
        "limit. Overly long prompts raise Grok's flag risk — trim it.",
    );
  }

  const out = [...parts, ...settingsBlock(duration, aspectRatio)];
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
  camera: string;
  subject: string;
  action: string;
  environment: string;
  style: string;
  reference: string[] | undefined;
  dialogue: string | undefined;
  sfx: string | undefined;
  ambience: string | undefined;
  music: string | undefined;
  staging: boolean;
  duration: number;
  aspectRatio: string;
  overrideCamera: boolean;
  overrideSafety: boolean;
}

const HELP_TEXT = `usage: build-prompt.ts --mode {T2V,I2V,extend,reference} --camera CAMERA
                       --subject SUBJECT --action ACTION [options]

Assemble a Grok Imagine 1.5 video prompt with validation (moderation-aware).

options:
  --mode {T2V,I2V,extend,reference}   required
  --camera CAMERA                      required; front-loaded, name ONE move.
  --subject SUBJECT                    required
  --action ACTION                      required
  --environment ENVIRONMENT
  --style STYLE
  --reference REFERENCE                plain string (image) or JSON {"kind":"image|video","role":"..."};
                                        repeatable. I2V=1 image; extend=1 clip; reference=1..7 images.
  --dialogue DIALOGUE                  spoken line, kept short (quoted for lip-sync).
  --sfx SFX                            foley / spot effects.
  --ambience AMBIENCE                  background soundscape.
  --music MUSIC
  --staging                            add a staged / theatrical / safe framing clause.
  --duration DURATION                  clip length 1..15 s; 5-8 s is the sweet spot. default 6
  --aspect-ratio {16:9,9:16,1:1,4:3,3:4}   default 16:9
  --override-camera                    allow an unlisted or stacked camera move.
  --override-safety                    bypass the moderation-safety scanner.
`;

function parseArgs(argv: readonly string[]): ParsedArgs {
  const references: string[] = [];
  let hasReference = false;
  const values: Record<string, string> = {};
  let staging = false;
  let overrideCamera = false;
  let overrideSafety = false;
  let duration = 6;
  let aspectRatio = "16:9";

  let i = 0;
  while (i < argv.length) {
    const token = argv[i]!;
    if (token === "--help" || token === "-h") {
      process.stdout.write(HELP_TEXT);
      process.exit(0);
    }
    if (token === "--staging") {
      staging = true;
      i += 1;
      continue;
    }
    if (token === "--override-camera") {
      overrideCamera = true;
      i += 1;
      continue;
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
      case "--camera":
        values["camera"] = next();
        break;
      case "--subject":
        values["subject"] = next();
        break;
      case "--action":
        values["action"] = next();
        break;
      case "--environment":
        values["environment"] = next();
        break;
      case "--style":
        values["style"] = next();
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
      case "--duration":
        duration = Number.parseInt(next(), 10);
        break;
      case "--aspect-ratio":
        aspectRatio = next();
        break;
      default:
        throw new PromptValidationError(`unrecognized arguments: ${token}`);
    }
    i += 1;
  }

  for (const required of ["mode", "camera", "subject", "action"]) {
    if (values[required] === undefined) {
      throw new PromptValidationError(`the following arguments are required: --${required}`);
    }
  }

  return {
    mode: values["mode"]!,
    camera: values["camera"]!,
    subject: values["subject"]!,
    action: values["action"]!,
    environment: values["environment"] ?? "",
    style: values["style"] ?? "",
    reference: hasReference ? references : undefined,
    dialogue: values["dialogue"],
    sfx: values["sfx"],
    ambience: values["ambience"],
    music: values["music"],
    staging,
    duration,
    aspectRatio,
    overrideCamera,
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
      camera: args.camera,
      subject: args.subject,
      action: args.action,
      environment: args.environment,
      style: args.style,
      references: refs,
      dialogue: args.dialogue,
      sfx: args.sfx,
      ambience: args.ambience,
      music: args.music,
      staging: args.staging,
      duration: args.duration,
      aspectRatio: args.aspectRatio,
      overrideCamera: args.overrideCamera,
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
