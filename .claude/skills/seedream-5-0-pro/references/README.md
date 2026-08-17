# References — seedream-5-0-pro (code variant)

Local references in this folder:

- `translation-notes.md` — model-specific quirks for Seedream 5.0 Pro.
- `official-guidelines.md` — distilled summary of the vendor sources with
  source URLs, fetch date, and known uncertainties.

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
whole folder (`.claude/skills/seedream-5-0-pro/`) together with the
shared `.claude/references/` folder into the destination, in the same
relative layout (a `.claude/` root holding both
`skills/seedream-5-0-pro/` and `references/`) — otherwise the
citations above dangle. This skill's own `metadata.yaml` records the
dependency (`shared_references`) and the install decision
(`install: copy-alongside`); vendoring a private copy into every skill
was considered and rejected — see `docs/catalogue-manifest-format.md`.
