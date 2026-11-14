import { expect, test, type Page } from '@playwright/test';
import { freshTable, openTable } from './helpers.js';

declare global {
  interface Window {
    /** Konva puts itself on the window; the test redraws its layers through it. */
    Konva?: { stages: { getLayers(): KonvaLayer[] }[] };
  }
}

interface KonvaLayer {
  draw(): void;
  getCanvas(): { getContext(): CanvasRenderingContext2D };
}

/**
 * The most one redraw of the whole Harvest Moon table may take, in milliseconds, on a
 * Retina-sized canvas. The table redraws on every step of a drag, pan or zoom, so this
 * decides whether those feel smooth. A healthy build takes about 10 ms fitted and 20 ms
 * zoomed in, in headless Chromium on a 4-core cloud machine. With the paper-grain board of PR #85 drawn straight
 * from its SVG it took 36 and 82 ms, and zooming stalled for up to 200 ms a frame. The
 * margin is for slower machines, not for new costs: when this fails, find what made
 * drawing slower rather than raising it.
 */
const REDRAW_BUDGET_MS = 40;

test.use({ deviceScaleFactor: 2 });

test.beforeEach(async ({ baseURL }) => freshTable(baseURL!));

/**
 * The median time to redraw every layer of every canvas, read back so that the
 * drawing really happens before the clock stops rather than later, off the clock.
 */
async function redrawTime(page: Page): Promise<number> {
  return page.evaluate(() => {
    const layers = window.Konva!.stages.flatMap((stage) => stage.getLayers());
    const redraw = () => {
      const start = performance.now();
      for (const layer of layers) {
        layer.draw();
        layer.getCanvas().getContext().getImageData(0, 0, 1, 1);
      }
      return performance.now() - start;
    };
    // The first redraws warm caches and paint image copies; they are not counted.
    for (let i = 0; i < 3; i++) redraw();
    const times = Array.from({ length: 15 }, redraw).sort((a, b) => a - b);
    return times[Math.floor(times.length / 2)]!;
  });
}

test('the table redraws within its budget, fitted and zoomed in', async ({ page }) => {
  await openTable(page);
  // Images load and their copies are painted while the poll retries.
  await expect
    .poll(() => redrawTime(page), { message: 'redraw time when fitted, ms' })
    .toBeLessThan(REDRAW_BUDGET_MS);

  const scale = () =>
    page.evaluate(() => {
      const state = window.__trayful!.store.getState() as unknown as {
        viewports: Record<string, { scale: number }>;
      };
      return Object.values(state.viewports)[0]?.scale ?? 1;
    });
  const fitted = await scale();
  await page.mouse.move(640, 300);
  // Wait for each turn of the wheel to zoom before the next, until it is 4 times as close.
  while ((await scale()) < fitted * 4) {
    const before = await scale();
    await page.mouse.wheel(0, -100);
    await expect.poll(scale).toBeGreaterThan(before);
  }
  // Copies at the new size are painted once the zoom rests, while the poll retries.
  await expect
    .poll(() => redrawTime(page), { message: 'redraw time when zoomed in, ms' })
    .toBeLessThan(REDRAW_BUDGET_MS);
});
