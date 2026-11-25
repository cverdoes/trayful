/** Something a player is connected by, such as a WebSocket. */
interface Closable {
  close(code?: number, reason?: string): void;
}

/** The live connections of each player, so one sent away can be cut off. */
export class Connections {
  private byPlayer = new Map<string, Set<Closable>>();

  /** Keeps a player's connection; the returned function forgets it again. */
  add(player: string, connection: Closable): () => void {
    const open = this.byPlayer.get(player) ?? new Set();
    open.add(connection);
    this.byPlayer.set(player, open);
    return () => open.delete(connection);
  }

  /** Closes every connection of a player, saying why. */
  closeAll(player: string, reason: string): void {
    for (const connection of this.byPlayer.get(player) ?? []) connection.close(1008, reason);
    this.byPlayer.delete(player);
  }
}
