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

With nothing connected yet, Trayful has no project and waits for a repository. Open its page and fill in **Connect a repository**, use the `connect_repository` MCP tool, or connect one right away at the start:

```sh
trayful play --data ~/trayful-data --repo https://github.com/me/my-game --branch main --path prototype
```

- `--repo` is the repository's `https://` address, or an SSH address such as `git@github.com:me/my-game.git`.
- `--branch` is the branch to work on, `main` if you leave it out. A branch that does not exist yet is made from the repository's default branch.
- `--path` is the folder with the project, or with a folder of projects. Trayful checks out only that folder and the files at the top of the repository. A folder with no project in it gets the starter project, committed and pushed.

On the command line a new branch or starter project is made as asked. The `connect_repository` tool first says what is missing and makes it only when called again with `create: true`, so a typo in the branch or folder does not quietly start something new.

The data folder remembers the repository, so later starts need only `--data`. One data folder is for one repository.

On a server, run it with Docker on top of [owner mode](host-your-own.md):

```sh
docker compose -f compose.yaml -f compose.owner.yaml -f compose.git.yaml up -d --build
```

with `TRAYFUL_DATA` (the folder for the clone) and `TRAYFUL_GIT_TOKEN` in your `.env` file as well.

## Give it access

For a private repository, or to push to any repository over HTTPS, Trayful needs a token. On GitHub, make a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) for just this one repository, with **Contents: Read and write**, and give it to Trayful in `TRAYFUL_GIT_TOKEN`, or in a file named by `TRAYFUL_GIT_TOKEN_FILE`. Use the repository's `https://` address with it. Without a token, a private repository looks to git as if it did not exist; Trayful's error then says to set `TRAYFUL_GIT_TOKEN`.

Trayful hands the token to git only while git runs. It is never written into the repository's settings, so it does not show in `git remote -v` or in error messages. Only the host can connect a repository or sync it; playtesters see nothing of git.

Commits are by "Trayful" unless you set `TRAYFUL_GIT_NAME` and `TRAYFUL_GIT_EMAIL`.

## Sync

Trayful syncs by itself:

| What   | When                                                  |
| ------ | ----------------------------------------------------- |
| Commit | 30 seconds after the last change to the project files |
| Fetch  | Every 2 minutes, taking in new commits on the branch  |
| Push   | On a fetch, at most every 5 minutes                   |

Open tables reload when the files change. To sync at once, click the branch in the toolbar and **Sync now**, or ask your agent to call `sync_repository`: after you push, so the table shows your changes, and before you pull, so the repository has the changes made on the table.

- "I pushed new card art; sync Trayful and show me the deck."
- "Sync Trayful, then pull, so I have the cards you designed."

The dot by the branch name says how things stand: green when in sync, yellow while changes wait to be committed, pushed or taken in, red after a conflict or a failed sync. `repository_status` tells an agent the same.

Commit messages say who changed what, such as `Trayful: upsert_type, add_asset (agent); Tray (Claes)`. Saved tables (`tables/`) are never committed by a sync: they change on every move. `.trayful/`, with the players and their keys, is never committed at all.

### Sync on every push

To have Trayful take in a push at once instead of at its next fetch, add a webhook. Make a secret (`openssl rand -hex 32`) and give it to Trayful in `TRAYFUL_GIT_WEBHOOK_SECRET`. Then, in the repository's **Settings → Webhooks → Add webhook** on GitHub:

- **Payload URL**: `https://trayful.example.com/api/repository/hook`
- **Content type**: `application/json`
- **Secret**: the same secret
- **Which events**: just the push event

Trayful checks each event's signature, and syncs when the push was to its branch.

## When both sides changed the same lines

Trayful never leaves a half-merged file in the project. If you and Trayful changed different files, or different parts of a file, a sync merges them. If you both changed the same lines, the sync stops: the project on the table stays as it was, and Trayful pushes its side to a branch of its own, such as `trayful/conflict-20261117-0912`. Then either:

- Merge that branch on your computer, push, and sync again. Trayful takes in the result.
- Or take the repository's version: **Take the repository's version** on the banner, or `resolve_conflict`. Trayful's side stays on its branch, so nothing is lost.

Until then Trayful keeps working, but pushes only to its conflict branch.
