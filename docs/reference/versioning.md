# Versioning

## The file format

Manifests and saved tables carry `format: trayful/1`, the version of the file format they are written in. Trayful reads every format version it knows; a later format will come with an automatic upgrade of older files, so projects keep working. Changes that only add optional keys keep the same version.

Your own version of the game goes in the manifest's `version` key, such as `'0.3'`. Trayful gives it no meaning, so use whatever scheme you like.

## Component ids

Every component in the box gets an id from its type, its row and its copy number, such as `action-card.harvest.2`. Saved tables, setups and agents refer to components by these ids, so they matter when you change the inventory:

- The row part comes from an `id` column or key when there is one, else the `name` field, else the first text field, else the row number.
- Renaming a card without an `id` changes its id. On an open table the old card leaves and the renamed card arrives below the table. Give rows an explicit `id` to rename them freely.
- Changing other fields keeps the id, and open tables show the new values in place.
- Raising a `count` adds copies with new numbers, and lowering it removes the highest-numbered copies. Going from one copy to several changes the id of the first (`token` becomes `token.1`), and back again.

## Saved tables

Tables are saved in the project's `tables/` folder as JSON (see [Table state](table.md)). They hold positions and stacks but take every component's look and data from the project files, so they follow your edits. They are game state rather than design, so most projects keep `tables/` out of version control. Projects made with `trayful new` come with a `.gitignore` that does this.

Keep the project folder itself (the YAML, CSV and asset files) in git or another version control system: every change, whether made by you or by an agent, is a plain-text diff.
