import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Loader2, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CategorySelect } from '../components/common';
import { db } from '../db/db';
import { newProduct, rememberCategory, saveProduct } from '../db/repo';
import type { Nutriments, Product } from '../db/types';
import { classifyByKeywords } from '../domain/categories';
import { goBack, navigate } from '../hooks/useRoute';
import { fetchProductByBarcode } from '../services/openFoodFacts';
import { useUi } from '../ui';

const NUTRIENT_FIELDS: Array<{ key: keyof Omit<Nutriments, 'extra'>; label: string }> = [
  { key: 'energyKcal', label: 'Energie (kcal)' },
  { key: 'fat', label: 'Fett (g)' },
  { key: 'saturatedFat', label: 'ges. Fettsäuren (g)' },
  { key: 'carbohydrates', label: 'Kohlenhydrate (g)' },
  { key: 'sugars', label: 'Zucker (g)' },
  { key: 'fiber', label: 'Ballaststoffe (g)' },
  { key: 'proteins', label: 'Eiweiß (g)' },
  { key: 'salt', label: 'Salz (g)' },
];

/** Produkt anlegen oder bearbeiten (inkl. Nährwerte je 100 g). */
export function ProductForm({ id, barcode }: { id?: number; barcode?: string }) {
  const ui = useUi();
  const existing = useLiveQuery(() => (id ? db.products.get(id) : undefined), [id]);
  const [draft, setDraft] = useState<Product>(() => newProduct({ name: '', barcode }));
  const [nutrients, setNutrients] = useState<Record<string, string>>({});
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!existing) return;
    setDraft(existing);
    setCategoryTouched(true);
    const n: Record<string, string> = {};
    for (const f of NUTRIENT_FIELDS) {
      const v = existing.nutriments?.[f.key];
      if (v !== undefined) n[f.key] = String(v).replace('.', ',');
    }
    setNutrients(n);
  }, [existing]);

  const set = (changes: Partial<Product>) => setDraft((d) => ({ ...d, ...changes }));

  const lookup = async () => {
    if (!draft.barcode) return;
    setLookupBusy(true);
    setError(null);
    try {
      const off = await fetchProductByBarcode(draft.barcode.trim());
      if (!off) {
        setError('Nicht in Open Food Facts gefunden – bitte selbst ausfüllen.');
        return;
      }
      set({
        name: draft.name || off.name,
        brand: draft.brand || off.brand,
        quantity: draft.quantity || off.quantity,
        category: off.category,
        imageUrl: off.imageUrl,
        nutriscore: off.nutriscore,
        novaGroup: off.novaGroup,
        ingredients: off.ingredients,
        allergens: off.allergens,
        nutriments: off.nutriments,
        source: 'openfoodfacts',
      });
      const n: Record<string, string> = {};
      for (const f of NUTRIENT_FIELDS) {
        const v = off.nutriments?.[f.key];
        if (v !== undefined) n[f.key] = String(v).replace('.', ',');
      }
      setNutrients(n);
      setCategoryTouched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLookupBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return;
    const nutriments: Nutriments = { ...(draft.nutriments?.extra ? { extra: draft.nutriments.extra } : {}) };
    if (draft.nutriments?.energyKj !== undefined) nutriments.energyKj = draft.nutriments.energyKj;
    for (const f of NUTRIENT_FIELDS) {
      const raw = nutrients[f.key]?.trim();
      if (!raw) continue;
      const v = Number.parseFloat(raw.replace(',', '.'));
      if (Number.isFinite(v)) nutriments[f.key] = v;
    }
    try {
      const savedId = await saveProduct({ ...draft, nutriments: Object.keys(nutriments).length ? nutriments : undefined });
      await rememberCategory(draft.name, draft.category);
      ui.toast('Produkt gespeichert');
      navigate(`/products/${savedId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <header className="topbar">
        <button className="icon-btn back" aria-label="Zurück" onClick={() => goBack('/products')}>
          <ArrowLeft size={22} />
        </button>
        <h1>{id ? 'Produkt bearbeiten' : 'Neues Produkt'}</h1>
      </header>
      <form className="page" onSubmit={submit}>
        {error && <div className="notice error">{error}</div>}
        <div className="card card-pad stack">
          <label className="field">
            Name *
            <input
              className="input"
              required
              value={draft.name}
              onChange={(e) => {
                const name = e.target.value;
                set(categoryTouched ? { name } : { name, category: classifyByKeywords(name) ?? 'sonstiges' });
              }}
              placeholder="z. B. Vollmilch 3,5 %"
            />
          </label>
          <div className="grid-2">
            <label className="field">
              Marke
              <input className="input" value={draft.brand ?? ''} onChange={(e) => set({ brand: e.target.value })} />
            </label>
            <label className="field">
              Packungsgröße
              <input className="input" value={draft.quantity ?? ''} placeholder="z. B. 1 l" onChange={(e) => set({ quantity: e.target.value })} />
            </label>
          </div>
          <label className="field">
            Kategorie
            <CategorySelect
              value={draft.category}
              onChange={(category) => {
                setCategoryTouched(true);
                set({ category });
              }}
            />
          </label>
          <label className="field">
            Barcode (EAN)
            <div className="row">
              <input className="input grow" inputMode="numeric" value={draft.barcode ?? ''} onChange={(e) => set({ barcode: e.target.value })} />
              <button type="button" className="btn" disabled={!draft.barcode || lookupBusy} onClick={lookup}>
                {lookupBusy ? <Loader2 className="spin" size={18} /> : <Search size={18} />} Nachschlagen
              </button>
            </div>
          </label>
        </div>

        <div className="section-title">Nährwerte je 100 g / 100 ml</div>
        <div className="card card-pad grid-2">
          {NUTRIENT_FIELDS.map((f) => (
            <label key={f.key} className="field">
              {f.label}
              <input
                className="input"
                inputMode="decimal"
                value={nutrients[f.key] ?? ''}
                onChange={(e) => setNutrients((n) => ({ ...n, [f.key]: e.target.value }))}
              />
            </label>
          ))}
          <label className="field">
            Nutri-Score
            <select className="select" value={draft.nutriscore ?? ''} onChange={(e) => set({ nutriscore: e.target.value || undefined })}>
              <option value="">–</option>
              {['a', 'b', 'c', 'd', 'e'].map((g) => (
                <option key={g} value={g}>
                  {g.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button className="btn primary block" type="submit">
          Speichern
        </button>
      </form>
    </>
  );
}
