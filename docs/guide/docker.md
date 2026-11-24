# Run it in Docker

To keep the server apart from the rest of your computer, run it in a container. It then sees only the folder you give it, runs as an ordinary user, and can be reached only from your own computer. You need [Docker](https://docs.docker.com/get-docker/); Node and pnpm are not needed.

## The ready-made image

Each release is published as an image, `ghcr.io/cverdoes/trayful`, for Intel and ARM computers alike (including Apple Silicon). It has Trayful and git, and runs as the user `node`, not as root. To play the folder that holds your projects:

```sh
docker run --rm -it --init -p 127.0.0.1:4317:4317 \
  -v ~/games:/projects --user "$(id -u):$(id -g)" \
  ghcr.io/cverdoes/trayful
```

Then open http://localhost:4317. `-v` gives the container your folder as `/projects`, the only one it can see; mount the folder your projects are in, not one project's own folder. `--user` saves tables as you, so the files stay yours. Leave both out to try the examples that come with the image; tables you save there are lost when the container stops. Stop it with Ctrl+C.

| Tag                    | What it is                                                 |
| ---------------------- | ---------------------------------------------------------- |
| `latest`               | The newest release; the same version as `npx trayful`      |
| `0.4`                  | The newest release of 0.4, such as 0.4.2                   |
| `0.4.0`                | Exactly that version                                       |
| `0.4.0-rc.1` and so on | A version to try before its release, as `npx trayful@next` |

Everything after the image name is a `trayful` command in place of the usual `play /projects --container`. With the same `-v` and `--user`, ending the command with `new /projects/my-game` starts a project in your folder, and `play /projects/my-game --container` opens on that one. Keep `--container` on `play`: it tells Trayful where its host's requests come from. `docker pull ghcr.io/cverdoes/trayful` gets the newest release.

For a stricter container, add `--read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges`, as [`compose.yaml`](../../compose.yaml) does. To run it on a server of your own, with only the compose files and no clone, see [Host your own Trayful](../howto/host-your-own.md) and [Work on a git repository](../howto/git-backed.md).

## From a clone of this repository

To build the image yourself, from the code in a clone of this repository:

```sh
scripts/docker.sh            # serves examples/
scripts/docker.sh ~/games    # serves your own folder of projects
```

Then open http://localhost:4317. The script builds the image, starts the container on a read-only system, and saves tables as you, so the files stay yours. It runs `docker compose up --build` with the settings below, which you can also set yourself:

| Setting            | What it does                                                        |
| ------------------ | ------------------------------------------------------------------- |
| `TRAYFUL_PROJECTS` | The folder of projects (default `./examples`); the only one it sees |
| `TRAYFUL_USER`     | The `uid:gid` to save files as (default `1000:1000`)                |
| `TRAYFUL_PORT`     | The port on your computer (default 4317); open the table there      |

Given one project's folder, the script serves the folder it is in. Stop it with Ctrl+C, or `docker compose down`.

## You are the host

You are the host, as with `trayful play`: inside a container the server counts requests through the published port as yours, so publish it on `127.0.0.1` only, as `-p 127.0.0.1:4317:4317` and [`compose.yaml`](../../compose.yaml) do. Never publish it on your network. `--share` does not work in a container. Agents connect over HTTP at `http://127.0.0.1:4317/mcp` as in [Let an agent play](agents.md); `trayful mcp` on your computer cannot reach the container's table. Edits to the project files reload as usual.
