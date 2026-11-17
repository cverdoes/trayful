import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Owner } from '../../src/play/owner.js';

const SECRET = 'a'.repeat(32);
const CLIENT = { name: 'Claude', redirectUris: ['https://claude.ai/api/mcp/auth_callback'] };
const VERIFIER = 'a-verifier-only-the-client-knows-1234567890';
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

/** An owner whose clock the test moves, in minutes. */
function ownerWithClock() {
  let minutes = 0;
  const owner = new Owner(SECRET, () => minutes * 60_000);
  return { owner, wait: (m: number) => (minutes += m) };
}

/** Lets a client in and trades the code for tokens, as the OAuth flow does. */
function signIn(owner: Owner) {
  const clientId = owner.registerClient(CLIENT);
  const redirectUri = CLIENT.redirectUris[0]!;
  const code = owner.issueCode({ clientId, redirectUri, challenge: CHALLENGE });
  return {
    clientId,
    code,
    tokens: owner.redeemCode(code, { clientId, redirectUri, verifier: VERIFIER }),
  };
}

describe('Owner', () => {
  it('refuses a secret too short to be safe', () => {
    expect(() => new Owner('short')).toThrow('at least 32 characters');
  });

  it('knows its secret', () => {
    const owner = new Owner(SECRET);
    expect(owner.isSecret(SECRET)).toBe(true);
    expect(owner.isSecret(`${SECRET}b`)).toBe(false);
    expect(owner.isSecret('')).toBe(false);
  });

  it('signs a browser in with a cookie only it can make', () => {
    const owner = new Owner(SECRET);
    const web = owner.webToken();
    expect(owner.accepts(web, 'web')).toBe(true);
    // A web cookie is not an agent's token, and another server's secret makes other tokens.
    expect(owner.accepts(web, 'access')).toBe(false);
    expect(new Owner('b'.repeat(32)).accepts(web, 'web')).toBe(false);
    expect(owner.accepts(`${web}x`, 'web')).toBe(false);
  });

  it('takes the secret itself as an agent token', () => {
    const owner = new Owner(SECRET);
    expect(owner.accepts(SECRET, 'access')).toBe(true);
    expect(owner.accepts(SECRET, 'web')).toBe(false);
    expect(owner.accepts('', 'access')).toBe(false);
  });

  it('keeps registered clients in their signed ids', () => {
    const owner = new Owner(SECRET);
    const id = owner.registerClient(CLIENT);
    expect(owner.client(id)).toEqual(CLIENT);
    expect(new Owner('b'.repeat(32)).client(id)).toBeUndefined();
    expect(owner.client('someone-else')).toBeUndefined();
  });

  it('trades a code for tokens once, with the right verifier', () => {
    const { owner } = ownerWithClock();
    const { clientId, code, tokens } = signIn(owner);
    expect(tokens).toMatchObject({ token_type: 'Bearer', expires_in: 3600 });
    expect(owner.accepts(tokens!.access_token, 'access')).toBe(true);
    const redirectUri = CLIENT.redirectUris[0]!;
    expect(owner.redeemCode(code, { clientId, redirectUri, verifier: VERIFIER })).toBeUndefined();
  });

  it('gives no tokens for a wrong verifier, client or redirect address', () => {
    const { owner } = ownerWithClock();
    const clientId = owner.registerClient(CLIENT);
    const redirectUri = CLIENT.redirectUris[0]!;
    const grant = { clientId, redirectUri, challenge: CHALLENGE };
    const tries = [
      { clientId, redirectUri, verifier: 'wrong' },
      { clientId: 'other', redirectUri, verifier: VERIFIER },
      { clientId, redirectUri: 'https://evil.example/cb', verifier: VERIFIER },
    ];
    for (const attempt of tries) {
      expect(owner.redeemCode(owner.issueCode(grant), attempt)).toBeUndefined();
    }
  });

  it('lets codes and access tokens expire, and refreshes with the refresh token', () => {
    const { owner, wait } = ownerWithClock();
    const clientId = owner.registerClient(CLIENT);
    const redirectUri = CLIENT.redirectUris[0]!;
    const late = owner.issueCode({ clientId, redirectUri, challenge: CHALLENGE });
    wait(2);
    expect(owner.redeemCode(late, { clientId, redirectUri, verifier: VERIFIER })).toBeUndefined();

    const { tokens } = signIn(owner);
    wait(61);
    expect(owner.accepts(tokens!.access_token, 'access')).toBe(false);
    // Only the client the refresh token was for may use it, and never as an access token.
    expect(owner.accepts(tokens!.refresh_token, 'access')).toBe(false);
    expect(owner.refresh(tokens!.refresh_token, 'other')).toBeUndefined();
    const renewed = owner.refresh(tokens!.refresh_token, clientId);
    expect(owner.accepts(renewed!.access_token, 'access')).toBe(true);
    wait(31 * 24 * 60);
    expect(owner.refresh(renewed!.refresh_token, clientId)).toBeUndefined();
  });

  it('tells its tokens from other credentials', () => {
    expect(Owner.isToken(new Owner(SECRET).webToken())).toBe(true);
    expect(Owner.isToken('player-1:secret')).toBe(false);
  });
});
