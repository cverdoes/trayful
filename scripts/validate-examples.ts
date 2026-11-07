/** Validates every project under examples/. Used by CI so the samples (and the docs that quote them) stay correct. */
import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatDiagnostic, loadProject } from '@trayful/formats';

const examples = fileURLToPath(new URL('../examples', import.meta.url));
let failed = false;
for (const entry of await readdir(examples, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  // An example engine is a Node project that plays a game, not a game of its own.
  const engine = await access(path.join(examples, entry.name, 'package.json')).then(
    () => true,
    () => false,
  );
  if (engine) continue;
  const { project, diagnostics } = await loadProject(path.join(examples, entry.name));
  for (const d of diagnostics) console.log(`examples/${entry.name}/${formatDiagnostic(d)}`);
  if (project) console.log(`✓ examples/${entry.name}: ${project.components.length} components`);
  else failed = true;
}
process.exit(failed ? 1 : 0);
