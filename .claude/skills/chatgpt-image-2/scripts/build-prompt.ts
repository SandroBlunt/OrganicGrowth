#!/usr/bin/env -S npx tsx
/**
 * Assemble and validate a ChatGPT Image 2 (gpt-image-2) prompt.
 *
 * Ported from build-prompt.py (issue #255) — same clause skeleton, same validation rules, same CLI
 * shape and exit codes; only the language changed.
 *
 * Usage:
 *   npx tsx scripts/build-prompt.ts --mode T2I \
 *       --subject "..." --action "..." --setting "..." \
 *       --style "..." --camera "..." --aspect-ratio 3:2
 *
 * For MR mode, pass --reference one or more times (2..4 references):
 *   npx tsx scripts/build-prompt.ts --mode MR --subject "..." \
 *       --action "..." --setting "..." --style "..." --camera "..." \
 *       --reference "subject's face" --reference "outfit"
 *
 * Exits non-zero with a diagnostic on validation failure.
 */

const VALID_MODES = ["T2I", "I2I", "MR"] as const;
type Mode = (typeof VALID_MODES)[number];

const VALID_ASPECT_RATIOS = ["1:1", "3:2", "2:3", "16:9", "9:16", "4:5"] as const;
type AspectRatio = (typeof VALID_ASPECT_RATIOS)[number];

const NEGATION_TOKENS = [" no ", " not ", " without ", " avoid ", " never "] as const;
const MR_MIN_REFS = 2;
const MR_MAX_REFS = 4;

export class PromptValidationError extends Error {}

function isMode(value: string): value is Mode {
  return (VALID_MODES as readonly string[]).includes(value);
}

function isAspectRatio(value: string): value is AspectRatio {
  return (VALID_ASPECT_RATIOS as readonly string[]).includes(value);
}

/** Returns true when the clause contains any negation token. */
function hasNegation(text: string): boolean {
  if (!text) return false;
  const padded = " " + text.toLowerCase().trim() + " ";
  return NEGATION_TOKENS.some((tok) => padded.includes(tok));
}

/**
 * Returns true when every non-empty clause contains a negation token.
 *
 * Heuristic for "negation-dominant": every clause leans on no/not/without/avoid as control. A single
 * negation in one clause is fine; negation across all five clauses is the failure mode this guards.
 */
function allNegation(...clauses: string[]): boolean {
  const populated = clauses.filter((c) => c && c.trim());
  if (populated.length === 0) return false;
  return populated.every((c) => hasNegation(c));
}

export interface BuildPromptArgs {
  readonly mode: string;
  readonly subject: string;
  readonly action: string;
  readonly setting: string;
  readonly style: string;
  readonly camera: string;
  readonly references: readonly string[] | undefined;
  readonly aspectRatio: string;
}

/** Assemble a validated prompt string. Throws PromptValidationError. */
export function buildPrompt(args: BuildPromptArgs): string {
  const { mode, subject, action, setting, style, camera, references, aspectRatio } = args;

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

  const clauses: Record<string, string> = { subject, action, setting, style, camera };
  const missing = Object.entries(clauses)
    .filter(([, v]) => !v || !v.trim())
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new PromptValidationError(
      `missing required clause(s): ${JSON.stringify(missing)}. ` +
        "All five clauses (subject, action, setting, style, camera) are mandatory.",
    );
  }

  if (allNegation(...Object.values(clauses))) {
    throw new PromptValidationError(
      "prompt is dominated by negation tokens (no/not/without/avoid). " +
        "Rephrase to positive description; ChatGPT Image 2 does not honour negation reliably in prose.",
    );
  }

  if (mode === "I2I") {
    const refs = references ?? [];
    if (refs.length !== 1) {
      throw new PromptValidationError(`I2I mode requires exactly one reference; got ${refs.length}.`);
    }
  }

  if (mode === "MR") {
    const refs = references ?? [];
    if (!(refs.length >= MR_MIN_REFS && refs.length <= MR_MAX_REFS)) {
      throw new PromptValidationError(
        `MR mode requires ${MR_MIN_REFS}..${MR_MAX_REFS} references; got ${refs.length}. ` +
          "The practical cap is 4 for gpt-image-2.",
      );
    }
  }

  const parts: string[] = [];
  if (mode === "MR") {
    parts.push("References:");
    (references ?? []).forEach((role, i) => {
      parts.push(`  ${i + 1}. ${role}`);
    });
    parts.push("");
  }

  parts.push(subject.trim());
  parts.push(action.trim());
  parts.push(setting.trim());
  parts.push(style.trim());
  parts.push(camera.trim());
  parts.push("");
  parts.push(`[aspect_ratio=${aspectRatio}]`);

  return parts.join("\n");
}

interface ParsedArgs {
  mode: string;
  subject: string;
  action: string;
  setting: string;
  style: string;
  camera: string;
  reference: string[] | undefined;
  aspectRatio: string;
}

const HELP_TEXT = `usage: build-prompt.ts --mode {T2I,I2I,MR} --subject SUBJECT --action ACTION
                       --setting SETTING --style STYLE --camera CAMERA
                       [--reference REFERENCE] [--aspect-ratio {1:1,2:3,3:2,4:5,16:9,9:16}]

Assemble a gpt-image-2 prompt with validation.

options:
  --mode {T2I,I2I,MR}          required
  --subject SUBJECT            required
  --action ACTION               required
  --setting SETTING             required
  --style STYLE                 required
  --camera CAMERA                required
  --reference REFERENCE         repeatable; 1 for I2I, 2..4 for MR
  --aspect-ratio {1:1,2:3,3:2,4:5,16:9,9:16}   default 1:1
`;

function parseArgs(argv: readonly string[]): ParsedArgs {
  const references: string[] = [];
  let hasReference = false;
  const values: Record<string, string> = {};
  let aspectRatio = "1:1";

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
      if (v === undefined) {
        throw new PromptValidationError(`argument ${flag}: expected one argument`);
      }
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

  for (const required of ["mode", "subject", "action", "setting", "camera", "style"]) {
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
    reference: hasReference ? references : undefined,
    aspectRatio,
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
    const prompt = buildPrompt({
      mode: args.mode,
      subject: args.subject,
      action: args.action,
      setting: args.setting,
      style: args.style,
      camera: args.camera,
      references: args.reference,
      aspectRatio: args.aspectRatio,
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
