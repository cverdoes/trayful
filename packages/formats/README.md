# @trayful/formats

Schemas, loader and validator for Trayful's files: the project manifest, the assets file, libraries, inventories, setups and saved tables.

- `src/schemas.ts`: Zod schemas, the single source of truth, kept in `src/schemas/` by file kind. Their descriptions become the [format reference](../../docs/reference/README.md).
- `src/load.ts`: `loadProject(dir)` reads a project folder, validates every file, checks cross-references (components, fields, decks, drop areas, assets and image files) and expands the inventory into components with stable ids. It returns diagnostics with file, line and column instead of throwing. The checks it runs live beside it: `library-loader.ts` and `type-checks.ts` for components, `inventory.ts` for inventory rows and component ids, `setup-checks.ts` for setup steps.
- `src/component.ts`: what a component does, read from its properties (`sidesOf`, `stacksWith`, `rotationStep`, `dropAreas`, `valuesOf`…), so the engine, the app and the loader ask the same way. `src/drawing.ts`: `drawingOf` works out how one side of a component looks, with colours, templates, images and tiles resolved.
- `src/upgrade.ts` and `src/schemas/legacy.ts`: projects in the first file format, `trayful/1`, are read with the legacy schemas and converted to the current one in memory, with a warning. `trayful migrate` uses the same conversion to rewrite the files.
- `schema/`: generated JSON Schemas for editor autocomplete. Do not edit; run `pnpm generate` from the repo root.

```ts
import { formatDiagnostic, loadProject } from '@trayful/formats';

const { project, diagnostics } = await loadProject('examples/harvest-moon');
diagnostics.forEach((d) => console.log(formatDiagnostic(d)));
```

Test with `pnpm vitest run packages/formats` from the repo root.
