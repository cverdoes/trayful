# Host your own Trayful

Run Trayful on a small server of your own, so you can use it from any browser and let Claude work with it from claude.ai or Claude Code on the web, without your computer running. It is your Trayful alone: you sign in with a secret, and playtesters still join with invite links.

This is **owner mode**. Without it, Trayful trusts whoever is at the computer it runs on, which on a server is nobody. In owner mode you prove you are the owner with a secret instead, and Claude gets in through OAuth, the sign-in that claude.ai connectors use.

## What you need

- A small Linux server that is always on, such as a virtual server from Hetzner or DigitalOcean. 1 CPU and 1 GB of memory is enough.
- A domain name pointing at the server's address, such as `trayful.example.com`. Caddy gets an HTTPS certificate for it by itself.
- [Docker](https://docs.docker.com/engine/install/) on the server.

## Start it

1. On the server, put your projects in a folder, such as `~/games`, and make a folder for Trayful's settings with the compose files of the [release](https://github.com/cverdoes/trayful/releases) you run, such as `v0.4.0`:

   ```sh
   mkdir ~/trayful && cd ~/trayful
   for f in compose.yaml compose.owner.yaml compose.git.yaml; do
     curl -fsSLO "https://raw.githubusercontent.com/cverdoes/trayful/v0.4.0/$f"
   done
   ```

   You need no clone of the repository: Docker pulls the ready-made image, `ghcr.io/cverdoes/trayful`.

2. Make an owner secret, and keep it in your password manager:

   ```sh
   openssl rand -hex 32
   ```

3. In the same folder, write a `.env` file with your settings:

   ```sh
   TRAYFUL_IMAGE=ghcr.io/cverdoes/trayful:0.4.0
   TRAYFUL_DOMAIN=trayful.example.com
   TRAYFUL_OWNER_SECRET=<the secret>
   TRAYFUL_PROJECTS=/home/you/games
   TRAYFUL_USER=1000:1000
   ```

   `TRAYFUL_IMAGE` is the image's version, the same as the compose files'; without it you get `latest`. `TRAYFUL_USER` is the `uid:gid` that owns the projects folder (`id -u` and `id -g`).

4. Start Trayful and Caddy in front of it:

   ```sh
   docker compose -f compose.yaml -f compose.owner.yaml up -d
   ```

5. Open `https://trayful.example.com` and sign in with the secret. This browser stays signed in for a year.

The server must accept connections on ports 80 and 443, for HTTPS and its certificate. Trayful itself stays on the server's loopback address, where only Caddy reaches it.

To update, fetch the compose files of the new release as in step 1, change the version in `TRAYFUL_IMAGE`, and run `docker compose -f compose.yaml -f compose.owner.yaml up -d` again. To run code that is not released yet, start from a clone of this repository instead, with `TRAYFUL_IMAGE=trayful` in `.env` and `--build` added to the `docker compose` command.

## Connect Claude

On claude.ai, add a custom connector (**Settings → Connectors → Add custom connector**) with the address `https://trayful.example.com/mcp`. claude.ai finds Trayful's sign-in by itself and opens a page that asks whether to let Claude use Trayful. Enter the secret, if this browser is not signed in yet, and click **Allow**. Claude can then use Trayful in chats, and in Claude Code on the web.

Claude Code can also connect with the secret as a token instead of OAuth. Put the secret in an environment variable, such as `TRAYFUL_OWNER_SECRET`, and add the server to `.mcp.json` in your game's repository:

```json
{
  "mcpServers": {
    "trayful": {
      "type": "http",
      "url": "https://trayful.example.com/mcp",
      "headers": { "Authorization": "Bearer ${TRAYFUL_OWNER_SECRET}" }
    }
  }
}
```

## Invite playtesters

Playtesters do not sign in. **Invite players** in the toolbar's **More** menu makes links under your domain, as in [Play with others](play-with-others.md); a playtester can join only the table their link is for.

## Keep it safe

- Anyone with the secret can do everything you can. If it gets out, make a new one, change `TRAYFUL_OWNER_SECRET` and run the `docker compose` command again. Every browser and agent is then signed out, and you sign in and connect Claude again.
- An agent you allow gets a token for an hour, which it renews by itself for up to 30 days of not being used.
- Tables are saved in your projects folder. Back it up, for example by keeping it in a private git repository.
- Never run owner mode without HTTPS in front: the secret and tokens would travel unencrypted.

## Without Docker

`trayful play --owner` starts owner mode with the secret from `TRAYFUL_OWNER_SECRET`, and `--public-url https://trayful.example.com` makes invite links under your domain. Put a proxy that ends HTTPS in front, such as Caddy or a Cloudflare tunnel, and leave Trayful on `127.0.0.1`. The proxy must say where requests come from (`X-Forwarded-For`, as Caddy and Cloudflare do), since Trayful takes requests from its own computer without that header for the host's.
