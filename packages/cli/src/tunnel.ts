import { spawn } from 'node:child_process';

export interface Tunnel {
  /** The public https address, such as `https://some-words.trycloudflare.com`. */
  url: string;
  close(): void;
}

export class TunnelError extends Error {}

const QUICK_TUNNEL = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/;

/**
 * Opens a Cloudflare quick tunnel to a local port, so people elsewhere can reach the
 * table without opening the network. Needs `cloudflared` installed; no account is
 * needed. `TRAYFUL_CLOUDFLARED` names another program to run instead.
 */
export function startTunnel(
  port: number,
  { command = process.env.TRAYFUL_CLOUDFLARED ?? 'cloudflared', timeoutMs = 30_000 } = {},
): Promise<Tunnel> {
  const child = spawn(command, ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const close = () => {
    if (child.exitCode === null) child.kill();
  };
  return new Promise<Tunnel>((resolve, reject) => {
    let output = '';
    const fail = (message: string) => {
      clearTimeout(timer);
      close();
      reject(new TunnelError(message));
    };
    const timer = setTimeout(
      () => fail(`cloudflared did not report a tunnel address in time.\n${output.slice(-1000)}`),
      timeoutMs,
    );
    const read = (data: Buffer) => {
      output += String(data);
      const url = QUICK_TUNNEL.exec(output)?.[0];
      if (url) {
        clearTimeout(timer);
        child.stdout.off('data', read);
        child.stderr.off('data', read);
        // Keep draining its log so the pipes never fill up and block it.
        child.stdout.resume();
        child.stderr.resume();
        resolve({ url, close });
      }
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.once('error', (err: NodeJS.ErrnoException) =>
      fail(
        err.code === 'ENOENT'
          ? `--tunnel needs cloudflared, which is not installed. Get it from ` +
              `https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ ` +
              `(no account needed), or use --share on a local network.`
          : `Could not start cloudflared: ${err.message}`,
      ),
    );
    child.once('exit', (code) =>
      fail(`cloudflared stopped (exit code ${code}).\n${output.slice(-1000)}`),
    );
  });
}
