import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { accessWith, spacesWith } from '../src/extension.js';
import { localAccess } from '../src/play/access.js';
import type { Space } from '../src/space.js';

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

describe('spacesWith', () => {
  const own = { url: 'own' } as Space;
  const other = { url: 'other' } as Space;
  const request = {} as FastifyRequest;

  it("serves every request from the server's own space by default", () => {
    expect(spacesWith([], own)(request)).toBe(own);
  });

  it("asks the extension that finds spaces, telling it the server's own", () => {
    const resolve = spacesWith([{ spaces: (given) => () => (given === own ? other : own) }], own);
    expect(resolve(request)).toBe(other);
  });

  it('refuses two extensions that both find spaces', () => {
    const both = [{ spaces: () => () => own }, { spaces: () => () => own }];
    expect(() => spacesWith(both, own)).toThrow('Only one extension');
  });
});
