// Folders the tests read, found from this file so that a test works at any folder depth.
import { fileURLToPath } from 'node:url';

/** One of the example projects, such as `harvest-moon`. */
export function examplePath(name: string): string {
  return fileURLToPath(new URL(`../../../examples/${name}`, import.meta.url));
}
