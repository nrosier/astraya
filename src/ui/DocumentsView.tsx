/**
 * The Documents workspace (#563): app-scoped destination for PDF exports and saved charts,
 * consolidating what used to be a bare "Build custom PDF…" link in the header. Currently holds
 * the PDF export builder; future additions (saved-charts list, archive browser) go here as
 * sibling sections or tabs without changing the route or nav structure.
 *
 * This screen manages no state of its own — PdfExportBuilder.tsx is the only current child and
 * owns its own UX entirely. Following the same pattern `PreferencesView.tsx` uses: a stable,
 * app-level destination that holds logically-related features (here, all document generation and
 * management).
 */
/**
 * @module ui/DocumentsView
 * @purpose Documents workspace (#563): app-scoped destination for PDF builder and saved charts.
 * @conventions Thin wrapper layout reusing PdfExportBuilder; no state management of its own. i18n text comes from co-located DocumentsView.messages.ts.
 * @exports DocumentsView
 */
import { useMessages } from './messages.js';
import { documentsViewMessages } from './DocumentsView.messages.js';
import { sharedMessages } from './shared.messages.js';
import { PdfExportBuilder } from './PdfExportBuilder.js';

export function DocumentsView(): React.JSX.Element {
  const t = useMessages(documentsViewMessages);
  const shared = useMessages(sharedMessages);

  return (
    <main className="shell">
      <p className="back">
        <a href="#/people">&larr; {shared.back}</a>
      </p>
      <h1>{t.heading}</h1>
      <p>{t.intro}</p>

      <h2>{t.pdfExportHeading}</h2>
      <PdfExportBuilder />
    </main>
  );
}
