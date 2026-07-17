# The Recipe / Format architecture — the four owners, drawn

The canonical picture of how **Brand · Format · Recipe · Producer** relate, and how one run stays
auditable. Decided in the 2026-07 recipe-architecture wayfinding (map #70); see ADR-0015, ADR-0016,
ADR-0017, ADR-0018. Terms are defined in [`CONTEXT.md`](../../CONTEXT.md). **Decided, build pending.**

## The four owners

| Owner | Holds | Scope |
|---|---|---|
| **Recipe** (`src/recipe/registry.ts`) | gates · Production-Spec shape · which canvas · the canvas's typed inputs (media slots + prompt node) · phase contracts · its producer **Skill** | global / in-repo |
| **Format** (`formats/<f>.yaml` + a referenced **baseline-prompt** doc) | voice · trend sources · the **look** (baseline prompt: definitions + a core example + samples) | Brand × Format |
| **Brand** (`brand-profile.yaml` + `assets/`) | banned words · watermark @handle · **Brand Assets** (image/video/audio) | per Brand |
| **Producer** (thin agent + per-Recipe Skill) | authors the prompt to the phase contract · binds media into the slots · drives the canvas attended, pausing only at declared gates | the worker |

## Ownership & cardinality

```mermaid
flowchart TD
  subgraph perBrand["Per Brand — data/brands/&lt;slug&gt;/"]
    Brand["Brand<br/>brand-profile.yaml + assets/<br/>banned words · watermark · Brand Assets"]
    Format["Format<br/>formats/&lt;f&gt;.yaml + baseline-prompt doc<br/>voice · sources · the look"]
    Idea["Idea / Brief"]
    Asset["Asset"]
    Post["Post"]
  end
  subgraph global["Global — in-repo code"]
    Recipe["Recipe (registry.ts)<br/>gates · spec shape<br/>canvas + typed inputs<br/>phase contracts · Skill"]
    Producer["Producer (thin agent)<br/>runs the Recipe's Skill,<br/>binds media, drives the canvas"]
  end
  Brand -->|"1..N"| Format
  Format -->|"holds many"| Idea
  Idea -->|"Operator picks 1..N Recipes"| Recipe
  Recipe -->|"one Asset per Recipe"| Asset
  Asset -->|"human publishes — 0..1"| Post
  Format -.->|"baseline prompt (the look)"| Producer
  Brand -.->|"Brand Assets + hard rules"| Producer
  Recipe ==>|"drives"| Producer
  Producer ==>|"produces"| Asset
```

## One run — phases, each with a contract the Producer self-audits (and QA re-runs)

The Recipe's canvas takes **two typed inputs**: a **prompt node** the Producer authors, and **media slots**
filled by Brand Assets (reused) or idea-picks (per Idea). Each phase carries a checklist contract; the
Producer never advances past a failing one (`◇` = the phase's contract).

```mermaid
flowchart TD
  Rules["Brand hard rules"] --> Skill
  Baseline["Format baseline prompt<br/>(document)"] --> Skill
  Brief["Idea brief"] --> Skill["Recipe Skill<br/>(the interpreter)"]

  Skill --> A["1 · Author prompt<br/>◇ on-shape · grounded · no banned words"]
  A --> B["2 · Bind media slots<br/>Brand Assets + idea-picks, by named map<br/>◇ every required slot filled, else STOP"]
  B --> G["3 · Gate — if the Recipe declares one<br/>◇ N inspectable candidates"]
  G --> R["4 · Render<br/>drive the canvas: prompt node + media slots<br/>◇ expected media produced"]
  R --> C["5 · Copy — composed out of canvas<br/>◇ length/emoji · required CTA+hashtags · no banned words"]
  C --> S["6 · Save Asset<br/>◇ ledger record complete"]

  BrandAsset["Brand Asset<br/>e.g. Brand_Logo"] -.->|"reused every run"| B
  Pick["idea-pick<br/>e.g. Selected Character"] -.->|"from a gate"| B
```

**Legend.** Aspect ratio and model (3:4, Nano Banana 2 for the news carousel) are the canvas's own
settings, not clauses in the prompt. The carousel declares **zero** gates (it runs straight through); the
character Recipe declares one (the **Cast** pick).
