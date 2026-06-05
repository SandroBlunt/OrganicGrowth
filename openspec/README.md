# OpenSpec

OpenSpec is the spec-driven workflow the **engineering** agents (`developer`, `qa`) use to build the
Producer feature code. It is separate from the weekly content loop and is not domain vocabulary —
see the engineering section in `../CLAUDE.md`. Read `project.md` for context and conventions.

Layout:

- `project.md` — project context for spec-driven work (stack, conventions, capabilities, lifecycle).
- `specs/<capability>/spec.md` — durable capability specs (Requirements + Scenarios).
- `changes/<id>/` — one proposed change per slice (`proposal.md`, `tasks.md`, spec deltas, `handoff.md`).
- `changes/archive/<id>/` — changes whose deltas have been folded back into `specs/`.

The `openspec` CLI is added as a **dev dependency** when Slice 1 stands up `package.json`. Once
present: run `openspec validate --strict` to validate a change (must pass before qa handoff), and
`openspec archive <id>` to fold an approved change's spec deltas into `specs/` and move it to
`changes/archive/`.
