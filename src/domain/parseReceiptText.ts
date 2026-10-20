import { detectChain, type ChainId } from './stores';
import { normalize, parseDecimal, round2 } from './text';

export type ReceiptLineKind = 'item' | 'deposit';

export interface ParsedReceiptLine {
  name: string;
  quantity: number;
  unit: 'stk' | 'kg';
  unitPrice: number;
  totalPrice: number;
  kind: ReceiptLineKind;
}

export interface ParsedReceipt {
  chain: ChainId | null;
  date: number | null;
  total: number | null;
  items: ParsedReceiptLine[];
}

const PRICE_AT_END = /^(.*?)\s*(-?\s?\d{1,4}[.,]\d{2})\s*-?\s*(?:€|eur)?\s*(?:[*#]?\s?[a-d0-9]{1,2}\s?[*#]?)?\s*$/i;
const QTY_LINE = /^\s*(\d{1,3})\s*(?:stk\.?|st\.?)?\s*[x×*]\s*(\d{1,4}[.,]\d{2})(?:\s*(?:€|eur))?\s*(?:(-?\d{1,4}[.,]\d{2}))?/i;
const WEIGHT_LINE =
  /(\d{1,3}[.,]\d{1,3})\s*kg\s*[x×*]\s*(\d{1,4}[.,]\d{2})\s*(?:€|eur)?\s*\/\s*kg(?:\s+(-?\d{1,4}[.,]\d{2}))?/i;
const TOTAL_LINE = /^(?:summe|zu\s*zahlen|gesamt(?:betrag|summe)?|total|endsumme|zwischensumme|betrag)\b/i;
const DATE = /\b(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})\b/;
const DEPOSIT_WORDS = /(pfand|leergut|einweg|mehrweg)/i;
const SKIP_WORDS =
  /(mwst|steuer|brutto|^netto\b|netto\s|kartenzahlung|karte|girocard|ec[-\s]?cash|maestro|visa|mastercard|r[uü]ckgeld|gegeben|bar\b|kasse|bon[-\s]?nr|beleg|terminal|trace|tse|signatur|seriennummer|uhrzeit|datum|vielen dank|filiale|tel\.?|www\.|ust|steuer-?nr|kundenbeleg|anzahl artikel|posten)/i;

/** Korrigiert typische OCR-Fehler in Preisen ("1,O9" -> "1,09", "2.5O" -> "2.50"). */
function fixOcrDigits(line: string): string {
  return line
    .replace(/(\d)[,.]([0-9OoIlSB]{2})(?![0-9a-z])/gi, (_m, a: string, b: string) => {
      const digits = b.replace(/[Oo]/g, '0').replace(/[Il]/g, '1').replace(/S/g, '5').replace(/B/g, '8');
      return `${a},${digits}`;
    })
    .replace(/(\d)\s+[,.]\s*(\d{2})\b/g, '$1,$2');
}

function cleanItemName(raw: string): string {
  return raw
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s*#.:\-]+|[\s*#.:\-]+$/g, '')
    .trim();
}

function parseDate(text: string): number | null {
  const m = text.match(DATE);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day, 12, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/**
 * Heuristischer Parser für OCR-Text deutscher Kassenbons (Lidl, Aldi, REWE, EDEKA, ...).
 * Erkennt Artikelzeilen ("Bananen 1,29 A"), Mengenzeilen ("2 x 0,79"), Gewichtszeilen
 * ("0,756 kg x 1,29 EUR/kg"), Rabatte, Pfand, Summe, Datum und Markt.
 */
export function parseReceiptText(text: string): ParsedReceipt {
  const lines = text
    .split(/\r?\n/)
    .map((l) => fixOcrDigits(l.trim()))
    .filter((l) => l.length > 0);

  const items: ParsedReceiptLine[] = [];
  let total: number | null = null;
  let pendingName: string | null = null;
  let pendingQty: { qty: number; unitPrice: number } | null = null;
  let lastItem: ParsedReceiptLine | null = null;

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (TOTAL_LINE.test(normalize(line))) {
      const m = line.match(/(-?\d{1,5}[.,]\d{2})/g);
      if (m && !/zwischensumme/i.test(lower)) {
        total = parseDecimal(m[m.length - 1]);
        break; // Danach folgen nur noch Zahlungs- und Steuerinformationen.
      }
      continue;
    }

    const weight = line.match(WEIGHT_LINE);
    if (weight) {
      const kg = parseDecimal(weight[1]);
      const perKg = parseDecimal(weight[2]);
      const sum = weight[3] ? parseDecimal(weight[3]) : round2(kg * perKg);
      if (pendingName) {
        lastItem = { name: pendingName, quantity: kg, unit: 'kg', unitPrice: perKg, totalPrice: sum, kind: 'item' };
        items.push(lastItem);
        pendingName = null;
      } else if (lastItem && Math.abs(lastItem.totalPrice - round2(kg * perKg)) < 0.05) {
        lastItem.quantity = kg;
        lastItem.unit = 'kg';
        lastItem.unitPrice = perKg;
      }
      continue;
    }

    const qty = line.match(QTY_LINE);
    if (qty && !/[a-zäöüß]{3,}/i.test(line.replace(/stk|eur/gi, ''))) {
      const q = Number(qty[1]);
      const unitPrice = parseDecimal(qty[2]);
      const lineTotal = qty[3] ? parseDecimal(qty[3]) : round2(q * unitPrice);
      if (pendingName && qty[3]) {
        lastItem = { name: pendingName, quantity: q, unit: 'stk', unitPrice, totalPrice: lineTotal, kind: 'item' };
        items.push(lastItem);
        pendingName = null;
      } else if (lastItem && lastItem.quantity === 1 && Math.abs(lastItem.totalPrice - round2(q * unitPrice)) < 0.02) {
        lastItem.quantity = q;
        lastItem.unitPrice = unitPrice;
      } else {
        pendingQty = { qty: q, unitPrice };
      }
      continue;
    }

    if (SKIP_WORDS.test(lower) && !DEPOSIT_WORDS.test(lower)) continue;

    const priced = line.match(PRICE_AT_END);
    if (priced) {
      const name = cleanItemName(priced[1]);
      const price = parseDecimal(priced[2].replace(/\s/g, ''));
      const trailingMinus = /-\s*(?:€|eur)?\s*(?:[a-d0-9]{1,2})?\s*$/i.test(line.slice(priced[1].length + priced[2].length));
      const value = trailingMinus && price > 0 ? -price : price;
      if (!/[a-zäöüß]{2}/i.test(name)) {
        // Preis ohne Namen: gehört zu einem Namen in der Zeile davor.
        if (pendingName) {
          lastItem = { name: pendingName, quantity: 1, unit: 'stk', unitPrice: value, totalPrice: value, kind: 'item' };
          items.push(lastItem);
          pendingName = null;
        }
        continue;
      }

      if (DEPOSIT_WORDS.test(name)) {
        lastItem = { name, quantity: 1, unit: 'stk', unitPrice: value, totalPrice: value, kind: 'deposit' };
        items.push(lastItem);
        pendingName = null;
        continue;
      }

      if (value < 0 && lastItem?.kind === 'item') {
        // Rabattzeile ("Lidl Plus Rabatt", "Preisvorteil" ...) direkt mit dem vorherigen Artikel verrechnen.
        lastItem.totalPrice = round2(lastItem.totalPrice + value);
        lastItem.unitPrice = round2(lastItem.totalPrice / lastItem.quantity);
        continue;
      }

      const item: ParsedReceiptLine = { name, quantity: 1, unit: 'stk', unitPrice: value, totalPrice: value, kind: 'item' };
      if (pendingQty && Math.abs(round2(pendingQty.qty * pendingQty.unitPrice) - value) < 0.02) {
        item.quantity = pendingQty.qty;
        item.unitPrice = pendingQty.unitPrice;
      }
      pendingQty = null;
      pendingName = null;
      items.push(item);
      lastItem = item;
      continue;
    }

    // Zeile ohne Preis: evtl. Artikelname, dessen Preis/Gewicht in der nächsten Zeile steht.
    if (items.length > 0 || /[a-zäöüß]{3,}/i.test(line)) {
      const name = cleanItemName(line);
      pendingName = /[a-zäöüß]{3,}/i.test(name) && name.length <= 40 ? name : null;
    }
  }

  // Unplausible Beträge (OCR-Fehler, Kopfzeilen) aussortieren.
  const plausible = items.filter((i) => Math.abs(i.totalPrice) < 500 && i.totalPrice !== 0);

  return {
    chain: detectChain(text),
    date: parseDate(text),
    total,
    items: plausible,
  };
}

export function sumItems(items: readonly { totalPrice: number }[]): number {
  return round2(items.reduce((s, i) => s + i.totalPrice, 0));
}
