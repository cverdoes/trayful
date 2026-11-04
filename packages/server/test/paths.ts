// Folders the tests read, found from this file so that a test works at any folder depth.
import { fileURLToPath } from 'node:url';

/** The repository's `examples/` folder. */
export const examples = fileURLToPath(new URL('../../../examples', import.meta.url));

/** One of the example projects, such as `harvest-moon`. */
export function examplePath(name: string): string {
  return fileURLToPath(new URL(`../../../examples/${name}`, import.meta.url));
}

/** The Harvest Moon example as it was written in the first file format. */
export const legacyHarvestMoon = fileURLToPath(
  new URL('../../formats/test/fixtures/legacy-harvest-moon', import.meta.url),
);
