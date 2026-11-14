import { useState } from 'react';
import { Button } from '../../ui/Button';
import { useDesign } from '../store';
import { typeYaml } from '../yaml';

/** The type as its library file will hold it, to read and copy. Edits happen in the designer or an editor. */
export function YamlPane() {
  const draft = useDesign((s) => s.draft);
  const [open, setOpen] = useState(false);
  if (!draft) return null;
  return (
    <section className="design-yaml">
      <Button variant="quiet" icon="code" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide YAML' : 'Show YAML'}
      </Button>
      {open && <pre aria-label="YAML">{typeYaml(draft)}</pre>}
    </section>
  );
}
