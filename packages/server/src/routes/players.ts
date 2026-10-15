import { addToken, caller, cookie, INVITE_COOKIE, PLAYER_COOKIE } from '../access.js';
import { tableKey } from '../players.js';
import { NOT_INVITED, type RouteContext, type TableQuery } from './context.js';

/** Joining, renaming and invites. */
export function registerPlayerRoutes(ctx: RouteContext): void {
  registerMe(ctx);
  registerInvites(ctx);
}

/** Who the caller is, renaming themselves, and joining as a guest. */
function registerMe({ app, players, workspace, identify }: RouteContext): void {
  app.get('/api/me', async (request) => {
    const { who, player } = await identify(request);
    return { player, host: who.local, invited: who.invited, joined: who.player !== undefined };
  });
  app.post<{ Body: { name?: string } | undefined }>('/api/me', async (request, reply) => {
    const { player } = await identify(request);
    if (!player) return reply.code(403).send({ error: 'Join the table first.' });
    return { player: await workspace.renamePlayer(player.id, request.body?.name ?? '') };
  });
  app.post<{ Body: { name?: string } | undefined }>('/api/join', async (request, reply) => {
    const who = caller(request, players);
    if (!who.invited) return reply.code(403).send({ error: NOT_INVITED });
    let player = who.player;
    if (player) player = await workspace.renamePlayer(player.id, request.body?.name ?? '');
    else {
      const joined = await players.join(request.body?.name ?? '', 'guest');
      player = joined.player;
      void reply.header(
        'set-cookie',
        cookie(PLAYER_COOKIE, `${player.id}:${joined.secret}`, request),
      );
    }
    // Joined guests keep their tables even when an invite is renewed later.
    await players.grant(player.id, who.tables);
    return { player };
  });
}

/** Invite links: following one, and the host making or renewing one. */
function registerInvites({
  app,
  players,
  workspace,
  target,
  hostOnly,
  linksFor,
}: RouteContext): void {
  app.get<{ Params: { token: string } }>('/join/:token', async (request, reply) => {
    const invite = players.byToken(request.params.token);
    if (!invite) {
      return reply
        .code(403)
        .type('text/plain')
        .send('This invite link is not valid any more. Ask the host for a new one.');
    }
    const who = caller(request, players);
    if (who.player) await players.grant(who.player.id, [tableKey(invite.project, invite.table)]);
    const query = new URLSearchParams({ project: invite.project, table: invite.table });
    // Someone who has not joined yet picks a name first.
    const join = who.player ? '' : '&join';
    return reply
      .header('set-cookie', cookie(INVITE_COOKIE, addToken(who.tokens, invite.token), request))
      .redirect(`/?${query.toString()}${join}`);
  });
  // The invite link to a table, made on first use; `renew` replaces it, so old links stop working.
  app.post<{ Body: (TableQuery & { renew?: boolean }) | undefined }>(
    '/api/invites',
    async (request, reply) => {
      if (hostOnly(request, reply)) return;
      const { project, table } = target(request.body ?? {});
      await workspace.table(project, table, { create: false });
      const invite = await players.invite(project, table, request.body?.renew === true);
      return { project, table, links: linksFor(invite) };
    },
  );
}
