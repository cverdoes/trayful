# Play with others

Playtesters can join your table from their own computers, each with a private hand the others cannot see. Trayful still runs on your computer; the others open a link to it.

## On the same network

1. Start the table with `--share`:

   ```sh
   pnpm trayful play ../my-game --share
   ```

   Trayful prints invite links such as `http://192.168.1.20:4317/join/…`, one for each of your computer's network addresses.

2. Send one of the links to your playtesters. Anyone who has it can join, so keep it within the group.
3. Each playtester opens the link, picks a name and is at the table. Their names appear in the toolbar, with how many cards each holds.

Your computer's firewall may ask whether to let Trayful accept connections; allow it for private networks.

## Anywhere, through a tunnel

When your playtesters are elsewhere, `--tunnel` makes a temporary public address through a [Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/). Install [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) once (no Cloudflare account needed), then:

```sh
pnpm trayful play ../my-game --tunnel
```

Trayful prints an invite link such as `https://some-random-words.trycloudflare.com/join/…`. The address changes every time you start, and stops working when you stop Trayful. Your computer accepts no connections from the network; everything goes through the tunnel.

## While you play

- **Your hand** is the strip along the bottom of the screen. Drag a card from the table, or straight off a pile, onto it to take it into your hand. Only you see what is there.
- Drag a card **out of your hand** onto the table to play it face up, or onto a pile to put it on top. Hold **Alt** while you drop it to play it face down. Double-click a card in your hand to play it into the middle of your view.
- When someone else moves something, a note at the bottom says who did what, without naming hidden cards.
- **Invite** in the toolbar shows the links again, to copy them. Only you, the host, see it, and only you can make, copy or delete tables and print.

Face-down cards are hidden from everyone: no one can find out which card it is from the page, not even by looking at what the browser was sent. See [Players and hands](../reference/players-and-hands.md) for exactly what each player sees.

## With an agent

An agent connected over MCP plays as **Claude**, with its own hand. Ask it to "deal three cards to each of us, Bob and you included", and it deals into `hand:bob` and `hand:claude`; it can play from its hand, but never sees yours.
