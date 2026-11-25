# @trayful/owner

Owner mode, as an extension of the server: for a Trayful on a server somewhere, used by one person. Whoever signs in with the owner secret is the host from anywhere, and their agents reach MCP with OAuth (authorization code with PKCE and dynamic client registration). `trayful play --owner` turns it on; see [docs/howto/host-your-own.md](../../docs/howto/host-your-own.md).

```ts
import { startServer } from '@trayful/server/public'; // trayful/server from npm
import { ownerMode } from '@trayful/owner';

const server = await startServer({
  projectDir: 'examples',
  extensions: [ownerMode(process.env.TRAYFUL_OWNER_SECRET!)],
});
```

It uses only the server's public API (`@trayful/server/public`, published as `trayful/server`), which `.dependency-cruiser.cjs` enforces: if owner mode works through that API, so can any other extension. `owner.ts` signs and checks tokens, `routes.ts` has the access hook and the sign-in page, `oauth.ts` the OAuth endpoints, and `pages.ts` the few pages it draws.

Test with `pnpm vitest run packages/owner`.
