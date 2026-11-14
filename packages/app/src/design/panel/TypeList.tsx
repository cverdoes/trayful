import { REPRESENTATIONS, type ComponentType } from '@trayful/formats/browser';
import { useStore } from '../../store';
import { Badge } from '../../ui/Badge';
import { confirm } from '../../ui/dialogs';
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
            { label: 'Delete', icon: 'trash', danger: true, onSelect: () => void confirmRemove() },
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
  const drop =
    kept ||
    (await confirm({
      title: 'Drop the changes?',
      text: `The changes to "${draft?.id}" are not saved.`,
      action: 'Drop changes',
      danger: true,
    }));
  if (drop) openType(type);
}

async function confirmRemove(): Promise<void> {
  const { draft } = useDesign.getState();
  if (!draft) return;
  const yes = await confirm({
    title: `Delete "${draft.id}"?`,
    text: 'The component is taken out of the library.',
    action: 'Delete',
    danger: true,
  });
  if (yes) await removeDraftType();
}
