# Validation errors

Trayful checks a project every time it loads it: when you run `trayful validate`, when `trayful play` starts, and every time you save a file while a table is open. Each problem names the file, line and column, and what is wrong:

```
library/cards.yaml:16:35  error  Default value must be a whole number. (at components[0].fields.cost.default)
data/actions.csv:4:1  error  "suit" must be one of "red", "green". (column "suit")
```

The part in brackets is where in the file's structure the problem is, or for a CSV file, which column. `trayful validate --json` prints the same as JSON for tools.

Most problems are errors, and a project with errors does not load. A few are warnings, which leave the project working: the most common is `This project is in trayful/1. It plays as it is; run \`trayful migrate\` …`, for a project made for an earlier Trayful (see [Versioning](versioning.md)).

While a table is open, a broken save shows the problems in a bar at the top of the table, and the table keeps the last version that loaded. Fix the file and save again; the bar goes away.

## Common problems

| Message                                                           | Means                                                                                                                                                      |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Unknown component "…". Define it in a library first.`            | The inventory names a component no library defines. Check the spelling and the manifest's `libraries`.                                                     |
| `Missing value for field "…".`                                    | A component leaves out a field that has no `default` and is not optional (`string?`).                                                                      |
| `"…" is not a field of "…".`                                      | An inventory row, CSV column or `{{placeholder}}` uses a field the component does not declare.                                                             |
| `"…" must be one of …`                                            | A value is not in the field's `enum`.                                                                                                                      |
| `Image "…" not found in the project folder.`                      | The assets file or a layer names an image file that does not exist. Paths are relative to the project folder.                                              |
| `There is no image "…" in the assets file.`                       | A face's `image` names an image the assets file does not have. Add it under `images:` in `assets.yaml`.                                                    |
| `"…" is neither an image asset nor a file in the project folder.` | An image layer names something that is neither in the assets file nor a file.                                                                              |
| `No files match "…".`                                             | A manifest pattern such as `library/*.yaml` matches nothing.                                                                                               |
| `Use only one of "items", "from" or "each" in an entry.`          | Split the entry in two.                                                                                                                                    |
| `"…" is not stackable, so it cannot be in a deck.`                | Add `stackable: true` to the component, or take `deck` off the inventory entry.                                                                            |
| `A die cannot have "…".`                                          | Dice and counters have `values`; `flippable`, `rotates`, `stackable` and `container` are for pieces and zones.                                             |
| `A stamp cannot have "…".`                                        | A stamp is only its `face`: no behaviours, `values` or `fields`. Give its labels a `text`.                                                                 |
| `"…" is a stamp: it is pressed onto sheets, not kept in the box.` | Take the stamp out of the inventory; stamp spots that `accept` it can be marked with it any number of times.                                               |
| `Only dice and counters have values.`                             | Move `values` to a component that `is: die` or `is: counter`.                                                                                              |
| `"…" is neither a component nor a representation (…).`            | An `accepts` list names something that does not exist.                                                                                                     |
| `There is no component "…".`                                      | A `stackable.with` list names a component no library defines.                                                                                              |
| `Unknown deck "…".`                                               | A setup names a deck no inventory entry creates.                                                                                                           |
| `"…" is not a component in the library or the inventory.`         | A setup's `place` names something that is not in the box.                                                                                                  |
| `Spot … is out of range; "…" has spots 0 to ….`                   | A setup uses a spot number the drop area does not have; spots count from 0.                                                                                |
| `"…" is already defined in ….`                                    | Two libraries define the same component id.                                                                                                                |
| `Unknown key: "…".`                                               | A misspelt or unsupported key, or a `trayful/1` key such as `base` or `front` in a `trayful/2` file. The reference pages list every key a file kind takes. |

Editors with the YAML language server catch many of these as you type, using the JSON Schemas in [`packages/formats/schema/`](../../packages/formats/schema/); the `# yaml-language-server: $schema=…` line at the top of each starter file turns that on.

## When an agent edits

The authoring tools for agents (`upsert_type`, `set_inventory` and the rest) run the same checks before keeping a change, and refuse to change a project still in `trayful/1` until it is migrated. If the change would break the project, the files are put back as they were and the agent receives these messages, so a project is never left broken by an agent.
