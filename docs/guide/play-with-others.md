# Playing with others

Start the table with `--share` (same network) or `--tunnel` (anywhere; needs [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/), no account), and Trayful prints an invite link to send your playtesters. They open it, pick a name, and play on that table, and no other; **Invite players** in the toolbar's **More** menu makes links to any of your tables. Everyone undoes only their own moves.

```sh
npx trayful play my-game --share
```

Everyone has a private **hand** along the bottom of the screen: drag cards onto it to keep them hidden, and drag them out to play them (hold Alt for face down). The others see only how many cards you hold, and face-down cards stay hidden from every browser, down to the data it is sent. Only the host can make or delete tables, print, invite and connect agents. See [Play with others](../howto/play-with-others.md) and [Players and hands](../reference/players-and-hands.md).
