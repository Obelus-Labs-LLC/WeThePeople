import React, { useCallback } from 'react';
import { Download } from 'lucide-react';

interface CSVColumn {
  key: string;
  label: string;
}

interface CSVExportProps {
  data: Record<string, any>[];
  filename: string;
  columns?: CSVColumn[];
}

function escapeCSV(value: any): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const CSVExport: React.FC<CSVExportProps> = ({ data, filename, columns }) => {
  const handleExport = useCallback(() => {
    if (data.length === 0) return;

    // Determine columns: use provided columns or auto-detect from first row
    const cols: CSVColumn[] = columns || Object.keys(data[0]).map((key) => ({ key, label: key }));

    // Build CSV
    const header = cols.map((c) => escapeCSV(c.label)).join(',');
    const rows = data.map((row) =>
      cols.map((c) => escapeCSV(row[c.key])).join(',')
    );
    const csv = [header, ...rows].join('\n');

    // Create and trigger download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [data, filename, columns]);

  return (
    <button
      onClick={handleExport}
      disabled={data.length === 0}
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-zinc-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
      title="Export as CSV"
    >
      <Download size={14} />
      Export CSV
    </button>
  );
};

export default CSVExport;
