// The designer's state: the type being edited, its problems, and saving it.
import {
  freeTypeId,
  typeDraftProblems,
  type ComponentType,
  sameValue,
  type Problem,
} from '@trayful/formats/browser';
import { create } from 'zustand';
import { useStore } from '../store';
import {
  deleteType,
  fetchComponents,
  fetchLibrary,
  saveType,
  type BoxComponent,
  type Library,
} from './api';
import { setIn, type Path, type Side } from './edit';

/**
 * Where the type being edited stands: saved to its file, waiting to be saved,
 * being saved, not valid yet (so not saved), or refused by the server.
 */
export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'invalid' | 'conflict' | 'failed';

interface DesignStore {
  library?: Library;
  /** Everything in the box, for counts and sample designs. */
  components: BoxComponent[];
  /** The type being edited, with the user's latest changes. */
  draft?: ComponentType;
  /** The same type as its file has it; undefined until a new type is first saved. */
  saved?: ComponentType;
  /**
   * The version of the type's file that `saved` came from. A save is checked
   * against it, so a change made to the file meanwhile is not overwritten.
   */
  baseHash?: string;
  side: Side;
  /** Index of the selected layer on `side`. */
  layer?: number;
  /** Id of the component whose field values fill the faces; none means stand-in values. */
  sample?: string;
  problems: Problem[];
  status: SaveStatus;
  /** Why the last save or removal was refused. */
  message?: string;
  newTypeOpen: boolean;
}

export const useDesign = create<DesignStore>(() => ({
  components: [],
  side: 'front',
  problems: [],
  status: 'saved',
  newTypeOpen: false,
}));

/** How long after the last change a valid type is saved. */
const SAVE_DELAY = 600;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
/** The save on its way to the server, if any; changes made meanwhile are saved after it. */
let saving: Promise<void> | undefined;
/** The library file a new type goes into; the server picks one when this is unset. */
let newTypeFile: string | undefined;
/** Counts the types opened, so a save that ends after another type was opened is ignored. */
let opened = 0;

const projectId = () => useStore.getState().view?.project ?? '';

/** The version of the file a type is in, as the library last listed it. */
function fileHash(library: Library | undefined, id: string | undefined): string | undefined {
  const file = library && id ? library.types[id] : undefined;
  return file && library?.files[file];
}

/** Fetches which file holds which type, and what is in the box. */
export async function loadLibrary(): Promise<void> {
  const [library, components] = await Promise.all([
    fetchLibrary(projectId()),
    fetchComponents(projectId()),
  ]);
  useDesign.setState({ library, components });
}

/** Shows a type as its file has it, dropping any unsaved changes to the type shown before. */
export function openType(type: ComponentType | undefined): void {
  clearTimeout(saveTimer);
  opened++;
  newTypeFile = undefined;
  const { components, library } = useDesign.getState();
  useDesign.setState({
    draft: type,
    saved: type,
    baseHash: fileHash(library, type?.id),
    side: 'front',
    layer: undefined,
    sample: type && components.find((c) => c.type === type.id)?.id,
    problems: type ? typeDraftProblems(type) : [],
    status: 'saved',
    message: undefined,
  });
}

/** Changes the type being edited, and saves it shortly after if it is valid. */
export function editDraft(change: (type: ComponentType) => ComponentType): void {
  const { draft } = useDesign.getState();
  if (!draft) return;
  const next = change(draft);
  const problems = typeDraftProblems(next);
  useDesign.setState({
    draft: next,
    problems,
    status: problems.length ? 'invalid' : 'unsaved',
    message: undefined,
  });
  clearTimeout(saveTimer);
  if (!problems.length) saveTimer = setTimeout(() => void saveDraft(), SAVE_DELAY);
}

/** A change handler that sets one value of the type being edited; undefined removes it. */
export const setValue = (path: Path) => (value: unknown) =>
  editDraft((type) => setIn(type, path, value));

/**
 * Saves the type being edited, unless it is unchanged or invalid. While a save is on
 * its way, this waits for it; changes made meanwhile are saved when it is back.
 */
export async function saveDraft(): Promise<void> {
  if (saving) return saving;
  const { draft, saved, status } = useDesign.getState();
  if (!draft || status === 'invalid' || sameValue(draft, saved)) return;
  saving = send(draft).finally(() => (saving = undefined));
  return saving;
}

async function send(draft: ComponentType): Promise<void> {
  const { baseHash, library } = useDesign.getState();
  const file = library?.types[draft.id] ?? newTypeFile;
  const sentFor = opened;
  useDesign.setState({ status: 'saving' });
  const result = await saveType(projectId(), draft, { baseHash, file });
  if (sentFor !== opened) return;
  if (!result.ok) {
    useDesign.setState({
      status: result.conflict ? 'conflict' : 'failed',
      message: result.message,
    });
    return;
  }
  useDesign.setState({
    library: result.library,
    saved: draft,
    baseHash: fileHash(result.library, draft.id),
    status: 'saved',
  });
  // Changes made while the save was on its way are saved in turn.
  if (!sameValue(useDesign.getState().draft, draft)) editDraft((type) => type);
}

/**
 * Before showing another type: finishes saving this one. True when nothing
 * unsaved is left, false when its changes would be lost.
 */
export async function settle(): Promise<boolean> {
  clearTimeout(saveTimer);
  await saving;
  if (useDesign.getState().status === 'unsaved') await saveDraft();
  return useDesign.getState().status === 'saved';
}

/** After a conflict: replaces the user's changes with the type as its file now has it. */
export async function reloadType(): Promise<void> {
  const id = useDesign.getState().draft?.id;
  await loadLibrary();
  openType(id ? useStore.getState().view?.types[id] : undefined);
}

/** After a conflict: saves the user's version over the newer one in the file. */
export async function keepMine(): Promise<void> {
  await loadLibrary();
  const { draft, library } = useDesign.getState();
  // Saving against the file as it is now replaces the other change on purpose.
  useDesign.setState({
    status: 'unsaved',
    saved: draft && useStore.getState().view?.types[draft.id],
    baseHash: fileHash(library, draft?.id),
  });
  await saveDraft();
}

/**
 * The project files changed (here or elsewhere): refreshes what the designer
 * knows, and shows the newer version of the type when there is nothing unsaved.
 */
export async function projectChanged(types: Record<string, ComponentType>): Promise<void> {
  await loadLibrary();
  const { draft, saved, status } = useDesign.getState();
  if (status !== 'saved') return;
  const current = draft && types[draft.id];
  if (!draft || !saved) openType(Object.values(types)[0]);
  else if (!current) openType(Object.values(types)[0]);
  else if (!sameValue(current, saved)) {
    const { side, layer, sample } = useDesign.getState();
    openType(current);
    useDesign.setState({ side, layer, sample });
  }
}

/**
 * Starts a new type named `name` from `start` (a preset, or a type to copy), and
 * saves it straight away so it is in the library: in `file` if given.
 */
export async function createType(
  start: Omit<ComponentType, 'id'>,
  name: string,
  file?: string,
): Promise<void> {
  const taken = Object.keys(useStore.getState().view?.types ?? {});
  // The id and name come first, as people write them; a copied type brings its own.
  const rest = Object.fromEntries(
    Object.entries(start).filter(([key]) => key !== 'id' && key !== 'name'),
  );
  const type = { id: freeTypeId(name, taken), name, ...rest } as ComponentType;
  openType(undefined);
  newTypeFile = file;
  useDesign.setState({ draft: type, newTypeOpen: false, status: 'unsaved' });
  await saveDraft();
}

/** Copies the type being edited into a new type, in the same file. */
export async function duplicateType(): Promise<void> {
  const { draft, library } = useDesign.getState();
  if (!draft) return;
  await createType(draft, `${draft.name ?? draft.id} copy`, library?.types[draft.id]);
}

/** Removes the type being edited from its library file. */
export async function removeDraftType(): Promise<void> {
  const { draft } = useDesign.getState();
  if (!draft) return;
  try {
    const library = await deleteType(projectId(), draft.id);
    useDesign.setState({ library });
    const types = Object.values(useStore.getState().view?.types ?? {});
    openType(types.find((t) => t.id !== draft.id));
  } catch (err) {
    // The type stays as it was, so this is a message, not a failed save.
    useDesign.setState({ message: (err as Error).message });
  }
}
