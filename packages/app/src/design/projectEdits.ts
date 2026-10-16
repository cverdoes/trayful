// Designer changes that reach beyond the type being edited: renames, which the
// server makes in every file that uses the name, and images saved into the assets.
import { backOf, imageRefs, type ComponentType } from '@trayful/formats/browser';
import { addImageAsset, renameField, renameImageAsset, renameType } from './api';
import { assetPath, editType, sidePath, type Side } from './edit';
import { editDraft, expectType, projectId, settle, useDesign } from './store';

/**
 * Gives the type being edited a new id in the library, inventory and setups.
 * Its changes are saved first; while it cannot be saved, nothing is renamed.
 */
export async function renameDraftType(to: string): Promise<void> {
  const id = useDesign.getState().draft?.id;
  if (!id || !to || to === id) return;
  await whenSaved(async () => {
    useDesign.setState({ library: await renameType(projectId(), id, to) });
    expectType({ id: to, ready: () => true, keepSelection: false });
  });
}

/**
 * Renames a field of the type being edited. A field already in the file is renamed
 * by the server, in the inventory and CSV files too; a new one only in the draft.
 */
export async function renameDraftField(
  from: string,
  to: string,
  renameInDraft: () => void,
): Promise<void> {
  const { draft, saved } = useDesign.getState();
  if (!draft || !to || to === from) return;
  if (!saved?.fields?.[from]) {
    renameInDraft();
    return;
  }
  await whenSaved(async () => {
    useDesign.setState({ library: await renameField(projectId(), draft.id, from, to) });
    expectType({ id: draft.id, ready: (t) => Boolean(t.fields?.[to]), keepSelection: true });
  });
}

/**
 * Gives an image a new name on every component that shows it. The type being
 * edited is saved first, and opened again with the new name once it is loaded.
 */
export async function renameImage(from: string, to: string): Promise<void> {
  const { draft } = useDesign.getState();
  if (draft && !(await settle())) {
    throw new Error(`Fix the problems with "${draft.id}" first: a rename needs it saved.`);
  }
  useDesign.setState({ library: await renameImageAsset(projectId(), from, to) });
  if (draft) {
    expectType({ id: draft.id, ready: (t) => !showsImage(t, from), keepSelection: true });
  }
}

/** Whether a type shows an image of this name, on a face or back, or in a layer. */
function showsImage(type: ComponentType, name: string): boolean {
  const onSide = imageRefs(type).some(
    ({ ref }) => (typeof ref === 'string' ? ref : ref.asset) === name,
  );
  const inLayer = [type.face, backOf(type)].some((side) =>
    side?.layers?.some((layer) => 'image' in layer && layer.image === name),
  );
  return onSide || inLayer;
}

async function whenSaved(change: () => Promise<void>): Promise<void> {
  if (!(await settle())) {
    useDesign.setState({ message: 'Fix the problems first: a rename needs the type saved.' });
    return;
  }
  try {
    await change();
  } catch (err) {
    useDesign.setState({ message: (err as Error).message });
  }
}

/**
 * A picture dropped on a side: saved into the project and named in its assets,
 * then shown on that side, covering it, in place of any image it had.
 */
export async function addImage(image: { name: string; base64: string }, side: Side): Promise<void> {
  try {
    const { name } = await addImageAsset(projectId(), assetPath(image.name), image.base64);
    editDraft((t) => editType(t, [...sidePath(side), 'image'], name));
    useDesign.setState({ side, layer: undefined, target: undefined });
  } catch (err) {
    useDesign.setState({ message: `Could not add the image: ${(err as Error).message}` });
  }
}
