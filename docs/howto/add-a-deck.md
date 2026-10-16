# Add a deck of cards

Cards take two steps: a **component** in a library file says what a card looks like and what it can do, and an **entry in the inventory** says which cards are in the box.

## 1. Define the card

Add the component to a file in `library/`. This is the Harvest Moon action card:

<!-- example: examples/harvest-moon/library/cards.yaml -->

```yaml
- id: action-card
  name: Action card
  size: [63, 88]
  is: piece
  flippable:
    back:
      fill: ink
      image: card-back
  rotates: true
  stackable: true
  fields:
    name: string
    cost: { type: int, default: 0 }
    suit: { enum: [red, green], description: Which market row the card belongs to. }
    text: string?
    art: image?
  face:
    corner: 3
    fill: '{{suit}}'
    layers:
      - { image: '{{art}}', at: [5, 15], when: '{{art}}', size: [53, 40] }
      - { shape: circle, at: [55, 8], r: 5, fill: gold }
    labels:
      - { field: name, at: [5, 5], font: { size: 14, weight: bold }, color: white }
      - { field: text, at: [5, 60], width: 53, font: { size: 9 }, color: white }
      - { field: cost, at: [55, 8], align: center, valign: middle, font: { weight: bold } }
```

- `is: piece` says it is something you pick up and move. What makes it a card is the behaviours it switches on: `flippable` gives it a back, `rotates` lets it turn, and `stackable` lets cards pile up into a deck that can be shuffled and dealt. Each behaviour is off unless you write it.
- `size` is in millimetres. 63 × 88 is a standard poker card.
- `fields` are the things that differ from card to card. `string?` means the field may be left out; `default` fills it in when a card leaves it out; `enum` limits it to a few values.
- `face` is the front: its `corner` radius, a `fill` colour, and `labels`, each showing a field's value at a position in millimetres from the card's top-left corner. `layers` draw anything else, here the card's picture and the circle behind the cost. `'{{suit}}'` is replaced by each card's suit, and `ink`, `gold`, `red` and `green` are colours named in the project's [`assets.yaml`](../../examples/harvest-moon/assets.yaml), as is the `card-back` image.
- `back` under `flippable` is how the face-down side looks. Leave it out (`flippable: true`) for a plain back.

The [library reference](../reference/library.md) lists every key, and [Faces and templates](../reference/faces-and-templates.md) explains how drawing works.

## 2. Put the cards in the box

In `inventory.yaml`, add an entry with `deck`, so the cards start as one pile, and one item per card design:

<!-- example: examples/harvest-moon/inventory.yaml -->

```yaml
- component: action-card
  deck: actions
  items:
    - name: Harvest
      cost: 1
      suit: green
      text: Gain 2 grain.
      art: assets/art/harvest.svg
      count: 3
    - { name: Raid, cost: 2, suit: red, text: Steal 1 grain from a neighbour., count: 2 }
```

`count` makes copies of one design. Several entries can share a deck name: Harvest Moon adds more action cards to the same `actions` deck from a spreadsheet (see [Load cards from a spreadsheet](cards-from-a-spreadsheet.md)). Only stackable components can be in a deck.

Save, and the deck appears on the open table. Each card gets a stable id from its component and name, such as `action-card.harvest.2`, which saved tables and agents use to refer to it.

## Check it

```sh
pnpm trayful validate examples/harvest-moon
```

A misspelt field, a value outside an `enum` or a missing required field is reported with the file, line and column of the card that has it.
