import { z } from 'zod';
import { FILE_KINDS, type FileKind } from './schemas.js';

/** JSON Schema (draft 2020-12) for each file kind, describing what authors may write. */
export function toJsonSchemas(): Record<FileKind, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(FILE_KINDS).map(([kind, schema]) => [
      kind,
      {
        ...z.toJSONSchema(schema, { io: 'input', target: 'draft-2020-12' }),
        $id: `https://github.com/cverdoes/trayful/blob/main/packages/formats/schema/${kind}.schema.json`,
      },
    ]),
  ) as unknown as Record<FileKind, Record<string, unknown>>;
}
