# Architecture pages

The hand-written half of the architecture overview. `pnpm docs:overview` turns these pages and the source into a clickable site in `.reports/overview/`; see the Architecture overview section of the [README](../README.md#architecture-overview).

These pages are for people working on Trayful's code. They are not part of the npm package and agents do not read them over MCP; game designers read [`docs/`](../docs/README.md) instead.

## Writing a page

Each page starts with a front matter block:

```yaml
---
title: A player drags a card onto a row
kind: interaction # or concept
order: 2 # place in the navigation
summary: One sentence for the home page and the top of the page.
---
```

An **interaction** follows one thing a person or agent does from start to end, one numbered step per part, and says what that part's role is. A **concept** explains an idea that several interactions share. `index.md` is the introduction on the home page.

## Symbol links

Name code with double brackets instead of paths, so the overview can link it and check it:

| Link                               | Goes to                                  |
| ---------------------------------- | ---------------------------------------- |
| `[[core]]`                         | a package                                |
| `[[core/engine.ts]]`               | a module (the extension may be left out) |
| `[[core:TableEngine]]`             | a declaration in a package               |
| `[[command:move]]`                 | a table command                          |
| `[[message:state]]`                | a message on the WebSocket               |
| `[[mcp:draw]]`                     | an MCP tool                              |
| `[[route:GET /ws]]`                | an HTTP route                            |
| `[[trayful:play]]`                 | a CLI command                            |
| `[[format:library]]`               | a format reference page                  |
| `[[concept:glossary]]`             | another page here                        |
| `[[core:TableEngine\|the engine]]` | any of these, with its own words         |

`pnpm docs:overview --check` (part of `pnpm check`) fails when a link names something that no longer exists, and every module page lists the pages that link to it under "Takes part in".
