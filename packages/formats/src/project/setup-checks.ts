// Checks that a setup's steps refer to components, decks and drop areas that exist.
import type { ComponentSpec, ResolvedType } from './resolved.js';
import type { SetupStep, SnapTarget } from './schemas.js';
import type { Problem } from './diagnostics.js';

/** What setups may refer to, as loaded from the libraries and the inventory. Read only. */
export interface Known {
  readonly types: Readonly<Record<string, ResolvedType>>;
  readonly components: readonly ComponentSpec[];
  readonly decks: Readonly<Record<string, readonly string[]>>;
  /** Types and decks that failed validation. References to them are not reported again. */
  readonly brokenTypes: ReadonlySet<string>;
  readonly brokenDecks: ReadonlySet<string>;
}

/** Problems with one setup step, at paths inside the step. */
export function stepProblems(step: SetupStep, known: Known): Problem[] {
  if ('place' in step) return placeProblems(step, known);
  if ('deal' in step) {
    return [
      ...deckProblems(step.deal.from, ['deal', 'from'], known),
      ...targetProblems(step.deal.to, ['deal', 'to'], known),
    ];
  }
  return deckProblems(step.shuffle, ['shuffle'], known);
}

function placeProblems(step: Extract<SetupStep, { place: unknown }>, known: Known): Problem[] {
  const ref = step.place;
  const problems: Problem[] = [];
  if (typeof ref === 'string') {
    const exists =
      known.types[ref] !== undefined ||
      known.brokenTypes.has(ref) ||
      known.components.some((c) => c.id === ref);
    if (!exists) {
      problems.push({
        path: ['place'],
        message: `"${ref}" is not a component in the library or the inventory.`,
      });
    }
    if (step.shuffle) problems.push({ path: ['shuffle'], message: 'Only a deck can be shuffled.' });
  } else {
    problems.push(...deckProblems(ref.deck, ['place', 'deck'], known));
  }
  return [...problems, ...targetProblems(step.at, ['at'], known)];
}

function deckProblems(name: string, path: (string | number)[], known: Known): Problem[] {
  if (known.decks[name] || known.brokenDecks.has(name)) return [];
  return [{ path, message: `Unknown deck "${name}".` }];
}

/** A position needs no checking; a snap target reference must exist. */
function targetProblems(
  target: string | [number, number],
  path: (string | number)[],
  known: Known,
): Problem[] {
  if (typeof target !== 'string') return [];
  const message = targetProblem(target, known);
  return message ? [{ path, message }] : [];
}

/** Checks a `piece/area[/index]` reference, where piece is one in the inventory, or a library component with one in it. */
function targetProblem(ref: string, known: Known): string | undefined {
  const [owner, targetId, index, ...rest] = ref.split('/');
  if (!owner || !targetId || rest.length > 0) {
    return `"${ref}" should look like "board/target" or "board/target/index".`;
  }
  const component = known.components.find((c) => c.id === owner);
  const ofType = known.components.filter((c) => c.type === owner);
  const typeId = component?.type ?? (ofType.length > 0 ? owner : undefined);
  if (!typeId) {
    if (known.brokenTypes.has(owner)) return undefined;
    return `"${owner}" is not in the inventory.`;
  }
  if (!component && ofType.length > 1) {
    return `There are ${ofType.length} "${owner}" components; use the id of one, such as "${ofType[0]!.id}".`;
  }
  const target = known.types[typeId]?.container?.find((t) => t.id === targetId);
  if (!target) return `"${typeId}" has no drop area "${targetId}".`;
  return index === undefined ? undefined : spotProblem(target, index);
}

function spotProblem(target: SnapTarget, index: string): string | undefined {
  const spots = snapSpotCount(target);
  const i = Number(index);
  if (spots === undefined)
    return `Drop area "${target.id}" is a free area and has no numbered spots.`;
  if (!Number.isInteger(i) || i < 0 || i >= spots) {
    return `Spot ${index} is out of range; "${target.id}" has spots 0 to ${spots - 1}.`;
  }
  return undefined;
}

/** Number of numbered spots in a drop area, or undefined for free areas. */
export function snapSpotCount(target: SnapTarget): number | undefined {
  if (target.grid) return target.grid.cols * target.grid.rows;
  if (target.points) return target.points.length;
  return undefined;
}
