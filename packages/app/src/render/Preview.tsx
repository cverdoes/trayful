import type { Piece } from '@trayful/core';
import { sidesOf, startValue, type ComponentType } from '@trayful/formats/browser';
import type Konva from 'konva';
import { useEffect, useRef } from 'react';
import { Group, Layer, Rect, Stage } from 'react-konva';
import { useStore } from '../store';
import { Component } from './Component';
import { sizeOf } from './geometry';
import { imagesSettled } from './images';

type Data = Record<string, string | number | boolean>;

/** A stand-in piece for drawing a type outside the table. */
export function previewPiece(
  type: ComponentType,
  data: Data | undefined,
  face: 'up' | 'down',
): Piece {
  const piece: Piece = {
    kind: 'piece',
    id: 'preview',
    type: type.id,
    pos: [0, 0],
    rot: 0,
    face,
    z: 0,
  };
  if (data && Object.keys(data).length) piece.data = data;
  const value = startValue(type);
  if (value !== undefined) piece.value = value;
  return piece;
}

/** Which sides of a type to show: both for two-sided types unless one is asked for. */
function sides(type: ComponentType, face: 'up' | 'down' | 'both' = 'both'): ('up' | 'down')[] {
  if (face !== 'both') return [face];
  return sidesOf(type) === 2 ? ['up', 'down'] : ['up'];
}

const PAD = 6;
/** Longest side of a component picture in pixels. */
const PICTURE_SIZE = 900;

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

/**
 * Draws the component an agent asked to see, off screen, and sends the picture
 * back to the server. Images are given time to load first.
 */
export function RenderJob() {
  const job = useStore((s) => s.renderJob);
  const view = useStore((s) => s.view);
  const stage = useRef<Konva.Stage>(null);
  const type = job && view?.types[job.component.type];

  useEffect(() => {
    if (!job) return;
    const { send } = useStore.getState();
    const done = (answer: { png?: string; error?: string }) => {
      send({ type: 'snapshot', id: job.id, ...answer });
      useStore.setState({ renderJob: undefined });
    };
    if (!type) {
      done({ error: `This browser does not know the type "${job.component.type}" yet.` });
      return;
    }
    void (async () => {
      await frame();
      await imagesSettled();
      await frame();
      await frame();
      const s = stage.current;
      if (!s) return done({ error: 'Could not draw the component.' });
      const ratio = PICTURE_SIZE / Math.max(s.width(), s.height());
      done({ png: s.toDataURL({ pixelRatio: ratio }).slice('data:image/png;base64,'.length) });
    })();
  }, [job, type]);

  if (!job || !view || !type) return null;
  const [w, h] = sizeOf(type);
  const shown = sides(type, job.component.face);
  const width = PAD + shown.length * (w + PAD);
  const height = h + 2 * PAD;
  return (
    <div style={{ position: 'fixed', left: -100000, top: 0 }} aria-hidden>
      <Stage ref={stage} width={width} height={height} listening={false}>
        <Layer>
          <Rect width={width} height={height} fill="#2f5d50" />
          {shown.map((face, i) => (
            <Group key={face} x={PAD + i * (w + PAD) + w / 2} y={PAD + h / 2}>
              <Component
                piece={previewPiece(type, job.component.data, face)}
                type={type}
                assets={view.assets}
              />
            </Group>
          ))}
        </Layer>
      </Stage>
    </div>
  );
}
