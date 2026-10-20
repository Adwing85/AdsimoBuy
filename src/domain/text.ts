/** Normalisiert Text für Vergleiche: Kleinbuchstaben, Umlaute ausgeschrieben, nur a-z/0-9 und Leerzeichen. */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokens(input: string): string[] {
  const n = normalize(input);
  return n ? n.split(' ') : [];
}

/** Erster Buchstabe groß, Rest unverändert ("milch" -> "Milch"). */
export function capitalize(input: string): string {
  const s = input.trim();
  return s ? s.charAt(0).toLocaleUpperCase('de-DE') + s.slice(1) : s;
}

/** Wandelt "1,29" / "1.29" / "-0,30" in eine Zahl um. */
export function parseDecimal(input: string): number {
  return Number.parseFloat(input.replace(/\s/g, '').replace(',', '.'));
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** YYYY-MM-DD in lokaler Zeit. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function monthKey(ts: number): string {
  return dayKey(ts).slice(0, 7);
}

/** Bon-Bezeichnungen in GROSSBUCHSTABEN lesbar machen: "BIO VOLLMILCH 3,8%" -> "Bio Vollmilch 3,8%". */
export function prettifyName(raw: string): string {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (/[a-zäöüß]/.test(s)) return s;
  return s
    .toLocaleLowerCase('de-DE')
    .replace(/(^|[\s\-/(])([a-zäöü])/g, (_m, before: string, c: string) => before + c.toLocaleUpperCase('de-DE'));
}
