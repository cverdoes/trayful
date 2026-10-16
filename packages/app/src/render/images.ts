import { useEffect, useState } from 'react';
import { useStore } from '../store';

const cache = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement>>();

function load(src: string): Promise<HTMLImageElement> {
  let promise = pending.get(src);
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => {
        cache.set(src, image);
        resolve(image);
      };
      image.onerror = reject;
      image.src = src;
    });
    pending.set(src, promise);
  }
  return promise;
}

/** Resolves when every image requested so far has loaded (or failed). */
export async function imagesSettled(): Promise<void> {
  await Promise.allSettled([...pending.values()]);
}

/**
 * The address of a file in the project folder. The project's version is part of
 * it, so an edited image shows up after a reload.
 */
export function projectFileUrl(view: { project: string; version: number }, path: string): string {
  const file = path.split('/').map(encodeURIComponent).join('/');
  return `/project-files/${encodeURIComponent(view.project)}/${file}?v=${view.version}`;
}

/**
 * Loads a project image by its path inside the project folder.
 */
export function useProjectImage(path: string | undefined): HTMLImageElement | undefined {
  const view = useStore((s) => s.view);
  const src = path && view ? projectFileUrl(view, path) : undefined;
  const [image, setImage] = useState(() => (src ? cache.get(src) : undefined));
  useEffect(() => {
    if (!src) return;
    let live = true;
    load(src).then(
      (img) => live && setImage(img),
      () => live && setImage(undefined),
    );
    return () => {
      live = false;
    };
  }, [src]);
  return src ? (image ?? cache.get(src)) : undefined;
}
