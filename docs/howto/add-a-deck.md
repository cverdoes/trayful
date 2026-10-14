# Add a deck of cards

Cards take two steps: a **type** in a library file says what a card looks like, and an **entry in the inventory** says which cards are in the box.

## 1. Define the card type

Add the type to a file in `library/`. This is the Harvest Moon action card:

<!-- example: examples/harvest-moon/library/cards.yaml -->

```yaml
- id: action-card
  base: card
  name: Action card
  size: [63, 88]
  corner: 3
  fields:
    name: string
    cost: { type: int, default: 0 }
    suit: { enum: [red, green], description: Which market row the card belongs to. }
    text: string?
    art: image?
  front:
    fill: '{{suit}}'
    layers:
      - { text: '{{name}}', at: [5, 5], font: { size: 14, weight: bold }, color: white }
      - { image: '{{art}}', at: [5, 15], size: [53, 40], when: '{{art}}' }
      - { text: '{{text}}', at: [5, 60], width: 53, font: { size: 9 }, color: white }
      - { shape: circle, at: [55, 8], r: 5, fill: gold }
      - { text: '{{cost}}', at: [55, 8], align: center, valign: middle, font: { weight: bold } }
  back:
    fill: ink
    layers:
      - { image: assets/card-back.svg }
```

- `base: card` makes it behave like a card: two sides, stacks into piles, can be shuffled and dealt.
- `size` is in millimetres. 63 × 88 is a standard poker card.
- `fields` are the things that differ from card to card. `string?` means the field may be left out; `default` fills it in when a card leaves it out; `enum` limits it to a few values.
- `front` and `back` are drawn from `layers`, in order. `{{name}}` is replaced by each card's `name`. Positions are millimetres from the card's top-left corner.

The [library reference](../reference/library.md) lists every layer key, and [Faces and templates](../reference/faces-and-templates.md) explains how drawing works.

## 2. Put the cards in the box

In `inventory.yaml`, add an entry with `deck`, so the cards start as one pile, and one item per card design:

<!-- example: examples/harvest-moon/inventory.yaml -->

```yaml
- type: action-card
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

`count` makes copies of one design. Several entries can share a deck name: Harvest Moon adds more action cards to the same `actions` deck from a spreadsheet (see [Load cards from a spreadsheet](cards-from-a-spreadsheet.md)).

Save, and the deck appears on the open table. Each card gets a stable id from its type and name, such as `action-card.harvest.2`, which saved tables and agents use to refer to it.

## Check it

```sh
pnpm trayful validate examples/harvest-moon
```

A misspelt field, a value outside an `enum` or a missing required field is reported with the file, line and column of the card that has it.
