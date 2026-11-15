# Run it in Docker

To keep the server apart from the rest of your computer, run it in a container. It then sees only the folder you give it, runs as an ordinary user on a read-only system, and can be reached only from your own computer. You need [Docker](https://docs.docker.com/get-docker/) and a clone of this repository; Node and pnpm are not needed.

```sh
scripts/docker.sh            # serves examples/
scripts/docker.sh ~/games    # serves your own project, or folder of projects
```

Then open http://localhost:4317. The script builds the image, starts the container, and saves tables as you, so the files stay yours. It runs `docker compose up --build` with the settings below, which you can also set yourself:

| Setting            | What it does                                                        |
| ------------------ | ------------------------------------------------------------------- |
| `TRAYFUL_PROJECTS` | The folder to serve (default `./examples`); the only one it can see |
| `TRAYFUL_USER`     | The `uid:gid` to save files as (default `1000:1000`)                |
| `TRAYFUL_PORT`     | The port on your computer (default 4317); open the table there      |

You are the host, as with `trayful play`: inside a container the server counts requests through the published port as yours, so [`compose.yaml`](../../compose.yaml) publishes it on `127.0.0.1` only. Do not publish it on your network. `--share` does not work in a container. Agents connect over HTTP at `http://127.0.0.1:4317/mcp` as in [Let an agent play](agents.md); `trayful mcp` on your computer cannot reach the container's table. Edits to the project files reload as usual. Stop it with Ctrl+C, or `docker compose down`.
