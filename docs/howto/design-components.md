# Design components in the browser

The designer lets you build components by clicking instead of writing YAML: name it, say what it is, give its face a colour, an image and labels, and switch on what it can do, while a preview redraws as you go. Every change is saved to your library files, so they stay the files you would have written by hand.

## Open the designer

Open your project on a table and click **Design** in the toolbar. Only the host (the person who ran `trayful play`) can design; players who joined by invite link see the table only. At the top, **Components**, **Tray** and **Assets** switch between how the components look, how many of each are in the box, and the project's images and colours; **Table** goes back to playing.

The components page has three parts:

- **Components** on the left lists every component in the project, grouped by what it is (pieces, zones, dice and counters), with how many of each are in the box.
- The **preview** in the middle draws the component at its real proportions, front and back, on a 5 mm grid.
- The **panel** on the right builds the component up step by step, top to bottom: **Basics**, **What it is**, its **Face**, what it does, its **Back** once it has one, and its drop areas.

## Make a new component

Click **+ New component**, give it a name and pick what to start like: a poker or mini card, a square or hex tile, a round token, a meeple, a six-sided die, a counter, a board or a zone, each at a common size you can change. **Next** asks what it is (a piece, a zone, a die or a counter), and **Create** makes it. The component is written to the library file that already holds components that are the same kind of thing (pieces go next to your other pieces), with an id made from its name, such as `event-card`.

**Duplicate** copies the selected component into the same file, which is the quickest way to make a variant. **Delete** removes it, but only once nothing in the inventory uses it; take its entries out of `inventory.yaml` first.

**Rename…** next to the id gives the component a new one everywhere the project uses it, in one save: its library file, other components' `accepts` and `stackable.with` lists, the inventory, and the setups (`place: worker` becomes `place: farmer`, and `main-board/fields` targets follow a renamed board). Tables already laid out see the renamed pieces as new ones; **Start over** lays them out again.

## What it is and what it does

**Basics** holds the component's name, id, **Size** in millimetres and description. **What it is** says what the component is: a **Piece** (cards, tiles, tokens, meeples, boards), a **Zone** (an area of the table that holds what is put on it), a **Die** or a **Counter**. Changing it drops the settings that no longer apply, such as a die's values on a piece.

Under **Behaviour**, pieces and zones switch on what they can do, each off until ticked:

- **Flippable (has a back)** gives it a back side, which a **Back** section further down designs.
- **Rotates** lets it turn on the table, by **Rotate step** degrees at a time (90 unless set).
- **Stackable** lets it pile up into stacks and decks. **Stacks with** lists other components that may share its piles, such as coins of another value: type a few letters of a stackable component's name and pick it, and click × on a chip to take it off.

Dice and counters have **Values** instead: a **Range** of whole numbers or a list of values such as `sun, rain, frost`, and whether the value **Can be rolled** or **Steps up and down**.

## Fields: what changes from card to card

A field is a value each card (or other copy of the component) has its own of, such as a title or a cost. Open **Data fields** at the bottom of the panel; **+ Add field** adds one; give it a name, then pick its kind:

- `string`, `int`, `number` or `bool` for text, whole numbers, numbers and yes/no.
- `color` or `image` for a colour or a picture per card.
- `enum` for one of a fixed list of values, typed as `spring, summer, autumn, winter`.

Tick **Optional** when some cards leave it out, and set a **Default** for the value cards get when they do. Use a field on a face by writing `{{title}}` wherever a value goes; the text boxes suggest your fields as you type.

To rename a field, type its new name and press Enter. Every `{{title}}` and label on the faces follows, and so do the component's inventory rows and the header of any spreadsheet they are loaded from.

## Faces, images, labels and layers

Under **Face**, set the outline (**Shape**, and **Corner** for a rectangle), the **Fill** and **Outline colour**. **Image** covers the face with one of the project's images (see [Images and colours](#images-and-colours) below). For an image cut into tiles, **Shows** says which part of it:

- **The whole image**.
- **One tile**: click the tile in the grid under it.
- **Each component picks its tile**, given by each entry of the inventory, as on a sheet of different hex tiles.
- **The tile of its value**, on a die or counter: a strip of six die faces shows the face it rolled.

**Fit** says how an image that is not the face's shape fills it: cropped (**cover**, the default), whole (**contain**) or stretched. The **Back** section has the same settings for the back. A field the back uses (in a label, a colour or an image) is printed on the back, so every player sees it while the component lies face down; the back's fields stay hidden otherwise.

Under **Labels**, **Label** adds text: pick a **Field** to show each card's own value, such as its title, or leave the field empty and type fixed **Text**. Anything else, such as a coloured band, a circle behind the cost or a small picture, goes under **Advanced drawing**, where **Text**, **Shape** and **Picture** add layers.

Layers are drawn first, then labels on top of them; within each, later ones in the list sit on top. The arrows move an item up or down and × removes it. Click an item in the list or on the preview to select it and edit it under **Selected label** or **Selected layer**: its text, font and alignment, its shape and colours, or its image file and fit, plus where it sits in millimetres, its rotation and opacity. **Show when** draws it only for cards where a template such as `{{rare}}` has a value, so one component can cover cards with and without it.

You can also work on the preview directly. Drag a label or layer to move it, drag a corner of the selected one to resize it (a text's side handle sets how wide it wraps), and drag the round handle above it to turn it. While you drag, the layer snaps to the 5 mm grid, the face's edges and centre, and the edges and centres of the other layers; an orange line shows what it lined up with. Turning snaps to steps of 15°.

Drop a picture file from your computer onto a face to make it that side's image: it is saved into the project's `assets/` folder (next to any file of the same name, never over it) and named in `assets.yaml` after its file.

Colour boxes take any CSS colour, a `{{field}}`, or a colour named in the project's `assets.yaml`; those colours appear as swatches next to the box, and the square opens a colour picker.

## Images and colours

The **Assets** page lists the project's images and named colours, as `assets.yaml` holds them. Drop picture files on it, or click **Add images**, to save them into `assets/` and name them after their file (`Die faces.png` becomes `die-faces`). For a sheet of cards or tiles, or a strip of die faces, set **Rows** and **Columns**: the grid drawn over the image shows the tiles it is cut into, numbered left to right, then top to bottom, from 0. **Rename** gives an image a new name and changes every component that shows it. **Remove** takes the name off an image; the file stays, and an image a component still uses cannot be removed.

Under **Colours**, give a colour a name with **Add colour**, change one with its picker, or remove it. Named colours appear as swatches next to every colour box.

## Drop areas for boards

Pieces and zones have a **Drop areas** section: where other pieces land when they are dropped on it. **Add** a grid (a field of action spaces, a row of card slots), points (a score track), an area (a supply), a pile (a discard pile), a row (a tableau that lines cards up) or a bag (pieces drawn blind). A component with drop areas is a container, so what lies in them moves with it. Spots are drawn on the face with their numbers, the way setups and agents name them, such as `main-board/fields/3`.

Select a drop area in the list or by clicking one of its spots, then drag on the board:

- A grid moves by spot 0. The handle halfway between spot 0 and its diagonal neighbour sets the spacing, and the handle just beyond the last spot adds or removes columns and rows.
- Points move one by one; while a list of points is selected, click on the board to add the next spot of the track (click outside the board, or pick something else in the inspector, to stop).
- An area moves by its top-left corner and changes size by the opposite one.

**Accepts** limits a drop area to some components, such as a worker, or to any component of a kind, such as any die, so other pieces pass over it. Pick them the same way as for **Stacks with**.

**Holds** says what the drop area does with what lands in it. Spots hold one thing each, or a pile each. An area keeps things where they are dropped, lines them up in a row, or is a bag that hides them until someone draws one at random. See [modes](../reference/snapping.md#modes).

## Undo

**Undo** and **Redo** at the top step back and forth through your changes to the component, one drag or one edit at a time (typing in a box is one step). Ctrl+Z and Ctrl+Shift+Z do the same when you are not typing in a box. Undoing a change saves the component as it was.

## See it with real data

When the component has fields, **Sample design** above the preview chooses whose values fill the faces: each distinct card of it already in the box, or stand-in values (the field's name for text, 1 for numbers, the first value for an enum) when there are none.

## Saving

There is no save button. A change is saved a moment after you make it, as long as the component is valid; the status at the top says **Saved to library/cards.yaml** when it is done. While something is wrong, such as a negative corner or a field name with a space in it, the status says so, the problem is listed at the top of the inspector and next to the value that causes it, and nothing is written until it is fixed.

Only the keys you change are rewritten, so comments, blank lines and the order of everything else in the file stay as they were. **Show YAML** shows the component as the file holds it, to check or copy.

If the file changes while you edit (you saved it in your editor, or an agent changed the component), the designer does not overwrite it. It says the file changed and offers **Reload** to take the newer version or **Keep mine** to save yours over it. When you have no unsaved changes, it simply shows the newer version.

## Projects from an earlier Trayful

A project still in the first file format (`format: trayful/1` in its manifest) plays as it is, but the designer only offers **Update the project files**. That rewrites the files in the current format, as [`trayful migrate`](../reference/versioning.md#moving-a-project-to-trayful2) does; commit the folder or keep a copy first if you want the old files.

## Put the components in the box

The designer makes the component; the **Tray** says how many of it are in the box. Pick a component on the left, and add to the box:

- **One of every tile**, for a component that picks its tile from a sheet: one design per tile, as a deck named after the component. A sheet of 24 terrain tiles becomes a deck of 24 in one click.
- **One design**, with its field values.
- **Designs in rows**: a table with a column per field and a row per design, each with its own number of copies. Click a `tile` cell to pick the tile from the sheet.
- **Every combination**: values for each field, with commas between them, such as `red, green`; every combination is a design.
- **From a CSV file…**: copies a spreadsheet into the project's `data` folder; its rows show as a table you can edit cell by cell. The header row names the field each column fills in; **+ Column** adds one named after the next field without a column, and **×** takes a column or row out.

Each entry has a **Deck**, which makes its designs start as one pile, and **Copies of each**. Every change is saved to `inventory.yaml` (and the CSV file) as you go, and the components appear on the table at once. A change that would break the project is not saved, and the Tray says why. **Undo** and **Redo** step through the Tray's changes, a CSV import included, the same way as in the designer.

You can also edit `inventory.yaml` by hand as in [Add a deck of cards](add-a-deck.md), load cards from a spreadsheet as in [Load cards from a spreadsheet](cards-from-a-spreadsheet.md), or ask an agent as in [Let an agent build components](agent-builds-components.md).
