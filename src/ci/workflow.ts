/**
 * A pure GitHub Actions workflow-shape parser/checker (issue #199).
 *
 * Nothing here touches the filesystem, `git`, or the clock — it only parses an already-loaded YAML
 * string (via the `yaml` package, the same dependency `src/brand/scaffold-brand.ts` and
 * `src/format/store.test.ts` already use) and answers small structural questions about it. The one
 * real CI file this repository ships (`.github/workflows/ci.yml`) is read from disk and checked
 * against these functions in `workflow.test.ts`, not here — keeping this module a deep, dependency-free
 * unit that is trivial to test against synthetic fixtures.
 *
 * Guards against exactly the kind of silent rot a CI YAML file is prone to: a future edit narrowing the
 * trigger, dropping the full-history checkout `historical-incident.test.ts` depends on, changing the
 * run command away from the whole suite, or introducing a live-credential reference — none of which
 * `npm test` would otherwise notice on its own.
 */
import { parse } from "yaml";

export interface WorkflowStep {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
}

export interface WorkflowJob {
  "runs-on"?: string;
  steps?: WorkflowStep[];
}

export interface ParsedWorkflow {
  on?: unknown;
  jobs?: Record<string, WorkflowJob>;
}

/** Parses a GitHub Actions workflow YAML string. Never throws on a structurally-empty document —
 *  returns `{}` for it, so callers get `undefined`/`false` answers rather than a crash. */
export function parseWorkflow(yamlText: string): ParsedWorkflow {
  const parsed: unknown = parse(yamlText);
  if (parsed === null || typeof parsed !== "object") return {};
  return parsed as ParsedWorkflow;
}

/** The trigger event names declared under `on:`, under any of the three shapes GitHub Actions
 *  accepts: a mapping (`on: { push: {}, pull_request: {} }`), a bare list (`on: [push, pull_request]`),
 *  or a single bare string (`on: push`). Returns `[]` when `on:` is absent. */
function triggerEventNames(workflow: ParsedWorkflow): string[] {
  const on = workflow.on;
  if (on === undefined || on === null) return [];
  if (typeof on === "string") return [on];
  if (Array.isArray(on)) return on.filter((v): v is string => typeof v === "string");
  if (typeof on === "object") return Object.keys(on as Record<string, unknown>);
  return [];
}

/** True only when the workflow triggers on BOTH `push` and `pull_request`. */
export function triggersOnPushAndPullRequest(workflow: ParsedWorkflow): boolean {
  const events = triggerEventNames(workflow);
  return events.includes("push") && events.includes("pull_request");
}

/** Every step across every job, in job-then-step order. */
function allSteps(workflow: ParsedWorkflow): WorkflowStep[] {
  const jobs = workflow.jobs ?? {};
  return Object.values(jobs).flatMap((job) => job.steps ?? []);
}

/** Every step whose `uses:` value starts with the given action name (e.g. `"actions/checkout"`),
 *  regardless of which `@ref` it pins. */
function findStepsUsingAction(workflow: ParsedWorkflow, actionName: string): WorkflowStep[] {
  return allSteps(workflow).filter(
    (step) => typeof step.uses === "string" && step.uses.startsWith(`${actionName}@`),
  );
}

/** The `fetch-depth` value declared on the first `actions/checkout` step's `with:` block, as a number.
 *  `undefined` when there is no such step, or the step declares no `fetch-depth` (the action's own
 *  shallow-clone default in that case). */
export function checkoutFetchDepth(workflow: ParsedWorkflow): number | undefined {
  const step = findStepsUsingAction(workflow, "actions/checkout")[0];
  const raw = step?.with?.["fetch-depth"];
  if (raw === undefined) return undefined;
  return Number(raw);
}

/** The `node-version` value declared on the first `actions/setup-node` step's `with:` block.
 *  `undefined` when there is no such step or it declares no `node-version`. */
export function setupNodeVersion(workflow: ParsedWorkflow): string | undefined {
  const step = findStepsUsingAction(workflow, "actions/setup-node")[0];
  const raw = step?.with?.["node-version"];
  return raw === undefined ? undefined : String(raw);
}

/** Every `run:` step's command, across every job, in order. */
function runCommands(workflow: ParsedWorkflow): string[] {
  return allSteps(workflow)
    .map((step) => step.run)
    .filter((run): run is string => typeof run === "string");
}

/** True only when some step's `run:` command, trimmed, is EXACTLY `npm test` — never a narrower
 *  subset (`npm run test:docs`), a differently-invoked equivalent (`npm run test`), or an
 *  additionally-flagged variant (`npm test -- --extra`). */
export function runsExactNpmTest(workflow: ParsedWorkflow): boolean {
  return runCommands(workflow).some((command) => command.trim() === "npm test");
}

/** Credential-shaped name fragments this build must stay hermetic against (ADR-0005): the four live
 *  external services the build/CI loop never calls. Checked case-insensitively, and independently of
 *  a `secrets.` reference — an env var merely NAMED after one of these is enough to flag, since a
 *  future value could be filled in from anywhere (a hardcoded literal, a different secret store). */
const LIVE_CREDENTIAL_NAME_PATTERNS = [/secrets\./i, /MAGNIFIC/i, /ZOHO/i, /APIFY/i, /AWS_/i];

/** True when the raw workflow YAML text references a GitHub Actions secret (`secrets.`) or a
 *  Magnific/Zoho/Apify/AWS-shaped credential name anywhere — in a `env:` value, a `with:` value, or a
 *  `run:` command string. Operates on the raw text (not the parsed structure) so it catches a
 *  reference wherever it appears, including inside a `run:` command's own shell text. */
export function referencesLiveCredentials(rawYamlText: string): boolean {
  return LIVE_CREDENTIAL_NAME_PATTERNS.some((pattern) => pattern.test(rawYamlText));
}
