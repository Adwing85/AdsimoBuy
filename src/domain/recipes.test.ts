import { describe, expect, it } from 'vitest';
import { clampServings, formatAmount, normalizeUnit, scaleIngredient } from './recipes';

const fmt = (amount: number | null, unit: string | null, base: number, servings: number) =>
  formatAmount(scaleIngredient({ amount, unit }, base, servings));

describe('normalizeUnit', () => {
  it('vereinheitlicht gängige Einheiten', () => {
    expect(normalizeUnit('Gramm')).toBe('g');
    expect(normalizeUnit('Esslöffel')).toBe('EL');
    expect(normalizeUnit('Zehen')).toBe('Zehe');
    expect(normalizeUnit('Stück')).toBe('Stk');
    expect(normalizeUnit('  ')).toBeNull();
    expect(normalizeUnit('Handvoll')).toBe('Handvoll');
  });
});

describe('scaleIngredient / formatAmount', () => {
  it('skaliert Gramm und rundet einkaufsfreundlich', () => {
    expect(fmt(250, 'g', 4, 6)).toBe('380 g'); // 375 → 380
    expect(fmt(500, 'g', 4, 2)).toBe('250 g');
    expect(fmt(30, 'g', 4, 3)).toBe('25 g'); // 22,5 → 25
    expect(fmt(800, 'g', 4, 6)).toBe('1,2 kg');
    expect(fmt(1, 'kg', 4, 2)).toBe('500 g');
  });

  it('skaliert Flüssigkeiten', () => {
    expect(fmt(200, 'ml', 4, 2)).toBe('100 ml');
    expect(fmt(0.75, 'l', 4, 8)).toBe('1,5 l');
  });

  it('rundet Stückzahlen auf ganze Stück auf', () => {
    expect(fmt(3, 'Stk', 4, 2)).toBe('2×'); // 1,5 → 2
    expect(fmt(2, 'Zehen', 4, 6)).toBe('3 Zehen');
    expect(fmt(1, 'Dose', 4, 2)).toBe('1 Dose');
    expect(fmt(2, null, 4, 4)).toBe('2×');
  });

  it('rundet Löffel auf halbe', () => {
    expect(fmt(2, 'EL', 4, 3)).toBe('1,5 EL');
    expect(fmt(1, 'TL', 4, 1)).toBe('0,5 TL');
  });

  it('lässt "nach Bedarf" ohne Menge', () => {
    expect(fmt(null, null, 4, 2)).toBeUndefined();
  });

  it('begrenzt Portionen', () => {
    expect(clampServings(0)).toBe(1);
    expect(clampServings(99)).toBe(50);
    expect(clampServings(3.4)).toBe(3);
  });
});
