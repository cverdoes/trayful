import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Owner mode: a Trayful running on a server somewhere, used by one person, its owner.
 * There is no "this computer" there to trust, so the owner proves who they are with a
 * secret, and gets signed tokens in return: a cookie for the browser, and OAuth tokens
 * for agents such as Claude.
 *
 * Every token is signed with a key made from the secret, and the server keeps none of
 * them, so they survive a restart. Changing the secret signs everyone out.
 */
export class Owner {
  /** Long enough that guessing it is hopeless, so sign-in needs no attempt counter. */
  static readonly MIN_SECRET_LENGTH = 32;

  private readonly key: Buffer;
  private readonly secretHash: Buffer;
  private readonly codes = new Map<string, PendingCode>();

  constructor(
    secret: string,
    /** The clock, in milliseconds; tests move it. */
    private readonly now: () => number = Date.now,
  ) {
    if (secret.length < Owner.MIN_SECRET_LENGTH) {
      throw new OwnerError(
        `The owner secret must be at least ${Owner.MIN_SECRET_LENGTH} characters. Make one with \`openssl rand -hex 32\`.`,
      );
    }
    this.key = createHmac('sha256', secret).update('trayful-owner-v1').digest();
    this.secretHash = sha256(secret);
  }

  /** Whether someone typed or sent the owner secret. */
  isSecret(given: string): boolean {
    // Comparing hashes keeps the comparison the same length, and its time constant.
    return timingSafeEqual(sha256(given), this.secretHash);
  }

  /** Whether a credential proves the owner: a browser cookie, an access token, or the secret. */
  accepts(credential: string, kind: 'web' | 'access'): boolean {
    if (kind === 'access' && credential !== '' && this.isSecret(credential)) return true;
    return this.verify(credential, kind) !== undefined;
  }

  /** Whether a credential looks like one of this server's tokens, valid or not. */
  static isToken(credential: string): boolean {
    return credential.startsWith(TOKEN_PREFIX);
  }

  /** A browser's sign-in, good for as long as the cookie lives. */
  webToken(): string {
    return this.sign('web', WEB_TTL, '');
  }

  /**
   * Registers an OAuth client, such as claude.ai, and returns its id. The id carries
   * the client's name and redirect addresses, signed, so nothing needs storing.
   */
  registerClient(client: OAuthClient): string {
    const body = base64url(JSON.stringify(client));
    return `${CLIENT_PREFIX}${body}.${this.signature(`client.${body}`)}`;
  }

  /** The client an id was made for, or undefined if this server did not make it. */
  client(clientId: string): OAuthClient | undefined {
    if (!clientId.startsWith(CLIENT_PREFIX)) return undefined;
    const [body = '', signature = ''] = clientId.slice(CLIENT_PREFIX.length).split('.');
    if (!this.signed(`client.${body}`, signature)) return undefined;
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthClient;
  }

  /** A one-time code for a client the owner allowed in, to trade for tokens within a minute. */
  issueCode(grant: Omit<PendingCode, 'expires'>): string {
    this.forgetExpiredCodes();
    const code = randomBytes(24).toString('base64url');
    this.codes.set(code, { ...grant, expires: this.now() + CODE_TTL });
    return code;
  }

  /**
   * Trades a code for tokens, once. The client must be the one the code was for, ask
   * from the same redirect address, and prove with the PKCE verifier that it started
   * the sign-in, so a code caught on the way is no use to anyone else.
   */
  redeemCode(code: string, request: CodeRedemption): Tokens | undefined {
    const pending = this.codes.get(code);
    this.codes.delete(code);
    if (
      !pending ||
      pending.expires < this.now() ||
      pending.clientId !== request.clientId ||
      pending.redirectUri !== request.redirectUri ||
      base64url(sha256(request.verifier)) !== pending.challenge
    ) {
      return undefined;
    }
    return this.tokensFor(pending.clientId);
  }

  /** New tokens for a client holding a refresh token it was given. */
  refresh(refreshToken: string, clientId: string): Tokens | undefined {
    const subject = this.verify(refreshToken, 'refresh');
    return subject === clientId ? this.tokensFor(clientId) : undefined;
  }

  private tokensFor(clientId: string): Tokens {
    return {
      access_token: this.sign('access', ACCESS_TTL, clientId),
      token_type: 'Bearer',
      expires_in: ACCESS_TTL / 1000,
      refresh_token: this.sign('refresh', REFRESH_TTL, clientId),
    };
  }

  /** `tfo_<kind>.<expires>.<subject>.<signature>`; the subject is the client id, if any. */
  private sign(kind: TokenKind, ttl: number, subject: string): string {
    const body = `${kind}.${this.now() + ttl}.${base64url(subject)}`;
    return `${TOKEN_PREFIX}${body}.${this.signature(body)}`;
  }

  /** The subject of a token of this kind that this server signed and that has not expired. */
  private verify(token: string, kind: TokenKind): string | undefined {
    if (!Owner.isToken(token)) return undefined;
    const [tokenKind = '', expires = '', subject = '', signature = ''] = token
      .slice(TOKEN_PREFIX.length)
      .split('.');
    const body = `${tokenKind}.${expires}.${subject}`;
    if (tokenKind !== kind || !this.signed(body, signature)) return undefined;
    if (Number(expires) < this.now()) return undefined;
    return Buffer.from(subject, 'base64url').toString('utf8');
  }

  private signature(body: string): string {
    return createHmac('sha256', this.key).update(body).digest('base64url');
  }

  private signed(body: string, signature: string): boolean {
    const expected = Buffer.from(this.signature(body));
    const given = Buffer.from(signature);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  private forgetExpiredCodes(): void {
    const now = this.now();
    for (const [code, pending] of this.codes) if (pending.expires < now) this.codes.delete(code);
  }
}

export class OwnerError extends Error {}

/** What an OAuth client told us when it registered. */
export interface OAuthClient {
  name: string;
  redirectUris: string[];
}

/** A code handed to a client, waiting to be traded for tokens. */
interface PendingCode {
  clientId: string;
  redirectUri: string;
  /** The PKCE challenge: the base64url SHA-256 of a verifier only the client knows. */
  challenge: string;
  expires: number;
}

interface CodeRedemption {
  clientId: string;
  redirectUri: string;
  verifier: string;
}

/** The token response of RFC 6749, as the OAuth client reads it. */
export interface Tokens {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
}

type TokenKind = 'web' | 'access' | 'refresh';

const TOKEN_PREFIX = 'tfo_';
const CLIENT_PREFIX = 'tfc_';
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const CODE_TTL = MINUTE;
const ACCESS_TTL = 60 * MINUTE;
const REFRESH_TTL = 30 * DAY;
/** As long as the cookie it goes in (see `cookie`). */
const WEB_TTL = 365 * DAY;

function sha256(text: string): Buffer {
  return createHash('sha256').update(text).digest();
}

function base64url(data: string | Buffer): string {
  return Buffer.from(data).toString('base64url');
}
