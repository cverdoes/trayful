/** The shapes `ws` can deliver a message in, depending on its `binaryType`. */
type Frame = Buffer | ArrayBuffer | Buffer[];

/** The text of a WebSocket message, whichever shape it arrived in. */
export function frameText(data: Frame): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString();
  return Buffer.isBuffer(data) ? data.toString() : Buffer.from(data).toString();
}
