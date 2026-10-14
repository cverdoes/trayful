// Checks that a setup's steps refer to types, components, decks and snap spots that exist.
import type { ComponentSpec, ResolvedType } from './resolved.js';
import type { SetupStep, SnapTarget } from './schemas.js';
import type { Problem } from './diagnostics.js';

/** What setups can refer to, as loaded from the libraries and the inventory. */
export interface Loaded {
  types: Record<string, ResolvedType>;
  components: ComponentSpec[];
  decks: Record<string, string[]>;
  /** Types and decks that failed validation. References to them are not reported again. */
  brokenTypes: Set<string>;
  brokenDecks: Set<string>;
}

/** Problems with one setup step, at paths inside the step. */
export function stepProblems(step: SetupStep, loaded: Loaded): Problem[] {
  if ('place' in step) return placeProblems(step, loaded);
  if ('deal' in step) {
    return [
      ...deckProblems(step.deal.from, ['deal', 'from'], loaded),
      ...targetProblems(step.deal.to, ['deal', 'to'], loaded),
    ];
  }
  return deckProblems(step.shuffle, ['shuffle'], loaded);
}

function placeProblems(step: Extract<SetupStep, { place: unknown }>, loaded: Loaded): Problem[] {
  const ref = step.place;
  const problems: Problem[] = [];
  if (typeof ref === 'string') {
    const known =
      loaded.types[ref] !== undefined ||
      loaded.brokenTypes.has(ref) ||
      loaded.components.some((c) => c.id === ref);
    if (!known) {
      problems.push({
        path: ['place'],
        message: `"${ref}" is neither a type id nor a component id.`,
      });
    }
    if (step.shuffle) problems.push({ path: ['shuffle'], message: 'Only a deck can be shuffled.' });
  } else {
    problems.push(...deckProblems(ref.deck, ['place', 'deck'], loaded));
  }
  return [...problems, ...targetProblems(step.at, ['at'], loaded)];
}

function deckProblems(name: string, path: (string | number)[], loaded: Loaded): Problem[] {
  if (loaded.decks[name] || loaded.brokenDecks.has(name)) return [];
  return [{ path, message: `Unknown deck "${name}".` }];
}

/** A position needs no checking; a snap target reference must exist. */
function targetProblems(
  target: string | [number, number],
  path: (string | number)[],
  loaded: Loaded,
): Problem[] {
  if (typeof target !== 'string') return [];
  const message = targetProblem(target, loaded);
  return message ? [{ path, message }] : [];
}

/** Checks a `piece/target[/index]` reference, where piece is a component id or a type with one component. */
function targetProblem(ref: string, loaded: Loaded): string | undefined {
  const [owner, targetId, index, ...rest] = ref.split('/');
  if (!owner || !targetId || rest.length > 0) {
    return `"${ref}" should look like "board/target" or "board/target/index".`;
  }
  const component = loaded.components.find((c) => c.id === owner);
  const ofType = loaded.components.filter((c) => c.type === owner);
  const typeId = component?.type ?? (ofType.length > 0 ? owner : undefined);
  if (!typeId) {
    if (loaded.brokenTypes.has(owner)) return undefined;
    return `"${owner}" is not a component id or a type in the inventory.`;
  }
  if (!component && ofType.length > 1) {
    return `There are ${ofType.length} components of type "${owner}"; use a component id such as "${ofType[0]!.id}".`;
  }
  const target = loaded.types[typeId]?.snap?.find((t) => t.id === targetId);
  if (!target) return `"${typeId}" has no snap target "${targetId}".`;
  return index === undefined ? undefined : spotProblem(target, index);
}

function spotProblem(target: SnapTarget, index: string): string | undefined {
  const spots = snapSpotCount(target);
  const i = Number(index);
  if (spots === undefined)
    return `Snap target "${target.id}" is an area and has no numbered spots.`;
  if (!Number.isInteger(i) || i < 0 || i >= spots) {
    return `Spot ${index} is out of range; "${target.id}" has spots 0 to ${spots - 1}.`;
  }
  return undefined;
}

/** Number of numbered spots in a snap target, or undefined for free areas. */
export function snapSpotCount(target: SnapTarget): number | undefined {
  if (target.grid) return target.grid.cols * target.grid.rows;
  if (target.points) return target.points.length;
  return undefined;
}
