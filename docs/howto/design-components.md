# Design components in the browser

The designer lets you build component types by clicking instead of writing YAML: pick a size, add fields, and lay out each face while a preview redraws as you go. Every change is saved to your library files, so they stay the files you would have written by hand.

## Open the designer

Open your project on a table and click **Design** in the toolbar. Only the host (the person who ran `trayful play`) can design; players who joined by invite link see the table only. **Table** at the top goes back to playing.

The designer has three parts:

- **Types** on the left lists every type in the project, grouped by what it behaves like, with how many of each are in the box.
- The **preview** in the middle draws the type at its real proportions, front and back, on a 5 mm grid.
- The **inspector** on the right holds everything about the type, from its name to each layer on its faces.

## Make a new type

Click **+ New type**, give it a name and pick what to start from: a poker or mini card, a square or hex tile, a round token, a meeple, a six-sided die, a counter or a board, each at a common size. The type is written to the library file that already holds types like it (cards go next to your other cards), with an id made from its name, such as `event-card`.

**Duplicate** copies the selected type into the same file, which is the quickest way to make a variant. **Delete** removes it, but only once nothing in the inventory uses it; take its entries out of `inventory.yaml` first.

**Rename…** next to the id gives the type a new one everywhere the project uses it, in one save: its library file, other types' `accepts` lists, the inventory, and the setups (`place: worker` becomes `place: farmer`, and `main-board/fields` targets follow a renamed board). Tables already laid out see the renamed pieces as new ones; **Start over** lays them out again.

## Fields: what changes from card to card

A field is a value each component of the type has its own of, such as a title or a cost. Under **Fields**, **+ Add field** adds one; give it a name, then pick its kind:

- `string`, `int`, `number` or `bool` for text, whole numbers, numbers and yes/no.
- `color` or `image` for a colour or a picture per card.
- `enum` for one of a fixed list of values, typed as `spring, summer, autumn, winter`.

Tick **Optional** when some cards leave it out, and set a **Default** for the value cards get when they do. Use a field on a face by writing `{{title}}` wherever a value goes; the text boxes suggest your fields as you type.

To rename a field, type its new name and press Enter. Every `{{title}}` on the faces follows, and so do the inventory rows of the type and the header of any spreadsheet they are loaded from.

## Faces and layers

Under **Face**, choose the front or back (for cards, tiles and tokens), set its fill and outline, and add layers with **Text**, **Shape** or **Image**. Layers are drawn in list order, so later ones sit on top; the arrows move a layer up or down and × removes it. Click a layer in the list or on the preview to select it and edit it under **Selected layer**: its text, font and alignment, its shape and colours, or its image file and fit, plus where it sits in millimetres, its rotation and opacity. **Show when** draws the layer only for cards where a template such as `{{rare}}` has a value, so one type can cover cards with and without it.

You can also work on the preview directly. Drag a layer to move it, drag a corner of the selected layer to resize it (a text's side handle sets how wide it wraps), and drag the round handle above it to turn it. While you drag, the layer snaps to the 5 mm grid, the face's edges and centre, and the edges and centres of the other layers; an orange line shows what it lined up with. Turning snaps to steps of 15°.

Drop a picture file from your computer onto a face to add it: it is saved into the project's `assets/` folder (next to any file of the same name, never over it) and placed where you dropped it, as large as fits in half the face.

Colour boxes take any CSS colour, a `{{field}}`, or a name from the library's `palette`; the palette's colours appear as swatches next to the box, and the square opens a colour picker.

## Snap spots for boards

Boards, tiles and zones get a **Snap spots** section: where other pieces snap when they are dropped on it. **Add** a grid (a field of action spaces, a row of card slots), points (a score track) or an area (a supply). Spots are drawn on the front with their numbers, the way setups and agents name them, such as `main-board/fields/3`.

Select a target in the list or by clicking one of its spots, then drag on the board:

- A grid moves by spot 0. The handle halfway between spot 0 and its diagonal neighbour sets the spacing, and the handle just beyond the last spot adds or removes columns and rows.
- Points move one by one; while a list of points is selected, click on the board to add the next spot of the track (click outside the board, or pick something else in the inspector, to stop).
- An area moves by its top-left corner and changes size by the opposite one.

**Accepts** limits a target to some types, such as `worker`, so other pieces pass over it.

## Undo

**Undo** and **Redo** at the top step back and forth through your changes to the type, one drag or one edit at a time (typing in a box is one step). Ctrl+Z and Ctrl+Shift+Z do the same when you are not typing in a box. Undoing a change saves the type as it was.

## See it with real data

When the type has fields, **Sample design** above the preview chooses whose values fill the faces: each distinct card of this type already in the box, or stand-in values (the field's name for text, 1 for numbers, the first value for an enum) when there are none.

## Saving

There is no save button. A change is saved a moment after you make it, as long as the type is valid; the status at the top says **Saved to library/cards.yaml** when it is done. While something is wrong, such as a negative corner or a field name with a space in it, the status says so, the problem is listed at the top of the inspector and next to the value that causes it, and nothing is written until it is fixed.

Only the keys you change are rewritten, so comments, blank lines and the order of everything else in the file stay as they were. **Show YAML** shows the type as the file holds it, to check or copy.

If the file changes while you edit (you saved it in your editor, or an agent changed the type), the designer does not overwrite it. It says the file changed and offers **Reload** to take the newer version or **Keep mine** to save yours over it. When you have no unsaved changes, it simply shows the newer version.

## Put the components in the box

The designer makes the type; the inventory says how many of it are in the box. Add an entry to `inventory.yaml` as in [Add a deck of cards](add-a-deck.md), load the cards from a spreadsheet as in [Load cards from a spreadsheet](cards-from-a-spreadsheet.md), or ask an agent as in [Let an agent build components](agent-builds-components.md). The new components appear on the table as soon as the file is saved.
