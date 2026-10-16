import { slugify, type Asset } from '@trayful/formats/browser';
import { useState } from 'react';
import { useStore } from '../store';
import {
  addImageAsset,
  removeColorAsset,
  removeImageAsset,
  setColorAsset,
  setImageAsset,
} from './api';
import { assetPath } from './edit';
import { readImage } from './files';
import { renameImage } from './projectEdits';
import { projectId } from './store';
import { TilePicker } from './TilePicker';

/** Runs a change to the assets file; a refusal comes back as the message to show. */
type Run = (change: () => Promise<unknown>) => void;

/**
 * The project's images and colours, named once and used by any component. The
 * table and the designer pick up each change as soon as it is saved.
 */
export function AssetsPage() {
  const images = useStore((s) => s.view?.assets.images ?? {});
  const [message, setMessage] = useState<string>();
  const run: Run = (change) => {
    setMessage(undefined);
    change().catch((err: unknown) => setMessage(err instanceof Error ? err.message : String(err)));
  };
  return (
    <main className="assets-page" aria-label="Assets">
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      <section aria-label="Images">
        <h3>Images</h3>
        <p className="muted">
          Name an image once to use it on any component. A sheet of cards or a strip of die faces is
          cut into tiles by its rows and columns.
        </p>
        <AddImage run={run} />
        <ul className="asset-images">
          {Object.entries(images).map(([name, image]) => (
            <ImageCard key={name} name={name} image={image} run={run} />
          ))}
        </ul>
      </section>
      <ColorsSection run={run} />
    </main>
  );
}

/** Adds pictures, picked or dropped, each named after its file. */
function AddImage({ run }: Readonly<{ run: Run }>) {
  const add = (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      run(async () => {
        const image = await readImage(file).catch(() => {
          throw new Error(`"${file.name}" is not a picture; add a PNG, JPEG, GIF, WebP or SVG.`);
        });
        await addImageAsset(projectId(), assetPath(image.name), image.base64);
      });
    }
  };
  return (
    <label
      className="asset-drop"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        add(e.dataTransfer.files);
      }}
    >
      Add images: drop them here, or{' '}
      <input
        type="file"
        accept="image/*"
        multiple
        aria-label="Add images"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = '';
        }}
      />
    </label>
  );
}

function ImageCard({ name, image, run }: Readonly<{ name: string; image: Asset; run: Run }>) {
  const setTiles = (rows: number, cols: number) =>
    run(() => setImageAsset(projectId(), name, { file: image.file, rows, cols }));
  const rename = () => {
    const to = window
      .prompt(`New name for "${name}". Components that show it are changed too.`, name)
      ?.trim();
    if (to && to !== name) run(() => renameImage(name, to));
  };
  const remove = () => {
    if (window.confirm(`Take the name "${name}" off ${image.file}? The file stays.`)) {
      run(() => removeImageAsset(projectId(), name));
    }
  };
  return (
    <li className="asset-image" aria-label={name}>
      <TilePicker image={image} label={`Tiles of ${name}`} />
      <div className="asset-name">
        <strong>{name}</strong> <span className="muted">{image.file}</span>
      </div>
      <div className="asset-tiles">
        <WholeNumber
          label="Rows"
          value={image.rows}
          onChange={(rows) => setTiles(rows, image.cols)}
        />
        <WholeNumber
          label="Columns"
          value={image.cols}
          onChange={(cols) => setTiles(image.rows, cols)}
        />
        <button type="button" onClick={rename}>
          Rename
        </button>
        <button type="button" onClick={remove}>
          Remove
        </button>
      </div>
    </li>
  );
}

/** A count from 1, reported once what is typed is one. */
function WholeNumber({
  label,
  value,
  onChange,
}: Readonly<{ label: string; value: number; onChange: (value: number) => void }>) {
  const [typed, setTyped] = useState(String(value));
  // Taken up again when the count changes elsewhere, such as in the file.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setTyped(String(value));
  }
  return (
    <label>
      {label}{' '}
      <input
        type="number"
        min={1}
        value={typed}
        onChange={(e) => {
          setTyped(e.target.value);
          if (isCount(e.target.value) && Number(e.target.value) !== value) {
            onChange(Number(e.target.value));
          }
        }}
      />
    </label>
  );
}

const isCount = (text: string) => /^[1-9]\d*$/.test(text);

/** Named colours, usable on any component by name. */
function ColorsSection({ run }: Readonly<{ run: Run }>) {
  const colors = useStore((s) => s.view?.assets.colors ?? {});
  const [name, setName] = useState('');
  const [color, setColor] = useState('#888888');
  const add = () => {
    const slug = slugify(name);
    if (slug) run(() => setColorAsset(projectId(), slug, color).then(() => setName('')));
  };
  return (
    <section aria-label="Colours">
      <h3>Colours</h3>
      <ul className="asset-colors">
        {Object.entries(colors).map(([key, value]) => (
          <li key={key}>
            <ColorPicker
              label={`Colour ${key}`}
              value={value}
              onPicked={(picked) => run(() => setColorAsset(projectId(), key, picked))}
            />{' '}
            {key} <span className="muted">{value}</span>{' '}
            <button type="button" onClick={() => run(() => removeColorAsset(projectId(), key))}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form
        className="asset-new-color"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          aria-label="New colour name"
          placeholder="sea"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="color"
          aria-label="New colour"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
        <button type="submit" disabled={!name.trim()}>
          Add colour
        </button>
      </form>
    </section>
  );
}

/**
 * A colour picker that saves once a colour is settled on (the picker closed),
 * not at every colour passed on the way there.
 */
function ColorPicker({
  label,
  value,
  onPicked,
}: Readonly<{ label: string; value: string; onPicked: (color: string) => void }>) {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : '#888888';
  const [picking, setPicking] = useState<string>();
  return (
    <input
      type="color"
      aria-label={label}
      value={picking ?? hex}
      onChange={(e) => setPicking(e.target.value)}
      onBlur={() => {
        if (picking && picking !== hex) onPicked(picking);
        setPicking(undefined);
      }}
    />
  );
}
