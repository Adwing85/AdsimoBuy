import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { learnOrder } from '../domain/learnOrder';
import { dayKey } from '../domain/text';
import { db } from './db';
import {
  addItems,
  classify,
  ensureSeed,
  exportBackup,
  getSetting,
  importBackup,
  reassignReceiptItem,
  resetAll,
  saveReceipt,
  setItemChecked,
  updateItem,
  upsertFromOff,
} from './repo';

async function activeList() {
  const id = (await getSetting('activeListId'))!;
  return (await db.lists.get(id))!;
}

describe('repo', () => {
  beforeEach(async () => {
    await resetAll();
  });

  it('legt beim ersten Start Märkte und eine Liste an', async () => {
    await ensureSeed();
    expect(await db.stores.count()).toBe(6);
    const list = await activeList();
    const lidl = await db.stores.get(list.storeId!);
    expect(lidl?.chain).toBe('lidl');
    expect(lidl?.categoryOrder[0]).toBe('obst_gemuese');
  });

  it('fügt Einträge mit Kategorie hinzu und überspringt Duplikate', async () => {
    const list = await activeList();
    expect(await addItems(list.id!, [{ name: 'Bananen', source: 'manual' }, { name: 'Vollmilch', quantity: '2×', source: 'manual' }])).toBe(2);
    expect(await addItems(list.id!, [{ name: 'bananen', source: 'manual' }])).toBe(0);
    const items = await db.items.where('listId').equals(list.id!).toArray();
    expect(items.map((i) => [i.name, i.category])).toEqual([
      ['Bananen', 'obst_gemuese'],
      ['Vollmilch', 'molkerei'],
    ]);
  });

  it('merkt sich korrigierte Kategorien', async () => {
    const list = await activeList();
    await addItems(list.id!, [{ name: 'Hafer Barista', source: 'manual' }]);
    const item = (await db.items.where('listId').equals(list.id!).first())!;
    await updateItem(item, { category: 'getraenke' });
    expect(await classify('hafer barista')).toBe('getraenke');
  });

  it('Abhaken speichert das Produkt, den Kauftag und den Laufweg', async () => {
    const list = await activeList();
    await addItems(list.id!, [
      { name: 'Bier', source: 'manual' },
      { name: 'Äpfel', source: 'manual' },
    ]);
    const items = await db.items.where('listId').equals(list.id!).toArray();
    const bier = items.find((i) => i.name === 'Bier')!;
    const aepfel = items.find((i) => i.name === 'Äpfel')!;
    await setItemChecked(bier, true, list.storeId);
    await setItemChecked(aepfel, true, list.storeId);

    const product = await db.products.filter((p) => p.name === 'Bier').first();
    expect(product?.purchaseDays).toEqual([dayKey(Date.now())]);
    expect((await db.items.get(bier.id!))?.productId).toBe(product?.id);
    expect(await db.checkEvents.count()).toBe(2);

    // Rückgängig entfernt Kauftag und Laufweg-Eintrag wieder
    await setItemChecked((await db.items.get(aepfel.id!))!, false, list.storeId);
    const apfelProduct = await db.products.filter((p) => p.name === 'Äpfel').first();
    expect(apfelProduct?.purchaseDays).toEqual([]);
    expect(await db.checkEvents.count()).toBe(1);
  });

  it('lernt die Reihenfolge aus mehreren Einkäufen', async () => {
    const store = (await db.stores.where('chain').equals('rewe').first())!;
    await db.checkEvents.bulkAdd([
      { storeId: store.id!, tripKey: 'a', category: 'getraenke', at: 1 },
      { storeId: store.id!, tripKey: 'a', category: 'obst_gemuese', at: 2 },
      { storeId: store.id!, tripKey: 'b', category: 'getraenke', at: 3 },
      { storeId: store.id!, tripKey: 'b', category: 'obst_gemuese', at: 4 },
    ]);
    const events = await db.checkEvents.where('storeId').equals(store.id!).toArray();
    const learned = learnOrder(events, store.categoryOrder)!;
    expect(learned.order.indexOf('getraenke')).toBeLessThan(learned.order.indexOf('obst_gemuese'));
  });

  it('Bon speichern: legt Produkte an, merkt Aliase und baut den Preisverlauf', async () => {
    const lidl = (await db.stores.where('chain').equals('lidl').first())!;
    const milchId = await upsertFromOff({ barcode: '4000000000000', name: 'Vollmilch 3,5 %', category: 'molkerei', nutriments: { energyKcal: 64 } });

    const day1 = new Date(2026, 8, 1, 12).getTime();
    await saveReceipt({
      storeId: lidl.id,
      storeName: 'Lidl',
      date: day1,
      total: 3.27,
      source: 'ocr',
      lines: [
        { rawName: 'VOLLM. 3,5%', quantity: 2, unit: 'stk', unitPrice: 0.99, totalPrice: 1.98, kind: 'item', category: 'molkerei', allocation: milchId },
        { rawName: 'Bananen', quantity: 1, unit: 'stk', unitPrice: 1.29, totalPrice: 1.29, kind: 'item', category: 'obst_gemuese', allocation: 'new' },
        { rawName: 'Pfand', quantity: 1, unit: 'stk', unitPrice: 0.25, totalPrice: 0.25, kind: 'deposit', category: 'getraenke', allocation: undefined },
      ],
    });
    const day2 = new Date(2026, 9, 1, 12).getTime();
    const receipt2 = await saveReceipt({
      storeId: lidl.id,
      storeName: 'Lidl',
      date: day2,
      total: 1.09,
      source: 'manual',
      lines: [{ rawName: 'VOLLM. 3,5%', quantity: 1, unit: 'stk', unitPrice: 1.09, totalPrice: 1.09, kind: 'item', category: 'molkerei', allocation: milchId }],
    });

    const milch = (await db.products.get(milchId))!;
    expect(milch.aliases).toEqual(['VOLLM. 3,5%']);
    expect(milch.purchaseDays).toEqual(['2026-09-01', '2026-10-01']);
    expect(milch.lastUnitPrice).toBe(1.09);
    expect(milch.nutriments?.energyKcal).toBe(64);

    const bananen = await db.products.filter((p) => p.name === 'Bananen').first();
    expect(bananen?.source).toBe('receipt');
    expect(bananen?.lastUnitPrice).toBe(1.29);

    const history = await db.receiptItems.where('productId').equals(milchId).sortBy('date');
    expect(history.map((h) => h.unitPrice)).toEqual([0.99, 1.09]);

    // Umbuchen einer Position aktualisiert den letzten Preis
    const pos = (await db.receiptItems.where('receiptId').equals(receipt2).first())!;
    await reassignReceiptItem(pos, bananen!.id);
    expect((await db.products.get(milchId))!.lastUnitPrice).toBe(0.99);
  });

  it('Sicherung lässt sich exportieren und wieder einspielen', async () => {
    const list = await activeList();
    await addItems(list.id!, [{ name: 'Brot', source: 'manual' }]);
    const backup = await exportBackup();
    await resetAll();
    expect(await db.items.count()).toBe(0);
    await importBackup(backup);
    expect((await db.items.toArray()).map((i) => i.name)).toEqual(['Brot']);
  });
});
