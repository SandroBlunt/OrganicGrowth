# References — grok-imagine-1-5 (code variant)

Local references in this folder:

- `translation-notes.md` — model-specific quirks for Grok Imagine 1.5 video
  (moderation-aware prompting, native audio, the four modes, one move per
  clip, no negative prompt, the front-end set, the 5-8 s sweet spot).
- `official-guidelines.md` — distilled summary of the Grok Imagine 1.5
  prompt guide and the moderation tactics, with source URLs and fetch date.

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
whole folder (`.claude/skills/grok-imagine-1-5/`) together with the
shared `.claude/references/` folder into the destination, in the same
relative layout (a `.claude/` root holding both
`skills/grok-imagine-1-5/` and `references/`) — otherwise the
citations above dangle. This skill's own `metadata.yaml` records the
dependency (`shared_references`) and the install decision
(`install: copy-alongside`); vendoring a private copy into every skill
was considered and rejected — see `docs/catalogue-manifest-format.md`.
