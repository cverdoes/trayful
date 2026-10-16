import type { Asset } from '@trayful/formats/browser';
import { projectFileUrl } from '../render/images';
import { useStore } from '../store';
import { tileCount } from './images';

/**
 * An image with the grid of tiles it is cut into drawn over it. With `onPick`,
 * each tile is a button, so a tile is picked by clicking it, never by its number.
 */
export function TilePicker({
  image,
  selected,
  onPick,
  label,
}: Readonly<{
  image: Asset;
  selected?: number;
  onPick?: (tile: number) => void;
  label: string;
}>) {
  const view = useStore((s) => s.view);
  if (!view) return null;
  const tiles = Array.from({ length: tileCount(image) }, (_, i) => i);
  return (
    <div className="tile-picker" role={onPick ? 'group' : undefined} aria-label={label}>
      <img src={projectFileUrl(view, image.file)} alt="" />
      <div
        className="tile-grid"
        style={{
          gridTemplateColumns: `repeat(${image.cols}, 1fr)`,
          gridTemplateRows: `repeat(${image.rows}, 1fr)`,
        }}
      >
        {tiles.map((i) =>
          onPick ? (
            <button
              key={i}
              type="button"
              className={i === selected ? 'tile chosen' : 'tile'}
              aria-label={`Tile ${i}`}
              aria-pressed={i === selected}
              onClick={() => onPick(i)}
            />
          ) : (
            <span key={i} className="tile" />
          ),
        )}
      </div>
    </div>
  );
}
