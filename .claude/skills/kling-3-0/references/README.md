# References — kling-3-0 (code variant)

Local references in this folder:

- `translation-notes.md` — model-specific quirks for Kling 3.0.
- `official-guidelines.md` — distilled summary of the Kling 3.0 release
  notes with source URL and fetch date.

Shared references reached via relative path:

```
../../../references/
```

Specifically:

- `../../../references/cinematography.md`
- `../../../references/lighting.md`
- `../../../references/photography.md`
- `../../../references/prompt-discipline.md`
- `../../../references/production-design.md`

To install this skill outside this repository, copy this skill's
whole folder (`.claude/skills/kling-3-0/`) together with the shared
`.claude/references/` folder into the destination, in the same
relative layout (a `.claude/` root holding both `skills/kling-3-0/`
and `references/`) — otherwise the citations above dangle. This
skill's own `metadata.yaml` records the dependency
(`shared_references`) and the install decision
(`install: copy-alongside`); vendoring a private copy into every skill
was considered and rejected — see `docs/catalogue-manifest-format.md`.
