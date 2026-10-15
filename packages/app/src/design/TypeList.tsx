import { PRIMITIVES, type ComponentType } from '@trayful/formats/browser';
import { useStore } from '../store';
import { duplicateType, openType, removeDraftType, settle, useDesign } from './store';

const GROUP_NAMES: Record<(typeof PRIMITIVES)[number], string> = {
  card: 'Cards',
  board: 'Boards',
  tile: 'Tiles',
  token: 'Tokens',
  meeple: 'Meeples',
  die: 'Dice',
  counter: 'Counters',
  zone: 'Zones',
};

/** The project's types grouped by primitive, with how many of each are in the box. */
export function TypeList() {
  const types = useStore((s) => s.view?.types ?? {});
  const draft = useDesign((s) => s.draft);
  const components = useDesign((s) => s.components);
  const count = (id: string) => components.filter((c) => c.type === id).length;
  const groups = PRIMITIVES.map((base) => ({
    base,
    types: Object.values(types).filter((t) => t.base === base),
  })).filter((g) => g.types.length);
  return (
    <nav className="design-types" aria-label="Types">
      <h3>Types</h3>
      {groups.map((group) => (
        <div key={group.base}>
          <h4>{GROUP_NAMES[group.base]}</h4>
          <ul>
            {group.types.map((type) => (
              <li key={type.id}>
                <button
                  type="button"
                  className={type.id === draft?.id ? 'chosen' : undefined}
                  aria-current={type.id === draft?.id}
                  onClick={() => void switchTo(type)}
                >
                  {type.name ?? type.id} <span className="muted">×{count(type.id)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="design-type-actions">
        <button type="button" onClick={() => useDesign.setState({ newTypeOpen: true })}>
          + New type
        </button>
        <button type="button" disabled={!draft} onClick={() => void duplicateType()}>
          Duplicate
        </button>
        <button type="button" disabled={!draft} onClick={confirmRemove}>
          Delete
        </button>
      </div>
    </nav>
  );
}

/** Shows another type, saving the one shown first, or asking before dropping its changes. */
async function switchTo(type: ComponentType): Promise<void> {
  const { draft } = useDesign.getState();
  if (type.id === draft?.id) return;
  const kept = await settle();
  if (!kept && !window.confirm(`The changes to "${draft?.id}" are not saved. Drop them?`)) {
    return;
  }
  openType(type);
}

function confirmRemove() {
  const { draft } = useDesign.getState();
  if (draft && window.confirm(`Delete the type "${draft.id}" from the library?`)) {
    void removeDraftType();
  }
}
