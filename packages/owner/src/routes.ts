import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  INVITE_COOKIE,
  PLAYER_COOKIE,
  bearer,
  cookie,
  isHostRequest,
  parseCookies,
  type Access,
} from '@trayful/server';
import { Owner } from './owner.js';
import { OWNER_COOKIE, askForOwnerToken, registerOAuthRoutes } from './oauth.js';
import { sendPage, signInPage } from './pages.js';

/**
 * Owner mode's access: requests from this computer still count as the host, and so
 * does the owner from anywhere, by the browser's cookie or an agent's token.
 */
export function ownerAccess(owner: Owner, local: Access): Access {
  return {
    fromHostComputer: local.fromHostComputer,
    signedIn: (request) => {
      const signedInCookie = parseCookies(request.headers.cookie)[OWNER_COOKIE];
      return (
        (signedInCookie !== undefined && owner.accepts(signedInCookie, 'web')) ||
        owner.accepts(bearer(request), 'access')
      );
    },
    issued: (credential) => Owner.isToken(credential),
    refuseMcp: askForOwnerToken,
  };
}

/**
 * Owner mode's routes: signing a browser in with the owner secret, and OAuth for the
 * owner's agents.
 */
export function registerOwnerRoutes(app: FastifyInstance, owner: Owner): void {
  // The sign-in and authorize pages post plain HTML forms.
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body, done) => done(null, Object.fromEntries(new URLSearchParams(body as string))),
  );

  // Someone opening the table with no way in is asked to sign in, rather than shown a
  // table they cannot join. Playtesters come with an invite, and are let through.
  app.addHook('onRequest', async (request, reply) => {
    if (request.method !== 'GET' || request.url.split('?')[0] !== '/') return;
    if (isHostRequest(request) || hasGuestCookie(request)) return;
    return reply.redirect('/sign-in');
  });

  app.get('/sign-in', async (request, reply) => {
    const next = safeNext((request.query as { next?: string }).next);
    if (isHostRequest(request)) return reply.redirect(next);
    return sendPage(reply, signInPage({ next }));
  });

  app.post('/sign-in', async (request, reply) => {
    const form = (request.body ?? {}) as { secret?: string; next?: string };
    const next = safeNext(form.next);
    if (!owner.isSecret(form.secret ?? '')) {
      return sendPage(reply, signInPage({ next, error: 'That is not the owner secret.' }), 401);
    }
    return reply
      .header('set-cookie', cookie(OWNER_COOKIE, owner.webToken(), request))
      .redirect(next, 303);
  });

  registerOAuthRoutes(app, owner);
}

function hasGuestCookie(request: FastifyRequest): boolean {
  const header = request.headers.cookie ?? '';
  return [INVITE_COOKIE, PLAYER_COOKIE].some((name) => header.includes(`${name}=`));
}

/** A page on this server to go to after signing in; never another website. */
function safeNext(next: string | undefined): string {
  return next?.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
}
