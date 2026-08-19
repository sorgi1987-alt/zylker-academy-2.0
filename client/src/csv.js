// CSV export shared by every list page's "Export CSV" button — plain
// client-side serialization, no server round trip beyond fetching the rows
// (the pages already fetch rows for the table; export just widens perPage).

const escapeCell = (value) => {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** `columns`: [{ label, value: (row) => string }]. */
export function toCsv(rows, columns) {
  const lines = [columns.map((c) => escapeCell(c.label)).join(',')];
  rows.forEach((row) => {
    lines.push(columns.map((c) => escapeCell(c.value(row))).join(','));
  });
  return lines.join('\r\n');
}

// U+FEFF byte-order mark — without it Excel guesses an 8-bit codepage and
// mangles accented names; every other CSV reader ignores it harmlessly.
const BOM = '﻿';

/** Triggers a browser download of `csvText` as `filename`. */
export function downloadCsv(filename, csvText) {
  const blob = new Blob([BOM + csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
