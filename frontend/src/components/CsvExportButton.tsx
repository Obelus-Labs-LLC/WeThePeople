import React from 'react';
import { Download } from 'lucide-react';
import { getApiBaseUrl } from '../api/client';

/**
 * Small download-as-CSV affordance for data tables. Audit item #8.
 *
 * The backend already exposes /export/{table}.csv (see routers/bulk.py)
 * for every aggregated table; we just need to make the per-page
 * download visible. This component renders a unified pill the user
 * can click on any data view that has a backing table.
 *
 * Usage:
 *   <CsvExportButton table="lobbying_records" filters={{ company: "Ally Financial" }} />
 *
 * If `filters` is provided, they're appended as query string params.
 * The backend's /export endpoint accepts the same filter params as
 * the list endpoints, so a query like:
 *   /export/lobbying_records.csv?company=Ally Financial
 * downloads only the rows matching the filter.
 *
 * If `href` is provided, it overrides the auto-built URL — useful when
 * the data view doesn't map cleanly to a single table (e.g. a
 * cross-sector aggregate).
 */
interface CsvExportButtonProps {
  /** The /export/{table}.csv table name. Optional if `href` is given. */
  table?: string;
  /** Query string filters appended to the export URL. */
  filters?: Record<string, string | number | boolean | undefined>;
  /** Override URL when /export/{table} doesn't fit. */
  href?: string;
  /** Suggested filename for the downloaded file. */
  filename?: string;
  /** Display label. Defaults to "Download CSV". */
  label?: string;
  /** Compact variant for inline placement next to a table header. */
  compact?: boolean;
}

export default function CsvExportButton({
  table,
  filters,
  href,
  filename,
  label = 'Download CSV',
  compact = false,
}: CsvExportButtonProps) {
  // Build the download URL. Either an explicit href or the canonical
  // /export/{table}.csv form.
  let url: string;
  if (href) {
    url = href;
  } else if (table) {
    const base = getApiBaseUrl();
    const params = new URLSearchParams();
    if (filters) {
      for (const [k, v] of Object.entries(filters)) {
        if (v !== undefined && v !== null && v !== '') {
          params.set(k, String(v));
        }
      }
    }
    const qs = params.toString();
    url = `${base}/export/${table}.csv${qs ? '?' + qs : ''}`;
  } else {
    return null;
  }

  // The download attribute hints the filename. Browsers honor it for
  // same-origin URLs (our /api proxy routes are same-origin). For
  // cross-origin URLs the server's Content-Disposition header takes
  // precedence; the backend already sets it appropriately.
  const downloadName = filename || (table ? `${table}.csv` : 'export.csv');

  if (compact) {
    return (
      <a
        href={url}
        download={downloadName}
        className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-amber-400 transition-colors"
        title="Download these rows as CSV"
      >
        <Download size={12} />
        CSV
      </a>
    );
  }

  return (
    <a
      href={url}
      download={downloadName}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-800 hover:border-zinc-600 text-xs text-zinc-300 hover:text-white transition-colors no-underline"
      style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
    >
      <Download size={12} />
      {label}
    </a>
  );
}
