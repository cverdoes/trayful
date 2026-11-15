import { Badge } from '../../ui/Badge';
import { Icon } from '../../ui/Icon';
import { useDesign, type InspectorPage } from '../store';

/**
 * A row of the inspector's main page that opens a page of its own: what it
 * holds, a count, and a line naming what is there.
 */
export function PageLink({
  title,
  count,
  summary,
  page,
}: Readonly<{ title: string; count: number; summary: string; page: InspectorPage }>) {
  return (
    <button
      type="button"
      className="design-page-link"
      onClick={() => useDesign.setState({ page, layer: undefined, target: undefined })}
    >
      <span className="design-page-link-text">
        <strong>{title}</strong>
        <small>{summary}</small>
      </span>
      <Badge>{count}</Badge>
      <Icon name="right" />
    </button>
  );
}
