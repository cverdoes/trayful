import { markBoxes, type MarkBox, type Piece } from '@trayful/core';
import type { Assets } from '@trayful/formats/browser';
import { Group, Text } from 'react-konva';
import { textSize } from '../marks';
import { Component } from './Component';
import type { Types } from './geometry';

/** Ink for text written on a sheet. */
const INK = '#1d3f8f';

/**
 * The stamps and text on a piece's stamp and text spots, drawn over the piece
 * centred on (0, 0) like `Component`, so callers draw them in the same place.
 */
export function Marks({
  piece,
  types,
  assets,
}: Readonly<{ piece: Piece; types: Types; assets: Assets }>) {
  if (!piece.marks) return null;
  return (
    <Group listening={false}>
      {localBoxes(piece, types).map((box) =>
        box.mark ? <MarkView key={box.key} box={box} types={types} assets={assets} /> : null,
      )}
    </Group>
  );
}

/** A piece's boxes measured from its centre, unturned, for drawing inside the piece. */
export function localBoxes(piece: Piece, types: Types): MarkBox[] {
  return markBoxes({ ...piece, pos: [0, 0], rot: 0 }, types);
}

function MarkView({
  box,
  types,
  assets,
}: Readonly<{ box: MarkBox; types: Types; assets: Assets }>) {
  const [x, y] = box.spot.pos;
  const mark = box.mark!;
  if ('text' in mark) {
    const [w, h] = box.size;
    return (
      <Text
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        text={mark.text}
        align="center"
        verticalAlign="middle"
        wrap="none"
        fontSize={textSize(mark.text, box.size)}
        fontFamily="'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive"
        fill={INK}
      />
    );
  }
  const type = types[mark.stamp];
  if (type?.is !== 'stamp') return null;
  // A stamp lies flat on the sheet, so it is drawn like a locked piece: without a shadow.
  const stamp: Piece = {
    kind: 'piece',
    id: box.key,
    type: type.id,
    pos: [0, 0],
    rot: 0,
    face: 'up',
    z: 0,
    locked: true,
  };
  return (
    <Group x={x} y={y}>
      <Component piece={stamp} type={type} assets={assets} />
    </Group>
  );
}
