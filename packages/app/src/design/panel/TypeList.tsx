import { REPRESENTATIONS, type ComponentType } from '@trayful/formats/browser';
import { useStore } from '../../store';
import { Badge } from '../../ui/Badge';
import { Icon } from '../../ui/Icon';
import { Menu } from '../../ui/Menu';
import { duplicateType, openType, removeDraftType, settle, useDesign } from '../store';

const GROUP_NAMES: Record<(typeof REPRESENTATIONS)[number], string> = {
  piece: 'Pieces',
  zone: 'Zones',
  die: 'Dice',
  counter: 'Counters',
  stamp: 'Stamps',
};

/** The project's components grouped by what they are, with how many of each are in the box. */
export function TypeList() {
  const types = useStore((s) => s.view?.types ?? {});
  const draft = useDesign((s) => s.draft);
  const components = useDesign((s) => s.components);
  const count = (id: string) => components.filter((c) => c.type === id).length;
  const groups = REPRESENTATIONS.map((is) => ({
    is,
    types: Object.values(types).filter((t) => t.is === is),
  })).filter((g) => g.types.length);
  return (
    <nav className="design-types" aria-label="Component list">
      <button
        type="button"
        className="design-type-new"
        onClick={() => useDesign.setState({ newTypeOpen: true })}
      >
        <Icon name="plus" /> New component
      </button>
      {groups.map((group) => (
        <div key={group.is}>
          <h4>{GROUP_NAMES[group.is]}</h4>
          <ul>
            {group.types.map((type) => (
              <TypeRow
                key={type.id}
                type={type}
                chosen={type.id === draft?.id}
                // Stamps are never in the box, so there is no count to show.
                count={type.is === 'stamp' ? undefined : count(type.id)}
              />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** A component of the list. The one shown has a menu of what can be done with it. */
function TypeRow({
  type,
  chosen,
  count,
}: Readonly<{ type: ComponentType; chosen: boolean; count: number | undefined }>) {
  return (
    <li className={chosen ? 'chosen' : undefined}>
      <button type="button" aria-current={chosen} onClick={() => void switchTo(type)}>
        <span className="design-type-name">{type.name ?? type.id}</span>
        {count !== undefined && <Badge>{count}</Badge>}
      </button>
      {chosen && (
        <Menu
          label={`Actions for ${type.name ?? type.id}`}
          button={{ kind: 'icon', icon: 'more' }}
          items={[
            { label: 'Duplicate', icon: 'copy', onSelect: () => void duplicateType() },
            { label: 'Delete', icon: 'trash', danger: true, onSelect: confirmRemove },
          ]}
        />
      )}
    </li>
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
  if (draft && window.confirm(`Delete "${draft.id}" from the library?`)) {
    void removeDraftType();
  }
}
