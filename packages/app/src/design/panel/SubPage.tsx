// A page of the inspector that takes the whole panel: a side's labels or drawing,
// or the drop areas, with a way back to the main page.
import type { ComponentType } from '@trayful/formats/browser';
import type { KeyboardEvent } from 'react';
import { Button } from '../../ui/Button';
import { twoSided } from '../edit';
import { useDesign, type InspectorPage } from '../store';
import { SideItemsPage } from './SideSection';
import { DropAreasPage, takesDropAreas } from './SnapSection';

/** Leaves a page for the main one, letting go of what was selected on it. */
function backToMain(): void {
  useDesign.setState({ page: undefined, layer: undefined, target: undefined });
}

/** Whether a page still has something to show: a back for its labels, or a container's drop areas. */
export function pageFits(type: ComponentType, page: InspectorPage): boolean {
  if (page.kind === 'drop-areas') return takesDropAreas(type);
  return page.side === 'front' || twoSided(type);
}

const SIDE_NAME = { front: 'Face', back: 'Back' } as const;

const TITLE: Record<InspectorPage['kind'], string> = {
  labels: 'Labels',
  drawing: 'Drawing',
  'drop-areas': 'Drop areas',
};

/** Escape goes back, unless it is a key of a box being typed in or a list being picked from. */
function escapeBack(e: KeyboardEvent) {
  const typing = e.target instanceof Element && e.target.matches('input, select, textarea');
  if (e.key !== 'Escape' || typing || e.defaultPrevented) return;
  e.preventDefault();
  backToMain();
}

/** The page under a header with the way back, where it is in the component, and its title. */
export function SubPage({ type, page }: Readonly<{ type: ComponentType; page: InspectorPage }>) {
  const title = TITLE[page.kind];
  const name = type.name ?? type.id;
  const where = page.kind === 'drop-areas' ? name : `${name} · ${SIDE_NAME[page.side]}`;
  return (
    <section className="design-subpage" aria-label={title} onKeyDown={escapeBack}>
      <header className="design-subpage-header">
        <Button variant="quiet" icon="left" onClick={backToMain}>
          Back
        </Button>
        <div>
          <small>{where}</small>
          <h2>{title}</h2>
        </div>
      </header>
      {page.kind === 'drop-areas' ? (
        <DropAreasPage type={type} />
      ) : (
        <SideItemsPage type={type} side={page.side} labels={page.kind === 'labels'} />
      )}
    </section>
  );
}
