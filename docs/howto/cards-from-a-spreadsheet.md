# Load cards from a spreadsheet

When a deck has more than a handful of cards, keep their text in a CSV file. You can edit it in any spreadsheet app (Excel, Numbers, Google Sheets: export or save as CSV) and Trayful reloads it when you save.

## The CSV file

The first row names the fields of the card type. Every other row is one card design. An optional `count` column says how many copies to make. This is the starter's `data/cards.csv`:

<!-- example: examples/starter/data/cards.csv -->

```csv
title,text,value,count
Explore,Draw two cards and keep one.,1,2
Build,Pay 2 to place a token.,2,2
Trade,Swap a card with another player.,1,1
Score,Gain 3 points.,3,1
```

The column names match the `card` type's fields in [`library/cards.yaml`](../../examples/starter/library/cards.yaml): `title`, `text` and `value`. Numbers are read as numbers for `int` and `number` fields, an empty cell leaves the field out (so its `default` applies), and text with commas goes in double quotes, as spreadsheet apps write it.

## Point the inventory at it

<!-- example: examples/starter/inventory.yaml -->

```yaml
- type: card
  deck: cards
  from: data/cards.csv
```

That is the whole deck: six cards in a pile called `cards`.

## Tips

- Add an `id` column to keep a card's id when you rename it. Without one, the id comes from the card's `name` or first text field, so a saved table loses track of a card whose name changes.
- You can mix sources: one entry with `items` and another with `from` can fill the same deck. Harvest Moon does this with [`data/actions.csv`](../../examples/harvest-moon/data/actions.csv).
- A cell that is not a valid value (text in an `int` column, a value not in an `enum`) is reported with the CSV line and the column name.
