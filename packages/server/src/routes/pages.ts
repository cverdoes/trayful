// The few pages the server draws itself, in owner mode: signing in, and letting an agent in.
import type { FastifyReply } from 'fastify';

/** Hidden form fields that carry a request through a page and back. */
type Carried = Record<string, string>;

interface SignInPage {
  /** Where to go once signed in. */
  next: string;
  error?: string;
}

/** Asks for the owner secret, to sign this browser in. */
export function signInPage({ next, error }: SignInPage): string {
  return page(
    'Sign in to Trayful',
    `<h1>Sign in to Trayful</h1>
    <p>This Trayful belongs to one person. Enter the owner secret to use it.</p>
    ${errorLine(error)}
    <form method="post" action="/sign-in">
      ${hidden({ next })}
      ${secretField()}
      <div class="buttons"><button type="submit" class="primary">Sign in</button></div>
    </form>
    <p class="small">Playtesters don't sign in: they join with an invite link from the owner.</p>`,
  );
}

interface AllowPage {
  /** The name the agent registered with, as it gave it. */
  client: string;
  /** Where the agent is sent back to. */
  redirectHost: string;
  /** The authorization request, sent back with the answer. */
  carried: Carried;
  /** Whether this browser is already signed in, so the secret is not needed again. */
  signedIn: boolean;
  error?: string;
}

/** Asks the owner whether an agent such as Claude may use this Trayful. */
export function allowPage({ client, redirectHost, carried, signedIn, error }: AllowPage): string {
  return page(
    'Let an agent in',
    `<h1>Let ${escape(client)} use Trayful?</h1>
    <p>It will be able to do anything you can: open, change and play every project and table on this server.</p>
    <p class="small">You will be sent back to <strong>${escape(redirectHost)}</strong>.</p>
    ${errorLine(error)}
    <form method="post" action="/oauth/authorize">
      ${hidden(carried)}
      ${signedIn ? '' : secretField()}
      <div class="buttons">
        <button type="submit" name="answer" value="deny">Deny</button>
        <button type="submit" name="answer" value="allow" class="primary">Allow</button>
      </div>
    </form>`,
  );
}

/** A request that cannot go on, and why. */
export function problemPage(problem: string): string {
  return page('Trayful', `<h1>That didn't work</h1>${errorLine(problem)}`);
}

/** Sends a page that other websites may not show inside their own, to trick a click. */
export function sendPage(reply: FastifyReply, html: string, status = 200): FastifyReply {
  return reply
    .code(status)
    .type('text/html; charset=utf-8')
    .header('x-frame-options', 'DENY')
    .header(
      'content-security-policy',
      "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    )
    .header('cache-control', 'no-store')
    .send(html);
}

function secretField(): string {
  return `<label>Owner secret
        <input type="password" name="secret" autocomplete="current-password" required autofocus>
      </label>`;
}

function errorLine(error: string | undefined): string {
  return error ? `<p class="error" role="alert">${escape(error)}</p>` : '';
}

function hidden(fields: Carried): string {
  return Object.entries(fields)
    .map(([name, value]) => `<input type="hidden" name="${escape(name)}" value="${escape(value)}">`)
    .join('');
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>${STYLE}</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

/** The brand's parchment, walnut and forest; the app's own styles are not loaded here. */
const STYLE = `
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4ecd8;
  color: #3b2a1e; font: 16px/1.5 system-ui, sans-serif; }
main { width: min(26rem, calc(100vw - 2rem)); background: #fffaf0; border-radius: 12px;
  padding: 1.5rem 1.75rem; box-shadow: 0 2px 12px rgb(59 42 30 / 0.15); }
h1 { font-size: 1.3rem; margin: 0 0 0.75rem; }
label { display: grid; gap: 0.35rem; font-weight: 600; margin: 1rem 0; }
input { font: inherit; padding: 0.5rem 0.6rem; border: 1px solid #b9a98e; border-radius: 6px; }
.buttons { display: flex; gap: 0.5rem; justify-content: flex-end; }
button { font: inherit; padding: 0.45rem 1rem; border-radius: 6px; border: 1px solid #b9a98e;
  background: #fffaf0; color: inherit; cursor: pointer; }
button.primary { background: #2f5d3a; border-color: #2f5d3a; color: #fff; }
.error { color: #9c3b2b; font-weight: 600; }
.small { font-size: 0.875rem; color: #6b5a48; }
`;

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
