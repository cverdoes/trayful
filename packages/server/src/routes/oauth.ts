// OAuth 2.1 for one person, so agents such as claude.ai's connectors can reach MCP in owner mode.
import type { FastifyReply, FastifyRequest } from 'fastify';
import { cookie } from '../play/access.js';
import type { OAuthClient, Owner } from '../play/owner.js';
import type { RouteContext } from './context.js';
import { allowPage, problemPage, sendPage } from './pages.js';

type Form = Record<string, string | undefined>;

/** Proves the browser signed in with the owner secret. */
export const OWNER_COOKIE = 'trayful_owner';

/**
 * The OAuth endpoints an MCP client finds and uses on its own: metadata (RFC 9728 and
 * RFC 8414), dynamic client registration (RFC 7591), and the authorization code flow
 * with PKCE. The owner allows each client once, on a page that asks for the secret.
 */
export function registerOAuthRoutes({ app }: RouteContext, owner: Owner): void {
  const resourceMetadata = (request: FastifyRequest) => ({
    resource: `${publicBase(request)}/mcp`,
    authorization_servers: [publicBase(request)],
    bearer_methods_supported: ['header'],
  });
  app.get('/.well-known/oauth-protected-resource', resourceMetadata);
  app.get('/.well-known/oauth-protected-resource/mcp', resourceMetadata);
  app.get('/.well-known/oauth-authorization-server', (request) =>
    serverMetadata(publicBase(request)),
  );

  app.post('/oauth/register', async (request, reply) => {
    const body = (request.body ?? {}) as { client_name?: unknown; redirect_uris?: unknown };
    const redirectUris = body.redirect_uris;
    if (
      !Array.isArray(redirectUris) ||
      !redirectUris.length ||
      !redirectUris.every(isRedirectUri)
    ) {
      return reply.code(400).send({
        error: 'invalid_redirect_uri',
        error_description: 'Give redirect_uris: https addresses, or http on localhost.',
      });
    }
    const name = typeof body.client_name === 'string' ? body.client_name.slice(0, 100) : 'An agent';
    const client = { name, redirectUris: redirectUris as string[] };
    return reply.code(201).send({
      client_id: owner.registerClient(client),
      client_name: client.name,
      redirect_uris: client.redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    });
  });

  app.get('/oauth/authorize', async (request, reply) => {
    const params = request.query as Form;
    const problem = authorizationProblem(owner, params);
    if (problem) return sendPage(reply, problemPage(problem), 400);
    const asked = authorization(owner, params);
    return sendPage(reply, allowPage(pageFor(asked, request.server.access.signedIn(request))));
  });

  app.post('/oauth/authorize', async (request, reply) => {
    const form = (request.body ?? {}) as Form;
    const problem = authorizationProblem(owner, form);
    if (problem) return sendPage(reply, problemPage(problem), 400);
    const asked = authorization(owner, form);
    if (form.answer !== 'allow') {
      return reply.redirect(backTo(asked, { error: 'access_denied' }), 303);
    }
    const signedIn = request.server.access.signedIn(request);
    if (!signedIn && !owner.isSecret(form.secret ?? '')) {
      const page = allowPage({ ...pageFor(asked, false), error: 'That is not the owner secret.' });
      return sendPage(reply, page, 401);
    }
    // Typing the secret here signs this browser in too.
    if (!signedIn) void reply.header('set-cookie', cookie(OWNER_COOKIE, owner.webToken(), request));
    const code = owner.issueCode({
      clientId: asked.clientId,
      redirectUri: asked.redirectUri,
      challenge: asked.challenge,
    });
    return reply.redirect(backTo(asked, { code }), 303);
  });

  app.post('/oauth/token', async (request, reply) => {
    const form = (request.body ?? {}) as Form;
    const tokens = tokensFor(owner, form);
    // Tokens must never sit in a cache along the way.
    void reply.header('cache-control', 'no-store');
    if (!tokens) {
      return reply.code(400).send({
        error: form.grant_type === undefined ? 'invalid_request' : 'invalid_grant',
        error_description: 'The code or refresh token is not valid, or not for this client.',
      });
    }
    return tokens;
  });
}

/**
 * Tells an agent without a valid token where to get one (RFC 9728): it reads the
 * metadata, registers, sends the owner to the authorize page, and tries again.
 */
export function askForOwnerToken(request: FastifyRequest, reply: FastifyReply): FastifyReply {
  const metadata = `${publicBase(request)}/.well-known/oauth-protected-resource/mcp`;
  return reply
    .code(401)
    .header('www-authenticate', `Bearer resource_metadata="${metadata}"`)
    .send({ error: 'Sign in as the owner of this Trayful to use MCP.' });
}

function serverMetadata(base: string) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  };
}

/** A client's request to be let in, checked. */
interface Authorization {
  clientId: string;
  clientName: string;
  redirectUri: string;
  challenge: string;
  state: string | undefined;
  /** The parameters as they came, to carry through the page. */
  carried: Record<string, string>;
}

/**
 * What is wrong with an authorization request, if anything. Problems with the client
 * or its redirect address are shown on the page, never sent to that address, since it
 * may not be the client's.
 */
function authorizationProblem(owner: Owner, params: Form): string | undefined {
  const client = owner.client(params.client_id ?? '');
  if (!client) return 'This agent is not registered with this Trayful. Connect it again.';
  if (!client.redirectUris.includes(redirectUriOf(client, params))) {
    return 'The agent asked to be sent back to an address it did not register.';
  }
  if (params.response_type !== 'code') return 'Only the authorization code flow is supported.';
  if (!params.code_challenge || params.code_challenge_method !== 'S256') {
    return 'The agent must use PKCE with S256.';
  }
  return undefined;
}

/** An authorization request that `authorizationProblem` found nothing wrong with. */
function authorization(owner: Owner, params: Form): Authorization {
  const client = owner.client(params.client_id!)!;
  const carried: Record<string, string> = {};
  for (const name of CARRIED) {
    const value = params[name];
    if (value !== undefined) carried[name] = value;
  }
  return {
    clientId: params.client_id!,
    clientName: client.name,
    redirectUri: redirectUriOf(client, params),
    challenge: params.code_challenge!,
    state: params.state,
    carried,
  };
}

/** The address to send the answer to: the one asked for, or the client's only one. */
function redirectUriOf(client: OAuthClient, params: Form): string {
  return params.redirect_uri ?? client.redirectUris[0] ?? '';
}

/** The authorization request parameters the page sends back with the owner's answer. */
const CARRIED = [
  'client_id',
  'redirect_uri',
  'response_type',
  'code_challenge',
  'code_challenge_method',
  'state',
  'scope',
  'resource',
];

function pageFor(asked: Authorization, signedIn: boolean) {
  return {
    client: asked.clientName,
    redirectHost: new URL(asked.redirectUri).host,
    carried: asked.carried,
    signedIn,
  };
}

/** The client's redirect address with the answer, and its state, added. */
function backTo(asked: Authorization, answer: Record<string, string>): string {
  const url = new URL(asked.redirectUri);
  for (const [name, value] of Object.entries(answer)) url.searchParams.set(name, value);
  if (asked.state !== undefined) url.searchParams.set('state', asked.state);
  return url.toString();
}

function tokensFor(owner: Owner, form: Form) {
  const clientId = form.client_id ?? '';
  if (form.grant_type === 'authorization_code') {
    return owner.redeemCode(form.code ?? '', {
      clientId,
      redirectUri: form.redirect_uri ?? '',
      verifier: form.code_verifier ?? '',
    });
  }
  if (form.grant_type === 'refresh_token') return owner.refresh(form.refresh_token ?? '', clientId);
  return undefined;
}

/** Where agents are sent back to: https anywhere, or plain http to a program on their own computer. */
function isRedirectUri(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    if (url.hash) return false;
    return (
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    );
  } catch {
    return false;
  }
}

/**
 * The address people and agents reach this server at. Behind a proxy that ends HTTPS,
 * such as Caddy or a Cloudflare tunnel, the proxy says the original scheme.
 */
function publicBase(request: FastifyRequest): string {
  const proto = request.headers['x-forwarded-proto'];
  const scheme = (typeof proto === 'string' ? proto.split(',')[0]!.trim() : '') || 'http';
  return `${scheme}://${request.headers.host ?? 'localhost'}`;
}
