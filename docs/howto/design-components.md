# Design components in the browser

The designer lets you build components by clicking instead of writing YAML: pick a size, switch on what the component can do, add fields, and lay out each face while a preview redraws as you go. Every change is saved to your library files, so they stay the files you would have written by hand.

## Open the designer

Open your project on a table and click **Design** in the toolbar. Only the host (the person who ran `trayful play`) can design; players who joined by invite link see the table only. **Table** at the top goes back to playing.

The designer has three parts:

- **Types** on the left lists every component in the project, grouped by what it is (pieces, zones, dice and counters), with how many of each are in the box.
- The **preview** in the middle draws the component at its real proportions, front and back, on a 5 mm grid.
- The **inspector** on the right holds everything about the component, from its name and behaviours to each label and layer on its faces.

## Make a new component

Click **+ New type**, give it a name and pick what to start from: a poker or mini card, a square or hex tile, a round token, a meeple, a six-sided die, a counter or a board, each at a common size. The component is written to the library file that already holds components that are the same kind of thing (pieces go next to your other pieces), with an id made from its name, such as `event-card`.

**Duplicate** copies the selected component into the same file, which is the quickest way to make a variant. **Delete** removes it, but only once nothing in the inventory uses it; take its entries out of `inventory.yaml` first.

**Rename…** next to the id gives the component a new one everywhere the project uses it, in one save: its library file, other components' `accepts` and `stackable.with` lists, the inventory, and the setups (`place: worker` becomes `place: farmer`, and `main-board/fields` targets follow a renamed board). Tables already laid out see the renamed pieces as new ones; **Start over** lays them out again.

## What it is and what it does

At the top of the inspector, **Is a** says what the component is: a `piece` (cards, tiles, tokens, meeples, boards), a `zone` (a dashed area of the table), a `die` or a `counter`. **Size**, **Outline** (the shape, such as `hex` or `meeple`) and **Corner** set its outline.

Under **Behaviour**, pieces and zones switch on what they can do, each off until ticked:

- **Flippable (has a back)** gives it a back side, which the **Back** tab below designs.
- **Rotates** lets it turn on the table, by **Rotate step** degrees at a time (90 unless set).
- **Stackable** lets it pile up into stacks and decks. **Stacks with** lists other components that may share its piles, such as coins of another value.

Dice and counters have **Values** instead: a **Range** of whole numbers or a list of values such as `sun, rain, frost`, and whether the value **Can be rolled** or **Steps up and down**.

## Fields: what changes from card to card

A field is a value each card (or other copy of the component) has its own of, such as a title or a cost. Under **Fields**, **+ Add field** adds one; give it a name, then pick its kind:

- `string`, `int`, `number` or `bool` for text, whole numbers, numbers and yes/no.
- `color` or `image` for a colour or a picture per card.
- `enum` for one of a fixed list of values, typed as `spring, summer, autumn, winter`.

Tick **Optional** when some cards leave it out, and set a **Default** for the value cards get when they do. Use a field on a face by writing `{{title}}` wherever a value goes; the text boxes suggest your fields as you type.

To rename a field, type its new name and press Enter. Every `{{title}}` and label on the faces follows, and so do the component's inventory rows and the header of any spreadsheet they are loaded from.

## Faces, labels and layers

Under **Face** (or the **Front** and **Back** tabs, for a flippable component), set the side's fill and outline, then add what is drawn on it:

- **Label** adds text: pick a **Field** to show each card's own value, such as its title, or leave the field empty and type fixed **Text**.
- **Text**, **Shape** and **Image** add layers, for anything else: a coloured band, a circle behind the cost, a picture.

Layers are drawn first, then labels on top of them; within each, later ones in the list sit on top. The arrows move an item up or down and × removes it. Click an item in the list or on the preview to select it and edit it under **Selected label** or **Selected layer**: its text, font and alignment, its shape and colours, or its image file and fit, plus where it sits in millimetres, its rotation and opacity. **Show when** draws it only for cards where a template such as `{{rare}}` has a value, so one component can cover cards with and without it.

You can also work on the preview directly. Drag a label or layer to move it, drag a corner of the selected one to resize it (a text's side handle sets how wide it wraps), and drag the round handle above it to turn it. While you drag, the layer snaps to the 5 mm grid, the face's edges and centre, and the edges and centres of the other layers; an orange line shows what it lined up with. Turning snaps to steps of 15°.

Drop a picture file from your computer onto a face to add it: it is saved into the project's `assets/` folder (next to any file of the same name, never over it) and placed where you dropped it, as large as fits in half the face.

Colour boxes take any CSS colour, a `{{field}}`, or a colour named in the project's `assets.yaml`; those colours appear as swatches next to the box, and the square opens a colour picker.

## Drop areas for boards

Pieces and zones have a **Drop areas** section: where other pieces land when they are dropped on it. **Add** a grid (a field of action spaces, a row of card slots), points (a score track) or an area (a supply). A component with drop areas is a container, so what lies in them moves with it. Spots are drawn on the face with their numbers, the way setups and agents name them, such as `main-board/fields/3`.

Select a drop area in the list or by clicking one of its spots, then drag on the board:

- A grid moves by spot 0. The handle halfway between spot 0 and its diagonal neighbour sets the spacing, and the handle just beyond the last spot adds or removes columns and rows.
- Points move one by one; while a list of points is selected, click on the board to add the next spot of the track (click outside the board, or pick something else in the inspector, to stop).
- An area moves by its top-left corner and changes size by the opposite one.

**Accepts** limits a drop area to some components, such as `worker`, so other pieces pass over it.

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

The designer makes the component; the inventory says how many of it are in the box. Add an entry to `inventory.yaml` as in [Add a deck of cards](add-a-deck.md), load the cards from a spreadsheet as in [Load cards from a spreadsheet](cards-from-a-spreadsheet.md), or ask an agent as in [Let an agent build components](agent-builds-components.md). The new components appear on the table as soon as the file is saved.
