# Versioning

## The file format

Manifests carry `format: trayful/2`, the version of the file format the project is written in. Changes that only add optional keys keep the same version; a new version comes with a way to move older projects to it, so they keep working.

Saved tables have a format of their own, `trayful/1`, which has not changed: tables saved before `trayful/2` open as they are.

Your own version of the game goes in the manifest's `version` key, such as `'0.3'`. Trayful gives it no meaning, so use whatever scheme you like.

## trayful/2

`trayful/2` describes a component by what it is and what it can do, instead of by a fixed kind such as `card` or `board`:

| `trayful/1`                                             | `trayful/2`                                                                                                                                                |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types:` in a library                                   | `components:`                                                                                                                                              |
| `base: card`, `tile`, `token`, `board`, `meeple`        | `is: piece`, with the behaviours it needs; a meeple has `face: { shape: meeple }`                                                                          |
| `base: die`, `counter`, `zone`                          | `is: die`, `counter`, `zone`                                                                                                                               |
| Cards, tiles and tokens have a back and stack           | `flippable: true` or `flippable: { back: ... }`, and `stackable: true` (or `stackable: { with: [...] }` listing the other components of the same old kind) |
| Everything but dice and counters turns; `rotationStep`  | `rotates: true` or `rotates: { step: 60 }`                                                                                                                 |
| `snap:` on boards, tiles and zones                      | `container:` on any piece or zone                                                                                                                          |
| `faces:` and `range:` on dice and counters              | `values: { list: [...] }` or `values: { range: [min, max] }`                                                                                               |
| `front:`, plus `shape`, `corner` and `fill` on the type | `face:`, which also takes `image` and `labels`                                                                                                             |
| `back:`                                                 | `flippable: { back: ... }`                                                                                                                                 |
| `palette:` in a library                                 | `colors:` in `assets.yaml`                                                                                                                                 |
| Image files named in layers                             | Images named in `assets.yaml`, optionally cut into tiles                                                                                                   |
| `type:` in an inventory entry                           | `component:`                                                                                                                                               |
| Boards start locked                                     | Nothing starts locked; a setup step says `lock: true`                                                                                                      |

Each behaviour is off unless written. See the [library reference](library.md) for every key, and [the assets file](assets.md) for images and colours.

## Opening a trayful/1 project

A project whose manifest says `format: trayful/1` still loads. Trayful converts it in memory, the same way `trayful migrate` would, so it plays as before (setups still lock the boards they place, though a board no setup places now starts unlocked), and `trayful validate` and the table show a warning:

```
trayful.yaml:3:1  warning  This project is in trayful/1. It plays as it is; run `trayful migrate` to move it to trayful/2 before changing its components. (at format)
```

Its components cannot be changed by the designer or the authoring tools until it is migrated: they would otherwise have to write the old format.

## Moving a project to trayful/2

```sh
pnpm trayful migrate ../my-game
```

`trayful migrate` rewrites the project's files in `trayful/2` and lists the files it wrote. The designer's **Update the project files** button and the `migrate_project` agent tool do the same. It refuses a project that is already in `trayful/2`, or one with errors; fix those first. Commit the folder, or keep a copy, before you run it if you want the old files.

What it changes:

- **Libraries** are written afresh in the new form. The comment lines at the top of each file, such as the editor's `# yaml-language-server` line, are kept; comments further down are not. Faces are simplified where they can be: an image covering the whole face becomes the face's `image`, and a face of only text becomes `labels`. Anything else stays in `layers` and looks the same. Snap targets that accepted a kind of piece (`card`, `meeple`) accept the components that were of that kind.
- **Images and palette colours** move to a new `assets.yaml` (or `assets-2.yaml` if that name is taken), each image named after its file, and the manifest names it with `assets:`. Image paths that come from card data, such as `'{{art}}'`, stay as they are.
- **The inventory** names each entry's `component` instead of its `type`.
- **Setups** get `lock: true` on the steps that place a board, since boards used to start locked.
- **The manifest** gets `format: trayful/2`.

The manifest, the inventory and the setups are edited in place, so their comments, blank lines and order stay. Data files, images and saved tables are not touched.

## Component ids

Every component in the box gets an id from its library component, its row and its copy number, such as `action-card.harvest.2`. Saved tables, setups and agents refer to components by these ids, so they matter when you change the inventory:

- The row part comes from an `id` column or key when there is one, else the `name` field, else the first text field, else the row number.
- Renaming a card without an `id` changes its id. On an open table the old card leaves and the renamed card arrives below the table. Give rows an explicit `id` to rename them freely.
- Changing other fields keeps the id, and open tables show the new values in place.
- Raising a `count` adds copies with new numbers, and lowering it removes the highest-numbered copies. Going from one copy to several changes the id of the first (`token` becomes `token.1`), and back again.

Migrating a project keeps every component id, so saved tables carry on.

## Saved tables

Tables are saved in the project's `tables/` folder as JSON (see [Table state](table.md)). They hold positions and stacks but take every component's look and data from the project files, so they follow your edits. They are game state rather than design, so most projects keep `tables/` out of version control. Projects made with `trayful new` come with a `.gitignore` that does this.

Keep the project folder itself (the YAML, CSV and asset files) in git or another version control system: every change, whether made by you or by an agent, is a plain-text diff.
