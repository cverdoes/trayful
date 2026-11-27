# Project cap (example extension)

A small extension for the Trayful server, written against `trayful/server`: a Trayful whose folder holds at most a few projects. **New project…** past the cap is refused with a message saying why, and everything else works as usual.

It fills the limits hook, which Trayful asks before anything grows: an agent connecting, a new project or table, an invite, a file, a repository. A hosted Trayful can price tiers the same way: count what a folder holds, and refuse what would take it past what its owner pays for. [Extending the server](../../architecture/extending.md) explains the hooks.

## Run it

You need Node.js 22.18 or newer, which runs TypeScript files as they are. Copy this folder somewhere, then:

```sh
npm install
npm start -- path/to/games 2
```

To type-check it, also install TypeScript and the packages whose types `trayful/server` names. `trayful`'s `package.json` lists them, with their versions, as optional peer dependencies: `fastify` and `zod`.

That plays the folder of projects `path/to/games`, allowing at most 2 of them. Open the address it prints.

`trayful/server` comes with the `trayful` package from 0.4.0 on. `package.json` asks for an exact version: while Trayful is at 0.x a minor version may change `trayful/server`, so raise it on purpose (Dependabot can open the pull request) and run the test. To try a change before it is released, ask for `trayful@next` instead.

## Test it

`test/extension.test.ts` starts a server with the cap and checks that the project past it is refused. The repository's CI also runs this extension against the packed npm package, so a change to `trayful/server` that would break an extension shows up before it is released.
