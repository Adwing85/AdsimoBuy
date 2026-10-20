import type { CategoryId } from './categories';

export interface Ingredient {
  name: string;
  /** Menge für die Grundportionen des Rezepts; null = "nach Bedarf". */
  amount: number | null;
  unit: string | null;
  category: CategoryId;
  /** Typischer Vorrat (Salz, Öl, Gewürze …) – standardmäßig nicht auf die Liste. */
  pantry: boolean;
}

type UnitKind = 'mass' | 'volume' | 'count' | 'spoon';

interface UnitInfo {
  canonical: string;
  kind: UnitKind;
  plural?: string;
}

const UNITS: Array<[RegExp, UnitInfo]> = [
  [/^(g|gr|gramm)$/, { canonical: 'g', kind: 'mass' }],
  [/^(kg|kilo|kilogramm)$/, { canonical: 'kg', kind: 'mass' }],
  [/^(ml|milliliter)$/, { canonical: 'ml', kind: 'volume' }],
  [/^(cl)$/, { canonical: 'cl', kind: 'volume' }],
  [/^(l|liter|ltr)$/, { canonical: 'l', kind: 'volume' }],
  [/^(el|essl[oö]ffel|tbsp)$/, { canonical: 'EL', kind: 'spoon' }],
  [/^(tl|teel[oö]ffel|tsp)$/, { canonical: 'TL', kind: 'spoon' }],
  [/^(prise|prisen)$/, { canonical: 'Prise', kind: 'spoon', plural: 'Prisen' }],
  [/^(stk|st|stück|stueck|piece|pcs|x|×)$/, { canonical: 'Stk', kind: 'count' }],
  [/^(zehe|zehen)$/, { canonical: 'Zehe', kind: 'count', plural: 'Zehen' }],
  [/^(dose|dosen)$/, { canonical: 'Dose', kind: 'count', plural: 'Dosen' }],
  [/^(packung|packungen|pck|pkg|päckchen|paeckchen)$/, { canonical: 'Packung', kind: 'count', plural: 'Packungen' }],
  [/^(becher)$/, { canonical: 'Becher', kind: 'count' }],
  [/^(bund)$/, { canonical: 'Bund', kind: 'count' }],
  [/^(scheibe|scheiben)$/, { canonical: 'Scheibe', kind: 'count', plural: 'Scheiben' }],
  [/^(glas|gläser|glaeser)$/, { canonical: 'Glas', kind: 'count', plural: 'Gläser' }],
  [/^(flasche|flaschen)$/, { canonical: 'Flasche', kind: 'count', plural: 'Flaschen' }],
  [/^(kopf|köpfe|koepfe)$/, { canonical: 'Kopf', kind: 'count', plural: 'Köpfe' }],
  [/^(stange|stangen)$/, { canonical: 'Stange', kind: 'count', plural: 'Stangen' }],
  [/^(zweig|zweige)$/, { canonical: 'Zweig', kind: 'count', plural: 'Zweige' }],
  [/^(blatt|blätter|blaetter)$/, { canonical: 'Blatt', kind: 'count', plural: 'Blätter' }],
];

function unitInfo(unit: string | null): UnitInfo | null {
  if (!unit) return null;
  const u = unit.trim().toLowerCase().replace(/\.$/, '');
  if (!u) return null;
  for (const [re, info] of UNITS) if (re.test(u)) return info;
  return null;
}

/** Vereinheitlicht Einheiten ("Gramm" → "g", "Esslöffel" → "EL"); Unbekanntes bleibt erhalten. */
export function normalizeUnit(unit: string | null): string | null {
  if (!unit?.trim()) return null;
  return unitInfo(unit)?.canonical ?? unit.trim();
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Rundet Gramm/Milliliter einkaufsfreundlich: < 10 auf 1, < 100 auf 5, sonst auf 10. */
function roundSmall(value: number): number {
  if (value < 10) return Math.max(1, Math.round(value));
  if (value < 100) return roundTo(value, 5);
  return roundTo(value, 10);
}

export interface ScaledAmount {
  amount: number | null;
  unit: string | null;
}

/** Rechnet eine Zutat von den Grundportionen auf die gewünschten Portionen um. */
export function scaleIngredient(ingredient: Pick<Ingredient, 'amount' | 'unit'>, baseServings: number, servings: number): ScaledAmount {
  const unit = normalizeUnit(ingredient.unit);
  if (ingredient.amount === null || !Number.isFinite(ingredient.amount) || ingredient.amount <= 0) return { amount: null, unit };
  const factor = baseServings > 0 ? servings / baseServings : 1;
  const raw = ingredient.amount * factor;
  const info = unitInfo(unit);

  if (!info) {
    // Unbekannte Einheit oder reine Stückzahl ohne Einheit: auf ganze Stück aufrunden.
    return { amount: unit ? Math.round(raw * 10) / 10 : Math.max(1, Math.ceil(raw - 0.05)), unit };
  }
  switch (info.kind) {
    case 'mass': {
      const grams = info.canonical === 'kg' ? raw * 1000 : raw;
      return grams >= 1000 ? { amount: Math.round(grams / 50) / 20, unit: 'kg' } : { amount: roundSmall(grams), unit: 'g' };
    }
    case 'volume': {
      const ml = info.canonical === 'l' ? raw * 1000 : info.canonical === 'cl' ? raw * 10 : raw;
      return ml >= 1000 ? { amount: Math.round(ml / 50) / 20, unit: 'l' } : { amount: roundSmall(ml), unit: 'ml' };
    }
    case 'spoon':
      return { amount: Math.max(0.5, roundTo(raw, 0.5)), unit: info.canonical };
    case 'count':
      // Beim Einkaufen zählen nur ganze Stück: 1,5 Zwiebeln → 2.
      return { amount: Math.max(1, Math.ceil(raw - 0.05)), unit: info.canonical };
  }
}

const numberFmt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

/** Mengenangabe für die Einkaufsliste, z. B. "400 g", "1,2 kg", "3×", "2 Zehen", "1,5 EL". */
export function formatAmount(scaled: ScaledAmount): string | undefined {
  if (scaled.amount === null) return undefined;
  const n = numberFmt.format(scaled.amount);
  const info = unitInfo(scaled.unit);
  if (!scaled.unit || info?.canonical === 'Stk') return `${n}×`;
  const label = info ? (scaled.amount > 1 && info.plural ? info.plural : info.canonical) : scaled.unit;
  return `${n} ${label}`;
}

/** Erlaubte Portionszahlen für den Regler. */
export function clampServings(value: number): number {
  return Math.min(50, Math.max(1, Math.round(value)));
}
