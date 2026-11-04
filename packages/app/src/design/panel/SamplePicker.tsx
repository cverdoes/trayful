import { designName, distinctDesigns } from './samples';
import { useDesign } from './store';

/**
 * Which design's field values fill the faces: one per distinct design in the box,
 * named by its first text value, or stand-in values when the box has none.
 */
export function SamplePicker() {
  const draft = useDesign((s) => s.draft);
  const sample = useDesign((s) => s.sample);
  const components = useDesign((s) => s.components);
  if (!draft?.fields || Object.keys(draft.fields).length === 0) return null;
  const designs = distinctDesigns(components.filter((c) => c.type === draft.id));
  return (
    <label className="design-sample">
      Sample design{' '}
      <select
        value={sample ?? ''}
        onChange={(e) => useDesign.setState({ sample: e.target.value || undefined })}
      >
        <option value="">Stand-in values</option>
        {designs.map((c) => (
          <option key={c.id} value={c.id}>
            {designName(c)}
          </option>
        ))}
      </select>
    </label>
  );
}
