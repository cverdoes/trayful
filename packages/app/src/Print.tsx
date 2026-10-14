import { PRIMITIVE_INFO, type ComponentType } from '@trayful/formats/browser';
import Konva from 'konva';
import { useEffect, useState } from 'react';
import { Group, Layer, Stage } from 'react-konva';
import { Component } from './render/Component';
import { sizeOf } from './render/geometry';
import { previewPiece } from './render/Preview';
import { go, route } from './route';
import { useStore } from './store';

/** A4 portrait, in millimetres. */
const PAGE: [number, number] = [210, 297];
const MARGIN = 8;
const GAP = 2;
/** CSS pixels per millimetre: browsers print 96 px to the inch. */
const PX = 96 / 25.4;

interface Spec {
  id: string;
  type: string;
  data: Record<string, string | number | boolean>;
}

interface Placed {
  spec: Spec;
  type: ComponentType;
  x: number;
  y: number;
  /** Below 1 when the component is larger than the printable area. */
  scale: number;
}

/**
 * Lays components out on pages, left to right and top to bottom, keeping each
 * type together. Anything larger than a page is shrunk to fit its own page.
 */
function paginate(specs: Spec[], types: Record<string, ComponentType>): Placed[][] {
  const pages: Placed[][] = [];
  const [areaW, areaH] = [PAGE[0] - 2 * MARGIN, PAGE[1] - 2 * MARGIN];
  let page: Placed[] = [];
  let [x, y, rowH] = [0, 0, 0];
  const newPage = () => {
    if (page.length) pages.push(page);
    page = [];
    [x, y, rowH] = [0, 0, 0];
  };
  for (const spec of specs) {
    const type = types[spec.type];
    if (!type) continue;
    const [w, h] = sizeOf(type);
    const scale = Math.min(1, areaW / w, areaH / h);
    if (scale < 1) {
      newPage();
      pages.push([{ spec, type, x: 0, y: 0, scale }]);
      continue;
    }
    if (x > 0 && x + w > areaW) [x, y, rowH] = [0, y + rowH + GAP, 0];
    if (y + h > areaH) newPage();
    page.push({ spec, type, x, y, scale: 1 });
    x += w + GAP;
    rowH = Math.max(rowH, h);
  }
  newPage();
  return pages;
}

/** Print-and-play sheets: every component at real size, fronts then backs for duplex printing. */
export function Print() {
  const view = useStore((s) => s.view);
  const [specs, setSpecs] = useState<Spec[]>();
  const project = route().project ?? view?.project;

  useEffect(() => {
    // Sharper pictures on paper than on screen.
    Konva.pixelRatio = 4;
    document.body.classList.add('printing');
    if (!project) return;
    void fetch(`/api/components?project=${encodeURIComponent(project)}`)
      .then((r) => r.json())
      .then((s: Spec[]) => setSpecs(s));
  }, [project]);

  if (!view || !specs) return <div className="loading">Preparing sheets…</div>;
  const sorted = [...specs].sort((a, b) => a.type.localeCompare(b.type));
  const fronts = paginate(sorted, view.types);
  // Backs mirror their fronts left to right, so they line up when printed on both sides.
  const backs = fronts
    .map((page) =>
      page
        .filter((p) => PRIMITIVE_INFO[p.type.base].sides === 2)
        .map((p) => ({ ...p, x: PAGE[0] - 2 * MARGIN - p.x - sizeOf(p.type)[0] * p.scale })),
    )
    .filter((page) => page.length > 0);

  return (
    <div className="print">
      <header className="print-bar">
        <strong>{view.name}: print and play</strong>
        <span className="muted">
          {fronts.length} {fronts.length === 1 ? 'page' : 'pages'} of fronts
          {backs.length ? `, then ${backs.length} of backs for printing on both sides` : ''}. Print
          at 100% scale on A4; choose “Save as PDF” to get a file.
        </span>
        <button type="button" onClick={() => window.print()}>
          Print
        </button>
        <button type="button" onClick={() => go({ project: view.project, table: view.table })}>
          Back to the table
        </button>
      </header>
      {fronts.map((page, i) => (
        <Sheet key={`f${i}`} items={page} face="up" palette={view.palette} />
      ))}
      {backs.map((page, i) => (
        <Sheet key={`b${i}`} items={page} face="down" palette={view.palette} />
      ))}
    </div>
  );
}

function Sheet({
  items,
  face,
  palette,
}: Readonly<{
  items: Placed[];
  face: 'up' | 'down';
  palette: Record<string, string>;
}>) {
  return (
    <section className="sheet" data-face={face}>
      {items.map(({ spec, type, x, y, scale }) => {
        const [w, h] = sizeOf(type).map((n) => n * scale) as [number, number];
        return (
          <div
            key={spec.id}
            className="sheet-item"
            title={spec.id}
            style={{
              left: `${MARGIN + x}mm`,
              top: `${MARGIN + y}mm`,
              width: `${w}mm`,
              height: `${h}mm`,
            }}
          >
            <Stage width={w * PX} height={h * PX} listening={false}>
              <Layer>
                <Group x={(w * PX) / 2} y={(h * PX) / 2} scaleX={PX * scale} scaleY={PX * scale}>
                  <Component
                    piece={previewPiece(type, spec.data, face)}
                    type={type}
                    palette={palette}
                  />
                </Group>
              </Layer>
            </Stage>
          </div>
        );
      })}
    </section>
  );
}
