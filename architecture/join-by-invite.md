---
title: A friend joins through an invite link
kind: interaction
order: 6
summary: Who may see and play which table, from the host's invite to the guest's first view.
---

Only the host, on the computer running Trayful, can do everything. Anyone else needs an invite link to one table, and a name, before they can play it.

## Steps

1. **The host makes a link.** The Invite dialog ([[app:InviteDialog]]) asks [[route:POST /api/invites]] for the table's link. The route is host-only. [[server:Players|Players.invite]] makes a token for the table, kept in `.trayful/players.json` by [[server:FilePlayerStore]]. The links use the addresses others can reach the server at: the local network with `--share`, or a Cloudflare tunnel with `--tunnel` ([[cli/tunnel.ts]]).
2. **The guest follows it.** [[route:GET /join/:token]] checks the token, stores it in an invite cookie ([[server/play/access.ts]]), and redirects to the table with `?join`.
3. **The guest picks a name.** [[app:start]] finds an invite but no player, so the app shows [[app:JoinScreen]]. Joining calls [[app:join]], which posts to [[route:POST /api/join]]. The server makes a guest player, proves who they are from now on with a player cookie holding a secret, and grants them the table from the invite.
4. **Every request is identified.** For each request the route context's `identify` uses [[server:caller]] to work out who is asking: the host when the request comes from this computer, otherwise the player in the cookie and the tables their invites allow ([[server:allowed]]).
5. **The guest connects.** The WebSocket at [[route:GET /ws]] also checks the page's origin ([[server:isTrustedOrigin]]), so other websites in the guest's browser cannot drive the table. The session subscribes the guest as their player and tells everyone who is at the table with a [[message:players]] message.
6. **The guest gets their own view**, with their hand and nobody else's ([[concept:draw-into-a-hand]]).

## Roles

- [[server/play/access.ts]] and [[server/play/players.ts]] decide who is who and what they may open.
- [[server/routes/players.ts]] is the HTTP side of joining and invites.
- [[core]] knows nothing of invites: it only sees player ids on commands.
