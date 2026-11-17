# Work on a git repository

Point a Trayful on a server at your game's git repository, and work on the prototype from anywhere without the server seeing your computer's files. Trayful keeps its own clone: it commits what changes on the table and pushes it, and it takes in what you push. You and Trayful meet in the repository.

```
your computer  ⇄  the repository  ⇄  Trayful on a server
   push, pull       one branch        fetch, commit, push
```

Your edits reach the table once you push them and Trayful syncs. They do not show up the moment you save, as they do when Trayful runs on your own computer.

## Start it

Make a folder for Trayful's clone, and start Trayful on it with `--data` instead of a project folder:

```sh
trayful play --data ~/trayful-data
```

With nothing connected yet, Trayful has no project and waits for a repository. Connect one with the `connect_repository` MCP tool, or right away at the start:

```sh
trayful play --data ~/trayful-data --repo https://github.com/me/my-game --branch main --path prototype
```

- `--repo` is the repository's `https://` address, or an SSH address such as `git@github.com:me/my-game.git`.
- `--branch` is the branch to work on, `main` if you leave it out. A branch that does not exist yet is made from the repository's default branch.
- `--path` is the folder with the project, or with a folder of projects. Trayful checks out only that folder and the files at the top of the repository. A folder with no project in it gets the starter project, committed and pushed.

The data folder remembers the repository, so later starts need only `--data`. One data folder is for one repository.

On a server, run it with Docker on top of [owner mode](host-your-own.md):

```sh
docker compose -f compose.yaml -f compose.owner.yaml -f compose.git.yaml up -d --build
```

with `TRAYFUL_DATA` (the folder for the clone) and `TRAYFUL_GIT_TOKEN` in your `.env` file as well.

## Give it access

For a private repository, or to push to any repository over HTTPS, Trayful needs a token. On GitHub, make a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) for just this one repository, with **Contents: Read and write**, and give it to Trayful in `TRAYFUL_GIT_TOKEN`, or in a file named by `TRAYFUL_GIT_TOKEN_FILE`.

Trayful hands the token to git only while git runs. It is never written into the repository's settings, so it does not show in `git remote -v` or in error messages. Only the host can connect a repository or sync it; playtesters see nothing of git.

Commits are by "Trayful" unless you set `TRAYFUL_GIT_NAME` and `TRAYFUL_GIT_EMAIL`.

## Sync

`sync_repository` commits what changed on the server, takes in the branch's new commits and pushes. Open tables reload when files change. Ask your agent to call it after you push, so the table shows your changes, and before you pull, so the repository has the changes made on the table:

- "I pushed new card art; sync Trayful and show me the deck."
- "Sync Trayful, then pull, so I have the cards you designed."

`repository_status` shows the branch, the commits not pushed yet, the files changed and the last sync.

Saved tables (`tables/`) are never committed by a sync: they change on every move. `.trayful/`, with the players and their keys, is never committed at all.

## When both sides changed the same lines

Trayful never leaves a half-merged file in the project. If you and Trayful changed different files, or different parts of a file, a sync merges them. If you both changed the same lines, the sync stops: the project on the table stays as it was, and Trayful pushes its side to a branch of its own, such as `trayful/conflict-20261117-0912`. Then either:

- Merge that branch on your computer, push, and sync again. Trayful takes in the result.
- Or call `resolve_conflict` to take the repository's version. Trayful's side stays on its branch, so nothing is lost.

Until then Trayful keeps working, but pushes only to its conflict branch.
