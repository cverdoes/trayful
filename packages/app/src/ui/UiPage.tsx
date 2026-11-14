// The page at `?ui`: every shared component in every state on one screen, for
// judging how they look apart from the views that use them. Nothing links to it.
import { useState, type ReactNode } from 'react';
import { Badge, Chip } from './Badge';
import { Button, IconButton, type ButtonVariant } from './Button';
import { Card } from './Card';
import { ask, confirm } from './dialogs';
import { EmptyState } from './EmptyState';
import { Field } from './Field';
import { Icon, ICON_NAMES } from './Icon';
import { Menu, type MenuItem } from './Menu';
import { PageHeader } from './PageHeader';
import { Status } from './Status';

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'quiet', 'danger'];

/** A menu's actions that do nothing, to open and move through. */
const nothing = () => undefined;
const SAMPLE_ITEMS: MenuItem[] = [
  {
    label: 'Designs',
    description: 'Type each design as a row of a grid',
    icon: 'grid',
    onSelect: nothing,
  },
  {
    label: 'Every combination',
    description: 'A design for each mix of values',
    icon: 'layers',
    onSelect: nothing,
  },
  {
    label: 'Not now',
    description: 'An action that cannot be picked',
    icon: 'file',
    disabled: true,
    onSelect: nothing,
  },
  { label: 'Remove', icon: 'trash', danger: true, onSelect: nothing },
];

/** Every shared component, a section each. */
export function UiPage() {
  return (
    <main className="ui-page">
      <h1>Trayful components</h1>
      <HeaderSection />
      <Section title="Buttons">
        {VARIANTS.map((variant) => (
          <Button key={variant} variant={variant} icon="plus">
            {variant}
          </Button>
        ))}
        <Button disabled>disabled</Button>
        <IconButton icon="undo" label="Undo" />
        <IconButton icon="redo" label="Redo" disabled />
      </Section>
      <Section title="Menus">
        <Menu
          label="Add"
          button={{ kind: 'primary', icon: 'plus', text: 'Add' }}
          items={SAMPLE_ITEMS}
          align="start"
        />
        <Menu label="More actions" button={{ kind: 'icon', icon: 'more' }} items={SAMPLE_ITEMS} />
      </Section>
      <Section title="Fields">
        <Field label="Deck">
          <input type="text" defaultValue="actions" />
        </Field>
        <Field label="Copies of each" hint="Left empty, one of each">
          <input type="text" placeholder="1" />
        </Field>
        <Field label="Suit">
          <select defaultValue="green">
            <option>green</option>
            <option>red</option>
          </select>
        </Field>
      </Section>
      <Section title="Badges and chips">
        <Badge>10</Badge>
        <Chip>data/actions.csv</Chip>
      </Section>
      <Section title="Icons">
        {ICON_NAMES.map((name) => (
          <span key={name} className="ui-page-icon" title={name}>
            <Icon name={name} size={20} />
          </span>
        ))}
      </Section>
      <Section title="Card">
        <Card
          label="Sample card"
          icon="grid"
          title="Designs"
          summary="2 designs · 5 in the box"
          actions={
            <Menu
              label="Card actions"
              button={{ kind: 'icon', icon: 'more' }}
              items={SAMPLE_ITEMS}
            />
          }
        >
          <p className="ui-page-body">The card's body: fields, then a grid flush with its edges.</p>
        </Card>
      </Section>
      <DialogSection />
      <Section title="Empty state">
        <EmptyState icon="box" title="Nothing in the box yet">
          An empty page says what is missing and what to do about it.
        </EmptyState>
      </Section>
    </main>
  );
}

/** Buttons that ask each kind of question, and what was answered last. */
function DialogSection() {
  const [answer, setAnswer] = useState('Nothing asked yet');
  const yesNo = (yes: boolean) => setAnswer(yes ? 'Yes' : 'No');
  return (
    <Section title="Dialogs">
      <Button
        onClick={() =>
          void confirm({
            title: 'Start this table over?',
            text: 'The table starts again from the project files. You can undo this.',
            action: 'Start over',
          }).then(yesNo)
        }
      >
        Ask yes or no
      </Button>
      <Button
        onClick={() =>
          void confirm({
            title: 'Remove "terrain"?',
            text: 'This takes the name off the image. The file stays in the project.',
            action: 'Remove',
            danger: true,
          }).then(yesNo)
        }
      >
        Ask to remove
      </Button>
      <Button
        onClick={() =>
          void ask({
            title: 'Rename "terrain"',
            text: 'Components that show the image are changed too.',
            label: 'New name',
            value: 'terrain',
            action: 'Rename',
          }).then((text) => setAnswer(text ?? 'Backed out'))
        }
      >
        Ask for a name
      </Button>
      <output aria-label="Answer">{answer}</output>
    </Section>
  );
}

function HeaderSection() {
  return (
    <Section title="Page header and status">
      <PageHeader title="Action card" subtitle="10 in the box">
        <Status tone="ok">Saved</Status>
        <Status tone="busy">Saving…</Status>
        <Status tone="quiet">Saving soon…</Status>
        <Status tone="bad">Not saved</Status>
      </PageHeader>
    </Section>
  );
}

function Section({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section>
      <h2>{title}</h2>
      <div className="ui-page-row">{children}</div>
    </section>
  );
}
