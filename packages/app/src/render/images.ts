import { useEffect, useState } from 'react';

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

/** Loads a project image by its path inside the project folder. */
export function useProjectImage(path: string | undefined): HTMLImageElement | undefined {
  const src = path
    ? `/project-files/${path.split('/').map(encodeURIComponent).join('/')}`
    : undefined;
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
