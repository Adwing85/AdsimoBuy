import { describe, expect, it } from 'vitest';
import { classifyByKeywords, classifyByOffTags } from './categories';
import { learnOrder } from './learnOrder';
import { findBestMatch, ITEM_MATCH_THRESHOLD, nameSimilarity, rankItemsForProduct } from './matching';
import { parseListLine, parseListText, quantityMultiplier } from './parseListText';
import { parseReceiptText, sumItems } from './parseReceiptText';
import { estimateTotal, latestPrices, priceStats } from './prices';
import { completeOrder, defaultOrderFor, detectChain, groupByStoreOrder } from './stores';
import { repurchaseSuggestions } from './suggestions';
import { normalize, prettifyName } from './text';

describe('normalize', () => {
  it('macht Bon-Großschreibung lesbar', () => {
    expect(prettifyName('BIO VOLLMILCH 3,8%')).toBe('Bio Vollmilch 3,8%');
    expect(prettifyName('ÄPFEL ROT/GELB')).toBe('Äpfel Rot/Gelb');
    expect(prettifyName('Gouda jung')).toBe('Gouda jung');
  });

  it('faltet Umlaute und Sonderzeichen', () => {
    expect(normalize('Müsli – Früchte (500 g)')).toBe('muesli fruechte 500 g');
    expect(normalize('Crème fraîche')).toBe('creme fraiche');
  });
});

describe('classifyByKeywords', () => {
  const cases: Array<[string, string]> = [
    ['Bananen', 'obst_gemuese'],
    ['Bio Vollmilch 3,8%', 'molkerei'],
    ['Erdbeerjoghurt', 'molkerei'],
    ['Milchschokolade', 'suesswaren'],
    ['Kartoffelchips Paprika', 'suesswaren'],
    ['Apfelsaft', 'getraenke'],
    ['Hackfleisch gemischt', 'fleisch_wurst'],
    ['Schweinefilet', 'fleisch_wurst'],
    ['Rotwein trocken', 'alkohol'],
    ['TK Erbsen', 'tiefkuehl'],
    ['Vanilleeis', 'tiefkuehl'],
    ['Basmati Reis', 'grundnahrung'],
    ['Eier', 'molkerei'],
    ['Weizenmehl Type 405', 'backzutaten'],
    ['Kaffeebohnen', 'kaffee_tee'],
    ['Pfefferminztee', 'kaffee_tee'],
    ['Wassermelone', 'obst_gemuese'],
    ['Toilettenpapier', 'drogerie'],
    ['Spülmittel', 'haushalt'],
    ['Gefrierbeutel', 'haushalt'],
    ['Nudelsalat', 'convenience'],
    ['Gouda jung', 'kaese'],
    ['Thunfisch in Öl', 'konserven'],
    ['Lachsfilet', 'fisch'],
    ['Katzenfutter', 'tier'],
    ['Brötchen', 'backwaren'],
  ];
  it.each(cases)('%s → %s', (name, expected) => {
    expect(classifyByKeywords(name)).toBe(expected);
  });

  it('liefert null ohne Treffer', () => {
    expect(classifyByKeywords('XYZ 123')).toBeNull();
  });
});

describe('classifyByOffTags', () => {
  it('nimmt das spezifischste Tag und priorisiert Tiefkühl', () => {
    expect(classifyByOffTags(['en:dairies', 'en:fermented-milk-products', 'en:yogurts'])).toBe('molkerei');
    expect(classifyByOffTags(['en:beverages', 'en:alcoholic-beverages', 'en:beers'])).toBe('alkohol');
    expect(classifyByOffTags(['en:frozen-foods', 'en:pizzas'])).toBe('tiefkuehl');
    expect(classifyByOffTags(['en:dairies', 'en:cheeses'])).toBe('kaese');
    expect(classifyByOffTags([])).toBeNull();
  });
});

describe('stores', () => {
  it('Lidl beginnt mit Obst & Gemüse und Convenience', () => {
    const order = defaultOrderFor('lidl');
    expect(order.slice(0, 2)).toEqual(['obst_gemuese', 'convenience']);
    expect(order).toHaveLength(23);
    expect(order[order.length - 1]).toBe('sonstiges');
  });

  it('completeOrder ergänzt fehlende Kategorien vor "Sonstiges"', () => {
    const order = completeOrder(['getraenke', 'sonstiges', 'unbekannt', 'getraenke']);
    expect(order[0]).toBe('getraenke');
    expect(order[order.length - 1]).toBe('sonstiges');
    expect(new Set(order).size).toBe(23);
  });

  it('gruppiert in Markt-Reihenfolge', () => {
    const groups = groupByStoreOrder(
      [
        { name: 'Bier', category: 'alkohol' as const },
        { name: 'Bananen', category: 'obst_gemuese' as const },
        { name: 'Äpfel', category: 'obst_gemuese' as const },
        { name: 'Salat-Bowl', category: 'convenience' as const },
      ],
      defaultOrderFor('lidl'),
    );
    expect(groups.map((g) => g.category)).toEqual(['obst_gemuese', 'convenience', 'alkohol']);
    expect(groups[0].items.map((i) => i.name)).toEqual(['Äpfel', 'Bananen']);
  });

  it('erkennt Ketten auf dem Bon', () => {
    expect(detectChain('LIDL\nVielen Dank')).toBe('lidl');
    expect(detectChain('ALDI SÜD\nFiliale 123')).toBe('aldi_sued');
    expect(detectChain('REWE Markt GmbH\nSumme 3,00')).toBe('rewe');
    expect(detectChain('Supermarkt XY\nSUMME 4,00\nNetto 3,36')).toBeNull();
    expect(detectChain('Netto Marken-Discount\nSUMME 4,00')).toBe('netto');
  });
});

describe('parseListText', () => {
  it('erkennt Mengen in verschiedenen Schreibweisen', () => {
    expect(parseListLine('2x Milch')).toEqual({ name: 'Milch', quantity: '2×' });
    expect(parseListLine('500 g Hackfleisch')).toEqual({ name: 'Hackfleisch', quantity: '500 g' });
    expect(parseListLine('Eier 10')).toEqual({ name: 'Eier', quantity: '10×' });
    expect(parseListLine('Wasser 6 Flaschen')).toEqual({ name: 'Wasser', quantity: '6 Flaschen' });
    expect(parseListLine('- [ ] butter')).toEqual({ name: 'Butter' });
    expect(parseListLine('3. Brot')).toEqual({ name: 'Brot' });
  });

  it('teilt Zeilen und Komma-Listen, entfernt Duplikate und OCR-Müll', () => {
    const items = parseListText('Einkauf Samstag\nMilch, Eier; Brot\nObst:\n• Äpfel\n  ~~ \nmilch\n2 Gurken\n12');
    expect(items.map((i) => i.name)).toEqual(['Milch', 'Eier', 'Brot', 'Äpfel', 'Gurken']);
    expect(items[4].quantity).toBe('2×');
  });

  it('quantityMultiplier', () => {
    expect(quantityMultiplier('3×')).toBe(3);
    expect(quantityMultiplier('2 Flaschen')).toBe(2);
    expect(quantityMultiplier('500 g')).toBe(1);
    expect(quantityMultiplier(undefined)).toBe(1);
  });
});

describe('parseReceiptText', () => {
  const lidl = `LIDL
Musterstraße 12
12345 Musterstadt
                     EUR
Bananen            1,29 A
Bio Vollmilch 3,8% 1,98 A
  2 x 0,99
Paprika rot
  0,512 kg x 3,99 EUR/kg  2,04 A
Gouda jung 400g    2,49 A
Lidl Plus Rabatt  -0,50 A
Mineralwasser      0,19 A
Pfand 0,25         0,25 B
------------------------
zu zahlen          7,74
Kartenzahlung      7,74
MwSt A 7%  7,01  0,49  7,50
Datum 14.10.2026 18:03`;

  it('liest Artikel, Mengen, Gewichte, Rabatte und Pfand', () => {
    const r = parseReceiptText(lidl);
    expect(r.chain).toBe('lidl');
    expect(r.total).toBe(7.74);
    expect(new Date(r.date!).getDate()).toBe(14);
    expect(r.items.map((i) => i.name)).toEqual([
      'Bananen',
      'Bio Vollmilch 3,8%',
      'Paprika rot',
      'Gouda jung 400g',
      'Mineralwasser',
      'Pfand 0,25',
    ]);
    const milch = r.items[1];
    expect(milch.quantity).toBe(2);
    expect(milch.unitPrice).toBe(0.99);
    const paprika = r.items[2];
    expect(paprika.unit).toBe('kg');
    expect(paprika.quantity).toBeCloseTo(0.512);
    expect(paprika.totalPrice).toBe(2.04);
    expect(r.items[3].totalPrice).toBe(1.99); // 2,49 - 0,50 Rabatt
    expect(r.items[5].kind).toBe('deposit');
    expect(sumItems(r.items)).toBe(7.74);
  });

  it('korrigiert OCR-Fehler und Mengenzeilen vor dem Artikel', () => {
    const r = parseReceiptText(`REWE\n2 Stk x 1,O9\nJOGHURT NATUR 2,18 B\nBUTTER 2,29 B\nSUMME EUR 4,47`);
    expect(r.chain).toBe('rewe');
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toMatchObject({ name: 'JOGHURT NATUR', quantity: 2, unitPrice: 1.09, totalPrice: 2.18 });
    expect(r.total).toBe(4.47);
  });
});

describe('matching', () => {
  const products = [
    { id: 1, name: 'Vollmilch 3,5 %', brand: 'Milbona' },
    { id: 2, name: 'Gouda jung', aliases: ['GOUDA JUNG 400G'] },
    { id: 3, name: 'Bananen' },
    { id: 4, name: 'Bio Haferdrink' },
  ];
  it('findet Aliase exakt', () => {
    expect(findBestMatch('Gouda jung 400g', products)).toEqual({ id: 2, score: 1, via: 'alias' });
  });
  it('findet abgekürzte Bon-Bezeichnungen', () => {
    expect(findBestMatch('VOLLM. 3,5%', products)?.id).toBe(1);
    expect(findBestMatch('BANANE', products)?.id).toBe(3);
  });
  it('ordnet Unpassendes nicht zu', () => {
    expect(findBestMatch('Spülmittel Zitrone', products)).toBeNull();
    expect(nameSimilarity('Bier', 'Birne')).toBeLessThan(0.62);
  });
});

describe('prices', () => {
  it('berechnet Statistik und günstigsten Markt', () => {
    const s = priceStats([
      { date: 1, unitPrice: 1.0, storeId: 1 },
      { date: 2, unitPrice: 1.2, storeId: 2 },
      { date: 3, unitPrice: 1.1, storeId: 1 },
    ])!;
    expect(s.last).toBe(1.1);
    expect(s.min).toBe(1);
    expect(s.max).toBe(1.2);
    expect(s.avg).toBe(1.1);
    expect(s.trend).toBeCloseTo(0);
    expect(s.cheapestStore?.storeId).toBe(1);
    expect(priceStats([])).toBeNull();
  });
  it('schätzt Listensummen', () => {
    expect(
      estimateTotal([
        { unitPrice: 1.5, multiplier: 2 },
        { unitPrice: undefined, multiplier: 1 },
      ]),
    ).toEqual({ total: 3, known: 1, unknown: 1 });
  });
});

describe('repurchaseSuggestions', () => {
  it('schlägt fällige Produkte vor', () => {
    const now = new Date(2026, 9, 20, 12).getTime();
    const s = repurchaseSuggestions(
      [
        { productId: 1, name: 'Milch', days: ['2026-09-29', '2026-10-06', '2026-10-13'] },
        { productId: 2, name: 'Salz', days: ['2026-01-01', '2026-06-01', '2026-10-01'] },
        { productId: 3, name: 'Kaffee', days: ['2026-08-01', '2026-08-15'] },
      ],
      now,
    );
    expect(s.map((x) => x.name)).toEqual(['Milch']);
    expect(s[0].intervalDays).toBe(7);
  });
});

describe('learnOrder', () => {
  it('lernt die Laufreihenfolge aus abgehakten Artikeln', () => {
    const base = defaultOrderFor('other');
    const trip = (key: string, cats: string[]) =>
      cats.map((c, i) => ({ tripKey: key, category: c as never, at: i }));
    const learned = learnOrder(
      [
        ...trip('a', ['getraenke', 'obst_gemuese', 'molkerei']),
        ...trip('b', ['getraenke', 'obst_gemuese', 'tiefkuehl', 'molkerei']),
      ],
      base,
    )!;
    expect(learned.trips).toBe(2);
    const pos = (c: string) => learned.order.indexOf(c as never);
    expect(pos('getraenke')).toBeLessThan(pos('obst_gemuese'));
    expect(pos('obst_gemuese')).toBeLessThan(pos('molkerei'));
    expect(learned.order).toHaveLength(base.length);
    expect(learnOrder(trip('x', ['getraenke', 'molkerei']), base)).toBeNull();
  });
});

describe('rankItemsForProduct', () => {
  const items = [
    { id: 1, name: 'Milch', category: 'molkerei' },
    { id: 2, name: 'Bananen', category: 'obst_gemuese' },
    { id: 3, name: 'Joghurt', category: 'molkerei' },
    { id: 4, name: 'Gouda', category: 'kaese', productId: 9 },
  ];
  it('erkennt Listeneinträge im Produktnamen', () => {
    const [best] = rankItemsForProduct({ id: 5, name: 'Vollmilch 3,5 %', brand: 'Milbona', category: 'molkerei' }, items);
    expect(best.id).toBe(1);
    expect(best.score).toBeGreaterThanOrEqual(ITEM_MATCH_THRESHOLD);
  });
  it('bevorzugt bereits verknüpfte Produkte', () => {
    expect(rankItemsForProduct({ id: 9, name: 'Jung Holländer', category: 'kaese' }, items)[0]).toEqual({ id: 4, score: 1 });
  });
  it('nutzt die Kategorie, wenn sie eindeutig ist', () => {
    const [best] = rankItemsForProduct({ id: 7, name: 'Chiquita', category: 'obst_gemuese' }, items);
    expect(best.id).toBe(2);
  });
  it('wählt bei Unklarheit nichts sicher aus', () => {
    const [best] = rankItemsForProduct({ id: 8, name: 'Spülmittel Zitrone', category: 'haushalt' }, items);
    expect(best.score).toBeLessThan(ITEM_MATCH_THRESHOLD);
  });
});

describe('latestPrices', () => {
  it('liefert letzten Preis gesamt und je Markt', () => {
    const m = latestPrices([
      { productId: 1, storeId: 10, date: 1, unitPrice: 0.99 },
      { productId: 1, storeId: 20, date: 3, unitPrice: 1.19 },
      { productId: 1, storeId: 10, date: 2, unitPrice: 1.09 },
      { productId: 2, date: 1, unitPrice: 0 },
    ]);
    expect(m.get(1)?.latest).toEqual({ price: 1.19, date: 3 });
    expect(m.get(1)?.byStore.get(10)).toEqual({ price: 1.09, date: 2 });
    expect(m.has(2)).toBe(false);
  });
});
