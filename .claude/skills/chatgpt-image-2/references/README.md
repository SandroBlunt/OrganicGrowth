# References — chatgpt-image-2 (code variant)

Local references in this folder:

- `translation-notes.md` — model-specific quirks for gpt-image-2.
- `official-guidelines.md` — distilled summary of OpenAI's official guide
  with source URLs and fetch date.

Shared references (cinematography, lighting, photography, production
design, prompt discipline) are stored once at the repository root and
reached via relative path:

```
../../../references/
```

Specifically:

- `../../../references/cinematography.md`
- `../../../references/lighting.md`
- `../../../references/photography.md`
- `../../../references/prompt-discipline.md`
- `../../../references/production-design.md`

This layout keeps the `code/` variant compact: the five shared files
exist exactly once in the repository. To install this skill outside
this repository, copy this skill's whole folder
(`.claude/skills/chatgpt-image-2/`) together with the shared
`.claude/references/` folder into the destination, in the same
relative layout (a `.claude/` root holding both `skills/chatgpt-image-2/`
and `references/`) — otherwise the citations above dangle. This
skill's own `metadata.yaml` records the dependency
(`shared_references`) and the install decision
(`install: copy-alongside`); vendoring a private copy into every skill
was considered and rejected — see `docs/catalogue-manifest-format.md`.
