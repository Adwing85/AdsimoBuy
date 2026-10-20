const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const euroCompact = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });
const monthFmt = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
const monthShort = new Intl.DateTimeFormat('de-DE', { month: 'short' });

export const formatEuro = (n: number): string => euro.format(n);
export const formatEuroRound = (n: number): string => euroCompact.format(n);
export const formatNumber = (n: number): string => number.format(n);
export const formatDate = (ts: number): string => dateFmt.format(ts);
export const formatShortDate = (ts: number): string => shortDate.format(ts);
export const formatMonth = (ts: number): string => monthFmt.format(ts);
export const formatMonthShort = (ts: number): string => monthShort.format(ts).replace('.', '');

export function formatPercent(fraction: number): string {
  const sign = fraction > 0 ? '+' : fraction < 0 ? '−' : '±';
  return `${sign}${Math.abs(Math.round(fraction * 100))} %`;
}

export function formatRelativeDays(ts: number, now = Date.now()): string {
  const startOfDay = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / 86_400_000);
  if (days <= 0) return 'heute';
  if (days === 1) return 'gestern';
  if (days < 7) return `vor ${days} Tagen`;
  if (days < 14) return 'vor 1 Woche';
  if (days < 60) return `vor ${Math.floor(days / 7)} Wochen`;
  return formatDate(ts);
}

/** Datum für <input type="date"> (lokale Zeit). */
export function toDateInput(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fromDateInput(value: string): number {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12).getTime();
}
