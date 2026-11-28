# Contributing to Trayful

Thanks for wanting to help. Bug reports, ideas and pull requests are all welcome.

- **Found a bug or missing something?** [Open an issue](https://github.com/cverdoes/trayful/issues). For a bug, say what you did, what you expected and what happened; a small project folder that shows it helps most.
- **Want to change the code?** Start with [Develop Trayful](https://cverdoes.github.io/trayful/concepts/develop.html): building from a clone, the repository layout and every command. If you would rather not install Node and pnpm, it also shows how to work in the dev container in `.devcontainer/`, with your own git, GitHub and Claude Code logins. The [Contributors half of the site](https://cverdoes.github.io/trayful/contributors.html) explains how Trayful is built and why.

## Sending a pull request

1. Branch from `main` and keep the change to one thing.
2. Add or change tests with the code: unit tests next to the code in each package's `test/` folder, and an e2e test for a flow a person sees.
3. Update the docs in the same change: the [user guide](docs/guide/README.md) or a [HOWTO guide](docs/howto/README.md) when what people do changes, and the pages in [`architecture/`](architecture/README.md) when the code they explain changes.
4. Run `pnpm check`. It runs everything CI runs, and the limits it checks are fixed: fix the code rather than switching a rule off (see [Code quality](https://cverdoes.github.io/trayful/concepts/code-quality.html)).

Trayful is source-available under the [FSL-1.1-MIT licence](LICENSE.md).
