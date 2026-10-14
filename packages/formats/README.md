# @trayful/formats

Schemas, loader and validator for Trayful's files: the project manifest, libraries, inventories, setups and saved tables.

- `src/schemas.ts`: Zod schemas, the single source of truth, kept in `src/schemas/` by file kind. Their descriptions become the [format reference](../../docs/reference/README.md).
- `src/load.ts`: `loadProject(dir)` reads a project folder, validates every file, checks cross-references (types, fields, decks, snap spots, image files) and expands the inventory into components with stable ids. It returns diagnostics with file, line and column instead of throwing. The checks it runs live beside it: `type-checks.ts` for component types, `inventory.ts` for inventory rows and component ids, `setup-checks.ts` for setup steps.
- `schema/`: generated JSON Schemas for editor autocomplete. Do not edit; run `pnpm generate` from the repo root.

```ts
import { formatDiagnostic, loadProject } from '@trayful/formats';

const { project, diagnostics } = await loadProject('examples/harvest-moon');
diagnostics.forEach((d) => console.log(formatDiagnostic(d)));
```

Test with `pnpm vitest run packages/formats` from the repo root.
