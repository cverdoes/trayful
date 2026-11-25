import { cp, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import {
  StreamableHTTPClientTransport,
  type StreamableHTTPClientTransportOptions,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { startServer, type RunningServer } from '@trayful/server/public';
import { ownerMode } from '../src/index.js';

const SECRET = 'owner-secret-'.padEnd(40, 'x');
/** Requests through the proxy in front of a hosted Trayful: from elsewhere, so not the host. */
const REMOTE = { 'x-forwarded-for': '203.0.113.9' };
const CALLBACK = 'https://claude.example/callback';

let server: RunningServer;

beforeEach(async () => {
  const dir = path.join(await mkdtemp(path.join(os.tmpdir(), 'trayful-owner-')), 'game');
  await cp(fileURLToPath(new URL('../../../examples/harvest-moon', import.meta.url)), dir, {
    recursive: true,
    filter: (src) => path.basename(src) !== 'tables',
  });
  server = await startServer({
    projectDir: dir,
    port: 0,
    appDir: path.join(dir, 'no-app'),
    extensions: [ownerMode(SECRET)],
  });
});

afterEach(async () => {
  await server.close();
});

/** What a test sends: a request with plain headers. */
interface Sent {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/** A request from elsewhere, as a browser on the owner's page sends it. */
function fromBrowser(route: string, init: Sent = {}) {
  return fetch(`${server.url}${route}`, {
    redirect: 'manual',
    ...init,
    headers: { ...REMOTE, origin: server.url, ...init.headers },
  });
}

function form(fields: Record<string, string>): Sent {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  };
}

/** Whether the server takes a request's sender for the host. */
async function isHost(reply: Response): Promise<boolean> {
  return ((await reply.json()) as { host: boolean }).host;
}

/** Signs a browser in and returns its cookie. */
async function signIn(): Promise<string> {
  const reply = await fromBrowser('/sign-in', form({ secret: SECRET, next: '/?table=t' }));
  expect(reply.status).toBe(303);
  expect(reply.headers.get('location')).toBe('/?table=t');
  return reply.headers.get('set-cookie')!.split(';')[0]!;
}

/**
 * An MCP client as claude.ai runs one: it finds the OAuth endpoints, registers, sends the
 * owner to the authorize page, and gets the code back at its callback address.
 */
class AgentAuth implements OAuthClientProvider {
  private client?: OAuthClientInformationMixed;
  private saved?: OAuthTokens;
  private verifier = '';
  /** Where the owner's answer sent the browser. */
  answered?: URL;

  constructor(private readonly answer: (authorize: URL) => Promise<Response>) {}

  get redirectUrl() {
    return CALLBACK;
  }
  get clientMetadata() {
    return { client_name: 'Claude', redirect_uris: [CALLBACK] };
  }
  clientInformation() {
    return this.client;
  }
  saveClientInformation(info: OAuthClientInformationMixed) {
    this.client = info;
  }
  tokens() {
    return this.saved;
  }
  saveTokens(tokens: OAuthTokens) {
    this.saved = tokens;
  }
  async redirectToAuthorization(url: URL) {
    const reply = await this.answer(url);
    this.answered = new URL(reply.headers.get('location')!);
  }
  saveCodeVerifier(verifier: string) {
    this.verifier = verifier;
  }
  codeVerifier() {
    return this.verifier;
  }
}

/** The owner answers the authorize page, typing the secret, as the page's form posts it. */
function ownerAnswers(answer: 'allow' | 'deny', secret = SECRET) {
  return async (authorize: URL) => {
    const page = await fromBrowser(`${authorize.pathname}${authorize.search}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Let Claude use Trayful?');
    const fields = Object.fromEntries(authorize.searchParams);
    return fromBrowser('/oauth/authorize', form({ ...fields, answer, secret }));
  };
}

/** Connects an agent from elsewhere; the first try sends the owner to sign in. */
async function connectAgent(auth: AgentAuth): Promise<Client> {
  const options: StreamableHTTPClientTransportOptions = {
    authProvider: auth,
    requestInit: { headers: REMOTE },
  };
  const url = new URL(`${server.url}/mcp`);
  const first = new StreamableHTTPClientTransport(url, options);
  await expect(new Client({ name: 'agent', version: '0' }).connect(first)).rejects.toThrow(
    UnauthorizedError,
  );
  const code = auth.answered?.searchParams.get('code');
  if (!code) throw new Error(`The owner did not let the agent in: ${String(auth.answered)}`);
  await first.finishAuth(code);
  const client = new Client({ name: 'agent', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(url, options));
  return client;
}

describe('owner mode', () => {
  it('asks people without a way in to sign in, and lets the owner be the host', async () => {
    const anonymous = await fromBrowser('/');
    expect(anonymous.status).toBe(302);
    expect(anonymous.headers.get('location')).toBe('/sign-in');
    expect(await isHost(await fromBrowser('/api/me'))).toBe(false);

    const cookie = await signIn();
    expect(await isHost(await fromBrowser('/api/me', { headers: { cookie } }))).toBe(true);
    // The owner may do what only the host may, such as making invite links.
    const invite = await fromBrowser('/api/invites', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(invite.status).toBe(200);
  });

  it('turns away a wrong secret', async () => {
    const reply = await fromBrowser(
      '/sign-in',
      form({ secret: 'guess', next: 'https://evil.example' }),
    );
    expect(reply.status).toBe(401);
    expect(await reply.text()).toContain('That is not the owner secret.');
    expect(reply.headers.get('set-cookie')).toBeNull();
    expect(reply.headers.get('x-frame-options')).toBe('DENY');
  });

  it('never sends a signed-in browser to another website', async () => {
    const reply = await fromBrowser('/sign-in', form({ secret: SECRET, next: '//evil.example' }));
    expect(reply.headers.get('location')).toBe('/');
  });

  it('lets guests with an invite through to the table', async () => {
    const { projectId, tableName } = server.session;
    const invite = await server.workspace.players.invite(projectId, tableName);
    const join = await fromBrowser(`/join/${invite.token}`);
    const cookie = join.headers.get('set-cookie')!.split(';')[0]!;
    expect((await fromBrowser('/', { headers: { cookie } })).status).not.toBe(302);
  });

  it('runs as usual on this computer', async () => {
    expect(await isHost(await fetch(`${server.url}/api/me`))).toBe(true);
    expect((await fetch(`${server.url}/`, { redirect: 'manual' })).status).not.toBe(302);
  });

  it('tells agents without a token where to get one', async () => {
    const reply = await fetch(`${server.url}/mcp`, { method: 'POST', headers: REMOTE });
    expect(reply.status).toBe(401);
    expect(reply.headers.get('www-authenticate')).toBe(
      `Bearer resource_metadata="${server.url}/.well-known/oauth-protected-resource/mcp"`,
    );
    const resource = await (
      await fetch(`${server.url}/.well-known/oauth-protected-resource/mcp`)
    ).json();
    expect(resource).toMatchObject({
      resource: `${server.url}/mcp`,
      authorization_servers: [server.url],
    });
  });

  it('lets an agent the owner allows use MCP, with OAuth', async () => {
    const auth = new AgentAuth(ownerAnswers('allow'));
    const client = await connectAgent(auth);
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toContain('draw');
    await client.close();
  });

  it('sends the agent away when the owner denies it', async () => {
    const auth = new AgentAuth(ownerAnswers('deny'));
    await expect(connectAgent(auth)).rejects.toThrow('did not let the agent in');
    expect(auth.answered?.searchParams.get('error')).toBe('access_denied');
  });

  it('asks again for the secret when it is wrong', async () => {
    let page = '';
    const auth = new AgentAuth(async (authorize) => {
      const fields = Object.fromEntries(authorize.searchParams);
      const reply = await fromBrowser(
        '/oauth/authorize',
        form({ ...fields, answer: 'allow', secret: 'guess' }),
      );
      page = await reply.text();
      return reply;
    });
    await expect(connectAgent(auth)).rejects.toThrow();
    expect(page).toContain('That is not the owner secret.');
  });

  it('takes the owner secret as a bearer token, for clients that send a header', async () => {
    const client = new Client({ name: 'agent', version: '0' });
    const headers = { ...REMOTE, authorization: `Bearer ${SECRET}` };
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${server.url}/mcp`), { requestInit: { headers } }),
    );
    expect((await client.listTools()).tools.length).toBeGreaterThan(0);
    await client.close();
  });

  it('refuses to authorize for an agent it does not know, or another address', async () => {
    const unknown = await fromBrowser('/oauth/authorize?client_id=nope&response_type=code');
    expect(unknown.status).toBe(400);
    expect(await unknown.text()).toContain('not registered');

    const registered = await fetch(`${server.url}/oauth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://claude.example' },
      body: JSON.stringify({ client_name: 'Claude', redirect_uris: [CALLBACK] }),
    });
    expect(registered.status).toBe(201);
    const { client_id } = (await registered.json()) as { client_id: string };
    const elsewhere = new URLSearchParams({
      client_id,
      redirect_uri: 'https://evil.example/cb',
      response_type: 'code',
      code_challenge: 'c',
      code_challenge_method: 'S256',
    });
    const reply = await fromBrowser(`/oauth/authorize?${elsewhere.toString()}`);
    expect(reply.status).toBe(400);
    expect(await reply.text()).toContain('did not register');
  });

  it('registers only agents that come back over https or to their own computer', async () => {
    const register = (redirect_uris: unknown) =>
      fetch(`${server.url}/oauth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ redirect_uris }),
      });
    expect((await register(['http://evil.example/cb'])).status).toBe(400);
    expect((await register([])).status).toBe(400);
    expect((await register(['http://localhost:3000/cb'])).status).toBe(201);
  });

  it('refuses a token request without a valid code', async () => {
    const reply = await fetch(
      `${server.url}/oauth/token`,
      form({ grant_type: 'authorization_code', code: 'x' }),
    );
    expect(reply.status).toBe(400);
    expect(await reply.json()).toMatchObject({ error: 'invalid_grant' });
    expect(reply.headers.get('cache-control')).toBe('no-store');
  });
});
