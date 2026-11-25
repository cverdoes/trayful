/**
 * An extension that caps how many projects a Trayful's folder may hold, using the
 * limits hook. The same shape prices a tier: count what a space holds, and refuse what
 * would take it past what its owner pays for.
 */
import type { Extension, Limits, Space } from 'trayful/server';

export function projectCap(max: number): Extension {
  return {
    limits:
      (space: Space): Limits =>
      (growth) => {
        if (growth.kind !== 'project') return undefined;
        if (space.workspace.projects().length < max) return undefined;
        return `This Trayful holds at most ${max} projects.`;
      },
  };
}
