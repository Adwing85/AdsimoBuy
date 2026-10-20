import { classifyByKeywords, type CategoryId } from '../domain/categories';
import { defaultOrderFor, type ChainId, CHAINS } from '../domain/stores';
import { dayKey, normalize, prettifyName, round2 } from '../domain/text';
import type { OffProduct } from '../services/openFoodFacts';
import { db, type AppDB } from './db';
import type { ItemSource, ListItem, Product, Receipt, ReceiptItem, Store } from './types';

// ---------- Einstellungen ----------

export type OcrMode = 'auto' | 'ocr' | 'ai';

export interface AppSettings {
  activeListId?: number;
  ocrMode: OcrMode;
  apiKey?: string;
}

export async function getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K] | undefined> {
  return (await db.settings.get(key))?.value as AppSettings[K] | undefined;
}

export async function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
  if (value === undefined || value === '') await db.settings.delete(key);
  else await db.settings.put({ key, value });
}

// ---------- Erststart ----------

const SEED_CHAINS: ChainId[] = ['lidl', 'aldi_sued', 'rewe', 'edeka', 'kaufland', 'dm'];

export async function ensureSeed(database: AppDB = db): Promise<void> {
  await database.transaction('rw', database.stores, database.lists, database.settings, async () => {
    if ((await database.stores.count()) === 0) {
      const now = Date.now();
      await database.stores.bulkAdd(
        SEED_CHAINS.map((chain) => ({ name: CHAINS[chain].label, chain, categoryOrder: defaultOrderFor(chain), createdAt: now })),
      );
    }
    if ((await database.lists.count()) === 0) {
      const lidl = await database.stores.where('chain').equals('lidl').first();
      const now = Date.now();
      const id = await database.lists.add({ name: 'Wocheneinkauf', storeId: lidl?.id, createdAt: now, updatedAt: now });
      await database.settings.put({ key: 'activeListId', value: id });
    }
  });
}

// ---------- Kategorien ----------

/** Kategorie bestimmen: gelernte Zuordnung → bekanntes Produkt → Stichwörter → Sonstiges. */
export async function classify(name: string): Promise<CategoryId> {
  const key = normalize(name);
  if (!key) return 'sonstiges';
  const memory = await db.categoryMemory.get(key);
  if (memory) return memory.category;
  const product = await findProductByName(name);
  if (product) return product.category;
  return classifyByKeywords(name) ?? 'sonstiges';
}

export async function rememberCategory(name: string, category: CategoryId): Promise<void> {
  const key = normalize(name);
  if (key) await db.categoryMemory.put({ key, category });
}

// ---------- Produkte ----------

export async function findProductByName(name: string): Promise<Product | undefined> {
  const key = normalize(name);
  if (!key) return undefined;
  return db.products.filter((p) => normalize(p.name) === key || p.aliases.some((a) => normalize(a) === key)).first();
}

export function newProduct(partial: Partial<Product> & { name: string }): Product {
  const now = Date.now();
  return {
    category: classifyByKeywords(partial.name) ?? 'sonstiges',
    aliases: [],
    purchaseDays: [],
    source: 'manual',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export async function saveProduct(product: Product): Promise<number> {
  const clean: Product = {
    ...product,
    barcode: product.barcode?.trim() || undefined,
    brand: product.brand?.trim() || undefined,
    name: product.name.trim(),
    updatedAt: Date.now(),
  };
  if (clean.barcode) {
    const other = await db.products.where('barcode').equals(clean.barcode).first();
    if (other && other.id !== clean.id) throw new Error(`Der Barcode ${clean.barcode} gehört bereits zu „${other.name}“.`);
  }
  return db.products.put(clean);
}

/** Übernimmt Open-Food-Facts-Daten in ein bestehendes Produkt (Nährwerte, Bild, Barcode …). */
export async function applyOffData(productId: number, off: OffProduct): Promise<void> {
  const product = await db.products.get(productId);
  if (!product) return;
  const barcodeOwner = await db.products.where('barcode').equals(off.barcode).first();
  await db.products.update(productId, {
    barcode: barcodeOwner && barcodeOwner.id !== productId ? product.barcode : off.barcode,
    brand: off.brand ?? product.brand,
    quantity: off.quantity ?? product.quantity,
    imageUrl: off.imageUrl ?? product.imageUrl,
    nutriments: off.nutriments ?? product.nutriments,
    nutriscore: off.nutriscore ?? product.nutriscore,
    novaGroup: off.novaGroup ?? product.novaGroup,
    ingredients: off.ingredients ?? product.ingredients,
    allergens: off.allergens ?? product.allergens,
    updatedAt: Date.now(),
  });
}

/** Legt ein gescanntes Produkt an bzw. ergänzt ein gleichnamiges, bereits bekanntes Produkt. */
export async function upsertFromOff(off: OffProduct): Promise<number> {
  const byBarcode = await db.products.where('barcode').equals(off.barcode).first();
  if (byBarcode?.id) {
    await applyOffData(byBarcode.id, off);
    return byBarcode.id;
  }
  const byName = await findProductByName(off.name);
  if (byName?.id && !byName.barcode) {
    await applyOffData(byName.id, off);
    return byName.id;
  }
  return db.products.add(
    newProduct({
      name: off.name,
      brand: off.brand,
      barcode: off.barcode,
      category: off.category,
      quantity: off.quantity,
      imageUrl: off.imageUrl,
      nutriments: off.nutriments,
      nutriscore: off.nutriscore,
      novaGroup: off.novaGroup,
      ingredients: off.ingredients,
      allergens: off.allergens,
      source: 'openfoodfacts',
    }),
  );
}

export async function deleteProduct(id: number): Promise<void> {
  await db.transaction('rw', db.products, db.items, db.receiptItems, async () => {
    await db.items.where('productId').equals(id).modify({ productId: undefined });
    await db.receiptItems.where('productId').equals(id).modify({ productId: undefined });
    await db.products.delete(id);
  });
}

function addPurchaseDay(product: Product, day: string, ts: number): Partial<Product> {
  const days = product.purchaseDays.includes(day) ? product.purchaseDays : [...product.purchaseDays, day].sort().slice(-60);
  return {
    purchaseDays: days,
    lastPurchasedAt: Math.max(product.lastPurchasedAt ?? 0, ts),
    updatedAt: Date.now(),
  };
}

/** Aktualisiert den zuletzt bezahlten Stückpreis aus den Bon-Positionen. */
async function refreshLastPrice(productId: number): Promise<void> {
  const entries = await db.receiptItems.where('productId').equals(productId).toArray();
  const latest = entries.filter((e) => e.kind === 'item' && e.unitPrice > 0).sort((a, b) => b.date - a.date)[0];
  await db.products.update(productId, { lastUnitPrice: latest ? latest.unitPrice : undefined });
}

// ---------- Einkaufslisten ----------

export interface NewItem {
  name: string;
  quantity?: string;
  category?: CategoryId;
  productId?: number;
  source: ItemSource;
}

/** Fügt Einträge hinzu; bereits offene gleichnamige Einträge werden übersprungen. Gibt die Anzahl neuer Einträge zurück. */
export async function addItems(listId: number, entries: NewItem[]): Promise<number> {
  return db.transaction('rw', [db.items, db.lists, db.products, db.categoryMemory], async () => {
    const open = await db.items.where('[listId+checked]').equals([listId, 0]).toArray();
    const openKeys = new Set(open.map((i) => normalize(i.name)));
    let added = 0;
    const now = Date.now();
    for (const entry of entries) {
      const name = entry.name.trim();
      const key = normalize(name);
      if (!key || openKeys.has(key)) continue;
      const product = entry.productId ? await db.products.get(entry.productId) : await findProductByName(name);
      const category = entry.category ?? product?.category ?? (await classify(name));
      await db.items.add({
        listId,
        name,
        quantity: entry.quantity?.trim() || undefined,
        category,
        productId: product?.id,
        checked: 0,
        source: entry.source,
        createdAt: now + added,
      });
      openKeys.add(key);
      added++;
    }
    if (added) await db.lists.update(listId, { updatedAt: now });
    return added;
  });
}

export async function updateItem(item: ListItem, changes: Partial<ListItem>): Promise<void> {
  if (!item.id) return;
  await db.items.update(item.id, changes);
  if (changes.category && changes.category !== item.category) {
    await rememberCategory(changes.name ?? item.name, changes.category);
    const productId = changes.productId ?? item.productId;
    if (productId) await db.products.update(productId, { category: changes.category, updatedAt: Date.now() });
  }
}

/**
 * Abhaken: verknüpft (oder erzeugt) das Produkt, trägt den Kauftag ein und protokolliert
 * die Reihenfolge im Markt, damit die Sortierung lernen kann.
 */
export async function setItemChecked(item: ListItem, checked: boolean, storeId: number | undefined): Promise<void> {
  if (!item.id) return;
  const now = Date.now();
  const day = dayKey(now);
  await db.transaction('rw', [db.items, db.products, db.checkEvents, db.categoryMemory], async () => {
    const current = await db.items.get(item.id!);
    if (!current) return;
    if (checked && !current.checked) {
      let product = current.productId ? await db.products.get(current.productId) : await findProductByName(current.name);
      if (!product) {
        const id = await db.products.add(newProduct({ name: current.name, category: current.category, source: 'list' }));
        product = await db.products.get(id);
      }
      let loggedDay: string | undefined;
      if (product?.id && !product.purchaseDays.includes(day)) {
        await db.products.update(product.id, addPurchaseDay(product, day, now));
        loggedDay = day;
      }
      await db.items.update(current.id!, { checked: 1, checkedAt: now, productId: product?.id, loggedDay });
      if (storeId) {
        await db.checkEvents.add({ storeId, tripKey: `${current.listId}:${storeId}:${day}`, category: current.category, at: now });
      }
    } else if (!checked && current.checked) {
      if (current.loggedDay && current.productId) {
        const product = await db.products.get(current.productId);
        if (product) {
          const purchaseDays = product.purchaseDays.filter((d) => d !== current.loggedDay);
          await db.products.update(product.id!, { purchaseDays });
        }
      }
      if (storeId && current.checkedAt) {
        await db.checkEvents.where('at').equals(current.checkedAt).delete();
      }
      await db.items.update(current.id!, { checked: 0, checkedAt: undefined, loggedDay: undefined });
    }
  });
}

export async function clearChecked(listId: number): Promise<void> {
  await db.items.where('[listId+checked]').equals([listId, 1]).delete();
}

export async function createList(name: string, storeId?: number): Promise<number> {
  const now = Date.now();
  const id = await db.lists.add({ name: name.trim() || 'Neue Liste', storeId, createdAt: now, updatedAt: now });
  await setSetting('activeListId', id);
  return id;
}

export async function deleteList(id: number): Promise<void> {
  await db.transaction('rw', db.lists, db.items, db.settings, async () => {
    await db.items.where('listId').equals(id).delete();
    await db.lists.delete(id);
    const next = await db.lists.orderBy('updatedAt').last();
    await db.settings.put({ key: 'activeListId', value: next?.id });
  });
}

// ---------- Märkte ----------

export async function addStore(chain: ChainId, name: string, location?: string): Promise<number> {
  return db.stores.add({
    name: name.trim() || CHAINS[chain].label,
    chain,
    location: location?.trim() || undefined,
    categoryOrder: defaultOrderFor(chain),
    createdAt: Date.now(),
  });
}

export async function updateStore(id: number, changes: Partial<Store>): Promise<void> {
  await db.stores.update(id, changes);
}

export async function deleteStore(id: number): Promise<void> {
  await db.transaction('rw', [db.stores, db.lists, db.checkEvents], async () => {
    await db.lists.filter((l) => l.storeId === id).modify({ storeId: undefined });
    await db.checkEvents.where('storeId').equals(id).delete();
    await db.stores.delete(id);
  });
}

// ---------- Kassenbons ----------

export interface ReceiptDraftLine {
  rawName: string;
  quantity: number;
  unit: 'stk' | 'kg';
  unitPrice: number;
  totalPrice: number;
  kind: 'item' | 'deposit';
  category: CategoryId;
  /** Zugeordnetes Produkt; "new" legt ein neues Produkt an; undefined = nicht zuordnen. */
  allocation: number | 'new' | undefined;
  /** Name für ein neu anzulegendes Produkt. */
  newProductName?: string;
}

export interface ReceiptDraft {
  storeId?: number;
  storeName: string;
  date: number;
  total: number;
  image?: Blob;
  rawText?: string;
  source: Receipt['source'];
  lines: ReceiptDraftLine[];
}

/**
 * Speichert einen Bon: legt fehlende Produkte an, merkt sich die Bon-Bezeichnung als Alias,
 * trägt Kauftag und Preis in die Historie ein und lernt die Kategorie.
 */
export async function saveReceipt(draft: ReceiptDraft): Promise<number> {
  const day = dayKey(draft.date);
  const touched = new Set<number>();
  const receiptId = await db.transaction('rw', [db.receipts, db.receiptItems, db.products, db.categoryMemory], async () => {
    const id = await db.receipts.add({
      storeId: draft.storeId,
      storeName: draft.storeName,
      date: draft.date,
      total: round2(draft.total),
      image: draft.image,
      rawText: draft.rawText,
      source: draft.source,
      createdAt: Date.now(),
    });

    const items: ReceiptItem[] = [];
    for (const line of draft.lines) {
      let productId: number | undefined;
      if (line.kind === 'item' && line.allocation === 'new') {
        const name = (line.newProductName ?? prettifyName(line.rawName)).trim();
        const existing = await findProductByName(name);
        productId = existing?.id ?? (await db.products.add(newProduct({ name, category: line.category, source: 'receipt' })));
      } else if (typeof line.allocation === 'number') {
        productId = line.allocation;
      }

      if (productId) {
        const product = await db.products.get(productId);
        if (product) {
          const aliasKey = normalize(line.rawName);
          const aliases =
            aliasKey && aliasKey !== normalize(product.name) && !product.aliases.some((a) => normalize(a) === aliasKey)
              ? [...product.aliases, line.rawName.trim()]
              : product.aliases;
          await db.products.update(productId, { ...addPurchaseDay(product, day, draft.date), aliases });
          touched.add(productId);
        }
      }
      await db.categoryMemory.put({ key: normalize(line.rawName), category: line.category });

      items.push({
        receiptId: id,
        rawName: line.rawName.trim(),
        productId,
        category: line.category,
        quantity: line.quantity,
        unit: line.unit,
        unitPrice: round2(line.unitPrice),
        totalPrice: round2(line.totalPrice),
        kind: line.kind,
        date: draft.date,
        storeId: draft.storeId,
      });
    }
    await db.receiptItems.bulkAdd(items);
    return id;
  });
  for (const id of touched) await refreshLastPrice(id);
  return receiptId;
}

export async function reassignReceiptItem(item: ReceiptItem, productId: number | undefined): Promise<void> {
  if (!item.id) return;
  const previous = item.productId;
  await db.receiptItems.update(item.id, { productId });
  if (productId) {
    const product = await db.products.get(productId);
    if (product) {
      const day = dayKey(item.date);
      const aliasKey = normalize(item.rawName);
      const aliases = product.aliases.some((a) => normalize(a) === aliasKey) ? product.aliases : [...product.aliases, item.rawName];
      await db.products.update(productId, { ...addPurchaseDay(product, day, item.date), aliases, category: product.category });
      await refreshLastPrice(productId);
    }
  }
  if (previous) await refreshLastPrice(previous);
}

export async function deleteReceipt(id: number): Promise<void> {
  const items = await db.receiptItems.where('receiptId').equals(id).toArray();
  await db.transaction('rw', db.receipts, db.receiptItems, async () => {
    await db.receiptItems.where('receiptId').equals(id).delete();
    await db.receipts.delete(id);
  });
  for (const pid of new Set(items.map((i) => i.productId).filter((p): p is number => p !== undefined))) {
    await refreshLastPrice(pid);
  }
}

// ---------- Sicherung ----------

interface Backup {
  app: 'adsimobuy';
  version: 1;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

const BACKUP_TABLES = ['products', 'lists', 'items', 'stores', 'receipts', 'receiptItems', 'categoryMemory', 'checkEvents', 'settings'] as const;

export async function exportBackup(): Promise<Blob> {
  const tables: Backup['tables'] = {};
  for (const name of BACKUP_TABLES) {
    const rows = await db.table(name).toArray();
    tables[name] =
      name === 'receipts'
        ? rows.map(({ image: _image, ...rest }: Receipt) => rest)
        : name === 'settings'
          ? rows.filter((r: { key: string }) => r.key !== 'apiKey')
          : rows;
  }
  const backup: Backup = { app: 'adsimobuy', version: 1, exportedAt: new Date().toISOString(), tables };
  return new Blob([JSON.stringify(backup)], { type: 'application/json' });
}

export async function importBackup(file: Blob): Promise<void> {
  const data = JSON.parse(await file.text()) as Backup;
  if (data.app !== 'adsimobuy' || !data.tables) throw new Error('Das ist keine AdsimoBuy-Sicherung.');
  await db.transaction('rw', BACKUP_TABLES.map((n) => db.table(n)), async () => {
    for (const name of BACKUP_TABLES) {
      const rows = data.tables[name];
      if (!Array.isArray(rows)) continue;
      const table = db.table(name);
      if (name === 'settings') {
        await table.bulkPut(rows);
      } else {
        await table.clear();
        await table.bulkAdd(rows);
      }
    }
  });
}

export async function resetAll(): Promise<void> {
  await db.transaction('rw', BACKUP_TABLES.map((n) => db.table(n)), async () => {
    for (const name of BACKUP_TABLES) await db.table(name).clear();
  });
  await ensureSeed();
}
