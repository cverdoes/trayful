// The assets file: named images, which may be cut into tiles, and named colours.
import { z } from 'zod';
import { Slug } from './common.js';

export const ImageAsset = z
  .union([
    z.string().min(1).describe('Path to the image, relative to the project folder.'),
    z.strictObject({
      file: z.string().min(1).describe('Path to the image, relative to the project folder.'),
      rows: z
        .int()
        .positive()
        .optional()
        .describe('Rows of tiles the image is cut into. Default 1.'),
      cols: z
        .int()
        .positive()
        .optional()
        .describe('Columns of tiles the image is cut into. Default 1.'),
    }),
  ])
  .meta({
    id: 'ImageAsset',
    description:
      'An image file, given as its path, or as `{ file, rows, cols }` to cut it into equal tiles, as on a sheet of cards or a die strip.',
  });

export const AssetsFile = z
  .strictObject({
    kind: z.literal('assets').describe('Marks this file as the assets file.'),
    images: z
      .record(Slug, ImageAsset)
      .optional()
      .describe('Images by name, for faces to refer to.'),
    colors: z
      .record(z.string(), z.string())
      .optional()
      .describe('Colours by name, usable anywhere a colour is expected.'),
  })
  .meta({
    id: 'Assets',
    title: 'Trayful assets',
    description: 'Names the images and colours that components use.',
  });

export type ImageAsset = z.infer<typeof ImageAsset>;
export type AssetsFile = z.infer<typeof AssetsFile>;
