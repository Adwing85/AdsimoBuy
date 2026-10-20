import type { CategoryId } from '../domain/categories';
import type { Ingredient } from '../domain/recipes';
import type { ChainId } from '../domain/stores';

/** Nährwerte je 100 g bzw. 100 ml. */
export interface Nutriments {
  energyKcal?: number;
  energyKj?: number;
  fat?: number;
  saturatedFat?: number;
  carbohydrates?: number;
  sugars?: number;
  fiber?: number;
  proteins?: number;
  salt?: number;
  /** Alle weiteren Angaben von Open Food Facts (Vitamine, Mineralstoffe ...), Schlüssel wie "vitamin-c". */
  extra?: Record<string, { value: number; unit: string }>;
}

export type ProductSource = 'openfoodfacts' | 'manual' | 'receipt' | 'list' | 'ai';

export interface Product {
  id?: number;
  name: string;
  brand?: string;
  barcode?: string;
  category: CategoryId;
  quantity?: string;
  imageUrl?: string;
  nutriments?: Nutriments;
  nutriscore?: string;
  novaGroup?: number;
  ingredients?: string;
  allergens?: string[];
  /** Bezeichnungen, unter denen das Produkt auf Kassenbons auftaucht. */
  aliases: string[];
  /** Kauftage (YYYY-MM-DD), jüngste zuletzt. */
  purchaseDays: string[];
  lastPurchasedAt?: number;
  lastUnitPrice?: number;
  source: ProductSource;
  createdAt: number;
  updatedAt: number;
}

export interface ShoppingList {
  id?: number;
  name: string;
  storeId?: number;
  createdAt: number;
  updatedAt: number;
}

export type ItemSource = 'manual' | 'photo' | 'barcode' | 'suggestion' | 'text' | 'recipe';

export interface ListItem {
  id?: number;
  listId: number;
  name: string;
  quantity?: string;
  note?: string;
  category: CategoryId;
  productId?: number;
  /** 0/1 statt boolean, damit IndexedDB den Index nutzen kann. */
  checked: 0 | 1;
  checkedAt?: number;
  /** Tag, der beim Abhaken in purchaseDays des Produkts eingetragen wurde. */
  loggedDay?: string;
  source: ItemSource;
  createdAt: number;
}

export interface Store {
  id?: number;
  name: string;
  chain: ChainId;
  location?: string;
  categoryOrder: CategoryId[];
  createdAt: number;
}

export interface Receipt {
  id?: number;
  storeId?: number;
  storeName: string;
  date: number;
  total: number;
  image?: Blob;
  rawText?: string;
  source: 'ocr' | 'ai' | 'manual';
  createdAt: number;
}

export interface ReceiptItem {
  id?: number;
  receiptId: number;
  rawName: string;
  productId?: number;
  category: CategoryId;
  quantity: number;
  unit: 'stk' | 'kg';
  unitPrice: number;
  totalPrice: number;
  kind: 'item' | 'deposit';
  /** Denormalisiert für schnelle Auswertungen. */
  date: number;
  storeId?: number;
}

export interface CategoryMemory {
  key: string;
  category: CategoryId;
}

export interface CheckEvent {
  id?: number;
  storeId: number;
  tripKey: string;
  category: CategoryId;
  at: number;
}

export interface Setting {
  key: string;
  value: unknown;
}

/** Ein erkanntes Gericht, damit es ohne neuen KI-Aufruf wieder auf die Liste kann. */
export interface Recipe {
  id?: number;
  name: string;
  baseServings: number;
  ingredients: Ingredient[];
  /** Kleines Vorschaubild des Fotos. */
  image?: Blob;
  notes?: string;
  source: 'photo' | 'text';
  usedCount: number;
  createdAt: number;
  updatedAt: number;
}

/** Am Regal abgelesener Preis (beim Abhaken per Scan), ergänzt die Preise aus Kassenbons. */
export interface PriceObservation {
  id?: number;
  productId: number;
  storeId?: number;
  date: number;
  unitPrice: number;
  source: 'shelf';
}
