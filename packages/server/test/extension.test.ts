import { describe, expect, it } from 'vitest';
import { accessWith } from '../src/extension.js';
import { localAccess } from '../src/play/access.js';

describe('accessWith', () => {
  const local = localAccess();

  it('keeps the local access when no extension decides', () => {
    expect(accessWith([{ tokenRoutes: ['/x'] }], local)).toBe(local);
  });

  it("uses the extension's access, built on the local one", () => {
    const signedIn = { ...local, signedIn: () => true };
    expect(accessWith([{ access: () => signedIn }], local)).toBe(signedIn);
  });

  it('refuses two extensions that both decide', () => {
    const both = [{ access: () => local }, { access: () => local }];
    expect(() => accessWith(both, local)).toThrow('Only one extension');
  });
});
