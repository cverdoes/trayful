import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { git } from '../../src/git/git.js';

/** A server that turns everyone away, as GitHub does without the right token. */
let server: Server;
let url: string;

beforeAll(async () => {
  process.env.NO_PROXY = '127.0.0.1';
  process.env.no_proxy = '127.0.0.1';
  server = createServer((_request, response) => {
    response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="git"' }).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/me/game.git`;
});

afterAll(() => {
  server.close();
});

describe('git', () => {
  it('says a private repository needs a token', async () => {
    await expect(git(['ls-remote', url], { cwd: os.tmpdir() })).rejects.toThrow(
      /needs a token: start Trayful with TRAYFUL_GIT_TOKEN/,
    );
  });

  it('says when the token was refused, without repeating it', async () => {
    const run = git(['ls-remote', url], { cwd: os.tmpdir(), token: 'secret-token' });
    await expect(run).rejects.toThrow(/refused the token in TRAYFUL_GIT_TOKEN/);
    await expect(run).rejects.not.toThrow(/secret-token/);
  });
});
