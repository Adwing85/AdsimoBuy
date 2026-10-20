import { useLiveQuery } from 'dexie-react-hooks';
import { Barcode, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Empty, NutriScore, ProductThumb } from '../components/common';
import { db } from '../db/db';
import { CATEGORIES, CATEGORY_IDS, type CategoryId } from '../domain/categories';
import { normalize } from '../domain/text';
import { formatEuro, formatRelativeDays } from '../format';
import { navigate } from '../hooks/useRoute';
import { useUi } from '../ui';

type Sort = 'recent' | 'frequent' | 'name';

export function ProductsScreen() {
  const ui = useUi();
  const products = useLiveQuery(() => db.products.toArray());
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryId | 'all'>('all');
  const [sort, setSort] = useState<Sort>('recent');

  const presentCategories = useMemo(
    () => CATEGORY_IDS.filter((c) => products?.some((p) => p.category === c)),
    [products],
  );

  const filtered = useMemo(() => {
    const q = normalize(query);
    const list = (products ?? []).filter(
      (p) =>
        (category === 'all' || p.category === category) &&
        (!q ||
          normalize(p.name).includes(q) ||
          (p.brand && normalize(p.brand).includes(q)) ||
          p.barcode?.includes(q) ||
          p.aliases.some((a) => normalize(a).includes(q))),
    );
    return list.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'de');
      if (sort === 'frequent') return b.purchaseDays.length - a.purchaseDays.length || a.name.localeCompare(b.name, 'de');
      return (b.lastPurchasedAt ?? b.updatedAt) - (a.lastPurchasedAt ?? a.updatedAt);
    });
  }, [products, query, category, sort]);

  const withNutrients = products?.filter((p) => p.nutriments).length ?? 0;

  return (
    <>
      <header className="topbar">
        <h1>Produkte</h1>
        <button className="icon-btn" aria-label="Barcode scannen" onClick={() => ui.openScanner('product')}>
          <Barcode size={22} />
        </button>
        <button className="icon-btn" aria-label="Produkt anlegen" onClick={() => navigate('/products/new')}>
          <Plus size={24} />
        </button>
      </header>
      <div className="page">
        <div className="add-bar" style={{ position: 'static' }}>
          <Search size={20} className="muted" style={{ alignSelf: 'center', marginLeft: 6 }} />
          <input
            className="input grow"
            placeholder="Name, Marke, Barcode oder Bon-Text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Produkte durchsuchen"
          />
          <select className="select" style={{ width: 'auto', border: 'none' }} value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sortierung">
            <option value="recent">Zuletzt</option>
            <option value="frequent">Häufig</option>
            <option value="name">A–Z</option>
          </select>
        </div>

        {presentCategories.length > 1 && (
          <div className="chips">
            <button className="chip" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>
              Alle
            </button>
            {presentCategories.map((c) => (
              <button key={c} className="chip" aria-pressed={category === c} onClick={() => setCategory(c)}>
                {CATEGORIES[c].icon} {CATEGORIES[c].label}
              </button>
            ))}
          </div>
        )}

        {products && products.length > 0 && (
          <div className="small muted">
            {products.length} Produkte · {withNutrients} mit Nährwerten
          </div>
        )}

        {products && products.length === 0 && (
          <Empty icon="📦" title="Noch keine Produkte">
            <p className="small">
              Produkte landen automatisch hier, sobald du Artikel abhakst, Barcodes scannst oder Kassenbons erfasst – mit Nährwerten und
              Preisverlauf.
            </p>
            <button className="btn primary" onClick={() => ui.openScanner('product')}>
              <Barcode size={18} /> Ersten Barcode scannen
            </button>
          </Empty>
        )}

        {filtered.length > 0 && (
          <div className="card">
            {filtered.map((p) => (
              <a key={p.id} className="list-row" href={`#/products/${p.id}`}>
                <ProductThumb imageUrl={p.imageUrl} category={p.category} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="item-name ellipsis">{p.name}</div>
                  <div className="tiny muted ellipsis">
                    {[
                      p.brand,
                      p.quantity,
                      p.purchaseDays.length ? `${p.purchaseDays.length}× gekauft` : null,
                      p.lastPurchasedAt ? formatRelativeDays(p.lastPurchasedAt) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <div className="stack" style={{ alignItems: 'flex-end', gap: 4 }}>
                  {p.lastUnitPrice ? <strong className="num small">{formatEuro(p.lastUnitPrice)}</strong> : null}
                  <NutriScore grade={p.nutriscore} />
                </div>
              </a>
            ))}
          </div>
        )}

        {products && products.length > 0 && filtered.length === 0 && <Empty icon="🔍" title="Nichts gefunden" />}
      </div>
    </>
  );
}
