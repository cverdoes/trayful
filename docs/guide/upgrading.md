# Upgrade an older project

Projects made before milestone 9 are in the file format `trayful/1`. They still load and play, with a warning, but the designer and agents can only change their components once they are rewritten in `trayful/2`:

```sh
npx trayful migrate my-game
```

`migrate` rewrites the libraries in the new form, keeping the comment lines at their top; moves images and palette colours to a new `assets.yaml`; renames each inventory entry's `type` to `component`; and adds `lock: true` to the setup steps that place a board, since boards no longer start locked. The manifest, inventory and setups keep their comments. Commit the folder first if you want the old files. See [Versioning](../reference/versioning.md#moving-a-project-to-trayful2).
