---
title: Extending the server
kind: contributing
order: 5
summary: The three hooks an extension can fill, what `trayful/server` promises, and how code in another repository builds on it.
---

Run as usual, Trayful has one host: whoever sits at the computer running it. Everything else, such as signing in to a Trayful on a server, serving many people from one process, or capping what each may use, is an **extension**: an object handed to [[server:startServer]] in `extensions`. Without one, nothing changes.

Owner mode ([[owner/index.ts]], the `@trayful/owner` package, switched on by `trayful play --owner`) is the extension that ships with Trayful. It uses only what `trayful/server` exports, and dependency-cruiser holds it to that, so whatever it can do, an extension in another repository can do too.

## The hooks

An [[server:Extension]] fills in any of these. Each hook may be filled by one extension only; two that both try stop the server at start.

- **`access`**: who counts as the host. It gets the [[server:Access]] Trayful would use on its own (a request from this computer is the host, see [[server:localAccess]]) and returns the one to use instead. Owner mode wraps it so that a signed-in owner is the host from anywhere, MCP clients are sent through OAuth, and its own tokens are accepted.
- **`spaces`**: which [[server:Space]] a request is for. A space is one base folder of projects with everything that belongs to it: its [[server:Workspace]], players, repository, invite addresses, sockets and engine knocks. On its own Trayful has one space; a [[server:SpaceResolver]] can pick another for each request, such as by subdomain, and build them with [[server:openSpace]].
- **`limits`**: how far a space may grow. Before something grows (an agent connects, a project or table is created, an invite is made, a file is added, a repository is connected) Trayful asks [[server:Limits]] with the [[server:Growth]]. An answer of a message refuses it: the person sees the message and the request gets a 403. Locally nothing is ever refused.

Besides the hooks, `register` adds routes of an extension's own, and `tokenRoutes` names the ones that take a bearer token instead of a cookie, so the cross-site guard lets them through.

## What `trayful/server` promises

`packages/server/src/public.ts` is the whole public API. The npm package publishes it as `trayful/server`, bundled with the CLI so both share one copy of the server, with type declarations in `server/index.d.ts`. [[npm:rollup]] with [[npm:rollup-plugin-dts]] bundles those into one file, taking in the types of core and formats, which are not published on their own. Types from Fastify and zod stay imports there, since copying in their own declarations would be large and fragile. The package lists both as optional peer dependencies, at the versions it bundles: npm never installs them by itself, but an extension that type-checks installs them as dev dependencies at those versions, so its types match the code that runs. Without them, `skipLibCheck` turns those types into `any`.

`packages/server/public-api.md` lists every exported declaration. It is generated (`pnpm api`) and `pnpm check` fails when it is out of date, so a pull request that changes the API shows it in that file. Add to the API only when an extension needs something, and note every change in CHANGELOG.md. While Trayful is at 0.x, a minor version may change it.

## Building on it from another repository

An extension in its own repository depends on an exact version of the `trayful` npm package and imports from `trayful/server`. Dependabot raises that version, and its tests show whether the new one still fits. To try a change before it is released, install a `next` prerelease (see [Releasing](releasing.md)), or link a local build with `pnpm link`.

[examples/extension](https://github.com/cverdoes/trayful/tree/main/examples/extension) is a small one. CI type-checks it against the packed package's declarations and runs it there, so a change that would break an extension in another repository fails here first.
