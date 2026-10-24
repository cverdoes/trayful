# Use Trayful from your game's repository

If your game has a repository of its own, with its rules, notes and card lists, keep the Trayful prototype inside it. Your agent can then read the rules, build the components on the table, and play a round, all in one session.

## Put the prototype in the repository

Make a project folder next to your rules, for example `prototype/`:

```sh
cd my-game
npx trayful new prototype --name "My Game"
```

Add Trayful's own working files to your `.gitignore`. `.trayful/` holds the players who joined and their keys, so it must never be committed. `tables/` holds the saved tables; leave it out of the ignore list if you want playtest positions in your history.

```
prototype/.trayful/
prototype/tables/
```

Everything else in `prototype/` is plain text and images, so the prototype is versioned with the rules.

## Add the Trayful skill

From the root of your repository:

```sh
npx trayful skill
```

This writes `.claude/skills/trayful/`, a [skill](../../skills/trayful/SKILL.md) that tells Claude Code how to work with Trayful: read the docs before designing, check every component with `render_component`, run `validate_project` after editing files by hand, and play fair with hidden cards. It also has worked recipes for decks from tiled images, score tracks, boards and decks from spreadsheets. Commit it, so every session in the repository has it. Run `npx trayful skill` again after updating Trayful, to bring it up to date.

Other agents can read the same files: point them at `.claude/skills/trayful/SKILL.md` from your `AGENTS.md` or their own instructions file.

## Connect the agent

Start the table, then add Trayful to Claude Code once:

```sh
npx trayful play prototype
claude mcp add --transport http trayful http://127.0.0.1:4317/mcp
```

Keep the table open in your browser while you work: the agent's pictures of components and of the table are drawn there.

## Ask for what you want

For example:

- "Read the rules in `rules.md` and make the action cards they describe, as a deck."
- "Make a deck from `art/creatures.png`, a sheet of four by three cards."
- "Create a score tracker from 0 to 20 for four players."
- "Add a board with a market of five card slots and a supply."
- "Deal three cards each and play a round against me."

Since the prototype is in the agent's workspace, it can copy your images straight into `prototype/assets/`, which works for files of any size, and write setups, which have no tool of their own. The table reloads as soon as a file changes.
