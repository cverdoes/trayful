import { isValued, type ComponentType, type ImageRef } from '@trayful/formats/browser';
import { useStore } from '../store';
import { getIn, sidePath, type Side } from './edit';
import {
  imageChoice,
  imageRef,
  tileModes,
  withAsset,
  type ImageChoice,
  type TileMode,
} from './images';
import { Row, Select } from './controls';
import { setValue } from './store';
import { TilePicker } from './TilePicker';

const MODE_LABEL: Record<TileMode, string> = {
  whole: 'The whole image',
  tile: 'One tile',
  instance: 'Each component picks its tile',
  value: 'The tile of its value',
};

/**
 * The image covering one side: picked from the project's images by name, and
 * for an image cut into tiles, which tile shows.
 */
export function ImagePicker({ type, side }: Readonly<{ type: ComponentType; side: Side }>) {
  const images = useStore((s) => s.view?.assets.images ?? {});
  const path = [...sidePath(side), 'image'];
  const valued = isValued(type);
  const choice = imageChoice(getIn(type, path) as ImageRef | undefined, images, valued);
  const image = choice && images[choice.asset];
  const set = (next: ImageChoice | undefined) => setValue(path)(next && imageRef(next));
  return (
    <>
      <Row label="Image" path={path}>
        {(id) => (
          <Select
            id={id}
            value={choice?.asset}
            options={Object.keys(images)}
            empty="none"
            onChange={(name) =>
              set(name ? withAsset(choice, name, images[name]!, valued) : undefined)
            }
          />
        )}
      </Row>
      {choice && image && tileModes(image, valued).length > 1 && (
        <Row label="Shows">
          {(id) => (
            <Select
              id={id}
              value={choice.mode}
              options={tileModes(image, valued)}
              labels={MODE_LABEL}
              onChange={(mode) => mode && set({ ...choice, mode })}
            />
          )}
        </Row>
      )}
      {choice && image && (
        <TilePicker
          image={image}
          label="Tiles"
          selected={choice.mode === 'tile' ? choice.tile : undefined}
          onPick={choice.mode === 'tile' ? (tile) => set({ ...choice, tile }) : undefined}
        />
      )}
      {choice && (
        <Row label="Fit">
          {(id) => (
            <Select
              id={id}
              value={choice.fit}
              options={['cover', 'contain', 'stretch'] as const}
              empty="cover"
              onChange={(fit) => set({ ...choice, fit })}
            />
          )}
        </Row>
      )}
    </>
  );
}
