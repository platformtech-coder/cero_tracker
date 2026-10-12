import { format, parseISO, isValid } from 'date-fns';

function parseAnyDate(val: string | Date | null | undefined): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isValid(val) ? val : null;
  if (typeof val !== 'string') return null;

  const trimmed = val.trim();
  if (!trimmed) return null;

  // 1. Try parseISO
  let d = parseISO(trimmed);
  if (isValid(d)) return d;

  // 2. Try standard Date constructor
  d = new Date(trimmed);
  if (isValid(d)) return d;

  // 3. Handle Apps Script format: "Sun, 11-Oct-26 07:02:15"
  const cleanStr = trimmed.replace(/^[A-Za-z]+,\s*/, '');
  d = new Date(cleanStr);
  if (isValid(d)) return d;

  return null;
}

export function formatDate(val: string | Date | null | undefined): string {
  if (!val) return '—';
  const d = parseAnyDate(val);
  return d ? format(d, 'dd-MMM-yy') : String(val);
}

export function formatTime(val: string | Date | null | undefined): string {
  if (!val) return '';
  const d = parseAnyDate(val);
  return d ? format(d, 'h:mm a') : '';
}

export function formatDateTime(val: string | Date | null | undefined): string {
  if (!val) return '—';
  const d = parseAnyDate(val);
  return d ? format(d, 'dd-MMM-yy h:mm a') : String(val);
}