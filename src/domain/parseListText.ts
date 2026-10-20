import { capitalize, normalize } from './text';

export interface ParsedListEntry {
  name: string;
  quantity?: string;
}

const UNIT =
  '(?:x|stk\\.?|stück|stueck|st\\.?|kg|g|gr|l|ltr|liter|ml|pck\\.?|pkg|packung(?:en)?|pack|dose(?:n)?|flasche(?:n)?|becher|bund|beutel|glas|gläser|netz|tüte(?:n)?|kiste(?:n)?|rolle(?:n)?|scheibe(?:n)?|tafel(?:n)?)';

const NUMBER = '(\\d+(?:[.,]\\d+)?|½|¼|ein(?:e|en)?|zwei|drei|vier|fünf|sechs)';

const LEADING_QTY = new RegExp(`^${NUMBER}\\s*${UNIT}?\\.?\\s+(.+)$`, 'i');
const TRAILING_QTY = new RegExp(`^(.+?)[\\s,(]+${NUMBER}\\s*${UNIT}?\\.?\\)?$`, 'i');
const ATTACHED_X = /^(\d+)\s*[x×*]\s*(.+)$/i;

/** Überschriften wie "Einkaufsliste", "Einkauf Samstag" oder "Drogerie:" sind keine Artikel. */
const HEADING = /^(?:einkaufs?(?:liste|zettel)?|liste|to\s?do|wochenendeinkauf|wocheneinkauf)\b|:\s*$/i;

/** Aufzählungszeichen, Checkboxen und Nummerierungen am Zeilenanfang. */
const BULLET = /^(?:[\s\-–—*•·>○●◦▪■□☐☑☒✓✔]+|\[\s?[xX✓]?\s?\]\s*|\(\s?\)\s*|\d{1,2}[.)]\s+)+/;

function cleanName(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.;:\-–]+|[\s,.;:\-–]+$/g, '')
    .trim();
}

function formatQty(num: string, unit?: string): string {
  const u = unit?.replace(/\.$/, '');
  if (!u || /^x$/i.test(u)) return `${num}×`;
  return `${num} ${u}`;
}

/** Zerlegt eine Zeile wie "2x Milch", "500 g Hackfleisch" oder "Eier 10" in Name und Menge. */
export function parseListLine(line: string): ParsedListEntry | null {
  if (HEADING.test(line.trim())) return null;
  let text = line.replace(BULLET, '').trim();
  text = cleanName(text);
  if (!text) return null;
  // OCR-Müll: braucht mindestens zwei Buchstaben.
  if ((text.match(/[a-zäöüß]/gi) ?? []).length < 2) return null;

  let m = text.match(ATTACHED_X);
  if (m) return { name: capitalize(cleanName(m[2])), quantity: `${m[1]}×` };

  m = text.match(LEADING_QTY);
  if (m && /[a-zäöüß]/i.test(m[2])) {
    const unitMatch = text.slice(m[1].length).trim().match(new RegExp(`^${UNIT}\\.?\\s`, 'i'));
    return {
      name: capitalize(cleanName(m[2])),
      quantity: formatQty(m[1], unitMatch ? unitMatch[0].trim() : undefined),
    };
  }

  m = text.match(TRAILING_QTY);
  if (m && /[a-zäöüß]{2}/i.test(m[1])) {
    const rest = text.slice(m[1].length).replace(/^[\s,(]+/, '').replace(/\)$/, '');
    const unitMatch = rest.slice(m[2].length).trim().match(new RegExp(`^${UNIT}\\.?$`, 'i'));
    return {
      name: capitalize(cleanName(m[1])),
      quantity: formatQty(m[2], unitMatch ? unitMatch[0] : undefined),
    };
  }

  return { name: capitalize(text) };
}

/**
 * Wandelt erkannten oder eingefügten Text in Listeneinträge um.
 * Zeilen werden zusätzlich an Kommas/Semikolons getrennt ("Milch, Eier, Brot").
 */
export function parseListText(text: string): ParsedListEntry[] {
  const parts = text
    .split(/\r?\n/)
    .flatMap((line) => line.split(/[;,](?!\d)/))
    .map((p) => p.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const result: ParsedListEntry[] = [];
  for (const part of parts) {
    const entry = parseListLine(part);
    if (!entry) continue;
    const key = normalize(entry.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }
  return result;
}

/** Extrahiert eine numerische Menge aus "2×", "3 Stk" usw. (für Preisschätzungen); Gewichte zählen als 1. */
export function quantityMultiplier(quantity?: string): number {
  if (!quantity) return 1;
  const m = quantity.match(/^(\d+(?:[.,]\d+)?)\s*(×|x|stk|stück|st|pck|packung|dose|flasche|becher|glas|netz)?/i);
  if (!m) return 1;
  if (!m[2] && /\d\s*[a-z]/i.test(quantity)) return 1;
  const n = Number.parseFloat(m[1].replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n < 100 ? n : 1;
}
