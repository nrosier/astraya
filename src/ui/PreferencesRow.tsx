/**
 * One Preferences setting as a two-column row (#966): the title and its muted description on the left (60%), the
 * control on the right (40%, right-aligned). Stacks on a phone. The control keeps its own accessible name.
 */
/**
 * @module ui/PreferencesRow
 * @purpose The 60/40 label-to-control row every Preferences setting sits in (#966), shared by the Preferences page and the settings controls it hosts.
 * @conventions Layout only: holds no state and no text of its own, so the caller passes already-translated strings. Styles are `.preferences-row*` in `app.css`.
 * @exports PreferencesRow
 */
export function PreferencesRow({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string | undefined;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="preferences-row">
      <div className="preferences-row-text">
        <p className="preferences-row-title">{title}</p>
        {description !== undefined && <p className="preferences-row-description">{description}</p>}
      </div>
      <div className="preferences-row-control">{children}</div>
    </div>
  );
}
