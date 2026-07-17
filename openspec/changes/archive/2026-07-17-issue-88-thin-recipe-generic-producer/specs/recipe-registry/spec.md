## ADDED Requirements

### Requirement: A Recipe's on-canvas node names may declare an optional watermark parameter node (QA-1)

`RecipeSpaceNodes` (`src/recipe/registry.ts`) SHALL carry an OPTIONAL `watermarkNode?: string` field —
the name of a canvas text node the Brand's watermark `@handle` is set onto before a Recipe's final
render (`src/space-driver/driver.ts`'s `setWatermarkHandle`). This field is present ONLY for a Recipe
whose canvas actually has such a node — it is a GENERIC, per-Recipe declaration, never hard-coded
procedure. The seeded *Character Explainer with Cast* Recipe SHALL set it to the real, captured
`"Watermark instructions"` node name (`src/space-driver/driver.ts`'s `WATERMARK_NODE_NAME`); the
seeded *News Carousel* Recipe SHALL leave it absent (its canvas has no watermark parameter node).

#### Scenario: The wired Character Explainer Recipe declares its real, captured watermarkNode

- **GIVEN** `getRecipe("character-explainer-with-cast")`
- **WHEN** `recipe.space.nodes.watermarkNode` is inspected
- **THEN** it equals `"Watermark instructions"` (`WATERMARK_NODE_NAME`, `src/space-driver/driver.ts`)

#### Scenario: The News Carousel Recipe declares NO watermarkNode

- **GIVEN** `getRecipe("news-carousel")`
- **WHEN** `recipe.space.nodes.watermarkNode` is inspected
- **THEN** it is `undefined` — this Recipe's canvas has no watermark parameter node, and the thin
  Producer simply skips the watermark step for it
