# @trayful/formats

Schemas, loader and validator for Trayful's files: the project manifest, the assets file, libraries, inventories, setups and saved tables.

The code in `src/` is in four folders, each importing only the ones before it:

- `src/schemas/`: Zod schemas, the single source of truth, one file per file kind and `index.ts` listing them all. Their descriptions become the [format reference](../../docs/reference/README.md).
- `src/components/`: what a component is. `component.ts` reads what it does from its properties (`sidesOf`, `stacksWith`, `rotationStep`, `dropAreas`, `valuesOf`…), so the engine, the app and the loader ask the same way; `drawing.ts` (`drawingOf`) works out how one side looks, with colours, templates, images and tiles resolved; `type-checks.ts` checks a component for problems its schema cannot see.
- `src/project/`: what a loaded project holds (`resolved.ts`), inventory rows and component ids (`inventory.ts`), setup step checks (`setup-checks.ts`) and starting points for new components (`presets.ts`).
- `src/loading/` (Node only): `load.ts` has `loadProject(dir)`, which reads a project folder, validates every file, checks cross-references (components, fields, decks, drop areas, assets and image files) and expands the inventory into components with stable ids. It returns diagnostics with file, line and column instead of throwing. `upgrade.ts` and `schemas/legacy.ts` read projects in the first file format, `trayful/1`, and convert them to the current one in memory, with a warning; `trayful migrate` uses the same conversion to rewrite the files.
- `src/browser.ts` is the entry for the browser: the parts that run anywhere, never anything in `loading/`.
- `schema/`: generated JSON Schemas for editor autocomplete. Do not edit; run `pnpm generate` from the repo root.

```ts
import { formatDiagnostic, loadProject } from '@trayful/formats';

const { project, diagnostics } = await loadProject('examples/harvest-moon');
diagnostics.forEach((d) => console.log(formatDiagnostic(d)));
```

Test with `pnpm vitest run packages/formats` from the repo root. The tests live in `test/`, in the same folders as the code they test in `src/`.
