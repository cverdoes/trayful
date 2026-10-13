# Validation errors

Trayful checks a project every time it loads it: when you run `trayful validate`, when `trayful play` starts, and every time you save a file while a table is open. Each problem names the file, line and column, and what is wrong:

```
library/cards.yaml:17:26  error  Default value must be a whole number. (at types[0].fields.cost.default)
data/actions.csv:4:1  error  "suit" must be one of "red", "green". (column "suit")
```

The part in brackets is where in the file's structure the problem is, or for a CSV file, which column. `trayful validate --json` prints the same as JSON for tools.

While a table is open, a broken save shows the problems in a bar at the top of the table, and the table keeps the last version that loaded. Fix the file and save again; the bar goes away.

## Common problems

| Message                                                          | Means                                                                                              |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `Unknown type "…". Define it in a library first.`                | The inventory names a type no library defines. Check the spelling and the manifest's `libraries`. |
| `Missing value for field "…".`                                   | A component leaves out a field that has no `default` and is not optional (`string?`).             |
| `"…" is not a field of "…".`                                     | An inventory row, CSV column or `{{placeholder}}` uses a field the type does not declare.         |
| `"…" must be one of …`                                           | A value is not in the field's `enum`.                                                              |
| `Image "…" not found in the project folder.`                     | A layer names an image file that does not exist. Paths are relative to the project folder.        |
| `No files match "…".`                                            | A manifest pattern such as `library/*.yaml` matches nothing.                                       |
| `Use only one of "items", "from" or "each" in an entry.`         | Split the entry in two.                                                                            |
| `A … cannot be stacked into a deck.`                             | Only cards, tiles and tokens can be in a deck.                                                     |
| `Only boards, tiles and zones can have snap targets.`            | Move the `snap` list to a board, tile or zone type.                                                |
| `Unknown deck "…".`                                              | A setup names a deck no inventory entry creates.                                                   |
| `"…" is neither a type id nor a component id.`                   | A setup's `place` names something that is not in the box.                                         |
| `Spot … is out of range; "…" has spots 0 to ….`                  | A setup uses a spot number the target does not have; spots count from 0.                          |
| `Type "…" is already defined in ….`                              | Two libraries define the same type id.                                                             |
| `Unknown key: "…".`                                              | A misspelt or unsupported key. The reference pages list every key a file kind takes.               |

Editors with the YAML language server catch many of these as you type, using the JSON Schemas in [`packages/formats/schema/`](../../packages/formats/schema/); the `# yaml-language-server: $schema=…` line at the top of each starter file turns that on.

## When an agent edits

The authoring tools for agents (`upsert_type`, `set_inventory` and the rest) run the same checks before keeping a change. If the change would break the project, the files are put back as they were and the agent receives these messages, so a project is never left broken by an agent.
