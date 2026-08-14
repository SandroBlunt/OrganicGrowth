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
exist exactly once in the repository. If you need a fully standalone
copy of this skill (no other repo content available), use the
`portable/image/chatgpt-image-2/` variant, which duplicates the
shared references into its own `references/` folder.
