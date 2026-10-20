import Dexie, { type Table } from 'dexie';
import type {
  CategoryMemory,
  CheckEvent,
  ListItem,
  PriceObservation,
  Product,
  Receipt,
  ReceiptItem,
  Recipe,
  Setting,
  ShoppingList,
  Store,
} from './types';

export class AppDB extends Dexie {
  products!: Table<Product, number>;
  lists!: Table<ShoppingList, number>;
  items!: Table<ListItem, number>;
  stores!: Table<Store, number>;
  receipts!: Table<Receipt, number>;
  receiptItems!: Table<ReceiptItem, number>;
  categoryMemory!: Table<CategoryMemory, string>;
  checkEvents!: Table<CheckEvent, number>;
  settings!: Table<Setting, string>;
  recipes!: Table<Recipe, number>;
  prices!: Table<PriceObservation, number>;

  constructor(name = 'adsimobuy') {
    super(name);
    this.version(1).stores({
      products: '++id, &barcode, name, category, updatedAt, lastPurchasedAt',
      lists: '++id, updatedAt',
      items: '++id, listId, productId, [listId+checked]',
      stores: '++id, chain',
      receipts: '++id, date, storeId',
      receiptItems: '++id, receiptId, productId, date, storeId',
      categoryMemory: 'key',
      checkEvents: '++id, storeId, tripKey, at',
      settings: 'key',
    });
    this.version(2).stores({
      recipes: '++id, updatedAt',
    });
    this.version(3).stores({
      prices: '++id, productId, storeId, date',
    });
  }
}

export const db = new AppDB();
