import { useState } from 'react';
import { useDesign } from './store';
import { typeYaml } from './yaml';

/** The type as its library file will hold it, to read and copy. Edits happen in the designer or an editor. */
export function YamlPane() {
  const draft = useDesign((s) => s.draft);
  const file = useDesign((s) => (s.draft ? s.library?.types[s.draft.id] : undefined));
  const [open, setOpen] = useState(false);
  if (!draft) return null;
  return (
    <section className="design-yaml">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide YAML' : 'Show YAML'}
      </button>
      {file && <span className="muted"> in {file}</span>}
      {open && <pre aria-label="YAML">{typeYaml(draft)}</pre>}
    </section>
  );
}
