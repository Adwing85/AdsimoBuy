import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Loader2, Pencil, Plus, Search, Trash2, TrendingDown, TrendingUp, X } from 'lucide-react';
import { useState } from 'react';
import { HBars, PriceChart } from '../components/charts';
import { CategorySelect, Empty, NutriScore, ProductThumb, Sheet } from '../components/common';
import { db } from '../db/db';
import { addItems, applyOffData, deleteProduct, rememberCategory } from '../db/repo';
import type { Nutriments, Product } from '../db/types';
import { CATEGORIES } from '../domain/categories';
import { priceStats } from '../domain/prices';
import { formatDate, formatEuro, formatNumber, formatPercent } from '../format';
import { storeColor, useSettings, useStores } from '../hooks/data';
import { goBack, navigate } from '../hooks/useRoute';
import { EXTRA_NUTRIENT_LABELS, searchProducts, type OffProduct } from '../services/openFoodFacts';
import { useUi } from '../ui';

const MAIN_ROWS: Array<{ key: keyof Omit<Nutriments, 'extra'>; label: string; unit: string; sub?: boolean }> = [
  { key: 'energyKcal', label: 'Energie', unit: 'kcal' },
  { key: 'fat', label: 'Fett', unit: 'g' },
  { key: 'saturatedFat', label: 'davon gesättigte Fettsäuren', unit: 'g', sub: true },
  { key: 'carbohydrates', label: 'Kohlenhydrate', unit: 'g' },
  { key: 'sugars', label: 'davon Zucker', unit: 'g', sub: true },
  { key: 'fiber', label: 'Ballaststoffe', unit: 'g' },
  { key: 'proteins', label: 'Eiweiß', unit: 'g' },
  { key: 'salt', label: 'Salz', unit: 'g' },
];

function formatExtra(value: number, unit: string): string {
  // OFF speichert Massenangaben in *_100g immer in g; "_unit" ist nur die Anzeigeeinheit.
  if (unit.includes('%')) return `${formatNumber(value)} %`;
  if (unit === 'kcal' || unit === 'kJ') return `${formatNumber(value)} ${unit}`;
  if (/^(µg|μg|mcg)$/.test(unit) || (unit === 'g' && value < 0.0001)) return `${formatNumber(value * 1_000_000)} µg`;
  if (unit === 'mg' || (unit === 'g' && value < 0.1)) return `${formatNumber(value * 1000)} mg`;
  return `${formatNumber(value)} g`;
}

export function ProductDetail({ id }: { id: number }) {
  const ui = useUi();
  const settings = useSettings();
  const stores = useStores();
  const product = useLiveQuery(() => db.products.get(id), [id]);
  const purchases = useLiveQuery(() => db.receiptItems.where('productId').equals(id).toArray(), [id]) ?? [];
  const shelfPrices = useLiveQuery(() => db.prices.where('productId').equals(id).toArray(), [id]) ?? [];
  const [offSearch, setOffSearch] = useState(false);

  if (product === undefined) return null;
  if (!product) {
    return (
      <div className="page">
        <Empty icon="🤷" title="Produkt nicht gefunden">
          <a href="#/products">Zur Produktliste</a>
        </Empty>
      </div>
    );
  }

  // Preise aus Kassenbons und beim Scannen erfasste Regalpreise.
  const priced = [
    ...purchases
      .filter((p) => p.kind === 'item' && p.unitPrice > 0)
      .map((p) => ({
        key: `r${p.id}`,
        date: p.date,
        unitPrice: p.unitPrice,
        storeId: p.storeId,
        unit: p.unit,
        detail: `${p.rawName} · ${p.unit === 'kg' ? `${formatNumber(p.quantity)} kg` : `${p.quantity}×`}`,
        receiptId: p.receiptId as number | undefined,
      })),
    ...shelfPrices.map((p) => ({
      key: `s${p.id}`,
      date: p.date,
      unitPrice: p.unitPrice,
      storeId: p.storeId,
      unit: 'stk' as const,
      detail: 'Regalpreis (beim Scannen erfasst)',
      receiptId: undefined as number | undefined,
    })),
  ].sort((a, b) => a.date - b.date);
  const storeName = (storeId?: number) => stores.find((s) => s.id === storeId)?.name ?? 'Unbekannter Markt';
  const stats = priceStats(priced.map((p) => ({ date: p.date, unitPrice: p.unitPrice, storeId: p.storeId, storeName: storeName(p.storeId) })));
  const unit = priced.some((p) => p.unit === 'kg') ? 'pro kg' : 'pro Stück';
  const storesInChart = [...new Set(priced.map((p) => p.storeId))];
  const n = product.nutriments;
  const extras = Object.entries(n?.extra ?? {}).sort(([a], [b]) => (EXTRA_NUTRIENT_LABELS[a] ?? a).localeCompare(EXTRA_NUTRIENT_LABELS[b] ?? b, 'de'));

  const byStore = new Map<number | undefined, { sum: number; n: number }>();
  for (const p of priced) {
    const e = byStore.get(p.storeId) ?? { sum: 0, n: 0 };
    e.sum += p.unitPrice;
    e.n++;
    byStore.set(p.storeId, e);
  }

  const addToList = async () => {
    if (!settings.activeListId) return;
    const added = await addItems(settings.activeListId, [{ name: product.name, productId: product.id, category: product.category, source: 'manual' }]);
    ui.toast(added ? 'Zur Liste hinzugefügt' : 'Steht schon auf der Liste');
  };

  const changeCategory = async (category: Product['category']) => {
    await db.products.update(id, { category, updatedAt: Date.now() });
    await rememberCategory(product.name, category);
  };

  const removeAlias = (alias: string) => db.products.update(id, { aliases: product.aliases.filter((a) => a !== alias) });

  return (
    <>
      <header className="topbar">
        <button className="icon-btn back" aria-label="Zurück" onClick={() => goBack('/products')}>
          <ArrowLeft size={22} />
        </button>
        <h1>{product.name}</h1>
        <button className="icon-btn" aria-label="Bearbeiten" onClick={() => navigate(`/products/${id}/edit`)}>
          <Pencil size={20} />
        </button>
      </header>

      <div className="page">
        <div className="card card-pad stack">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <ProductThumb imageUrl={product.imageUrl} category={product.category} large />
            <div className="grow stack" style={{ gap: 4 }}>
              <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{product.name}</div>
              <div className="small text-2">{[product.brand, product.quantity].filter(Boolean).join(' · ') || 'Keine Marke'}</div>
              {product.barcode && <div className="tiny muted num">EAN {product.barcode}</div>}
              <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                {product.purchaseDays.length > 0 && <span className="badge accent">{product.purchaseDays.length}× gekauft</span>}
                {product.novaGroup && <span className="badge">NOVA {product.novaGroup}</span>}
              </div>
            </div>
          </div>
          {product.nutriscore && (
            <div className="row small text-2">
              Nutri-Score <NutriScore grade={product.nutriscore} scale />
            </div>
          )}
          <label className="field">
            Kategorie
            <CategorySelect value={product.category} onChange={changeCategory} />
          </label>
          <div className="grid-2">
            <button className="btn primary" onClick={addToList}>
              <Plus size={18} /> Zur Liste
            </button>
            <button className="btn" onClick={() => setOffSearch(true)}>
              <Search size={18} /> Nährwerte
            </button>
          </div>
        </div>

        <div className="section-title">Preisverlauf</div>
        <div className="card card-pad stack">
          {stats ? (
            <>
              <div className="stats">
                <div>
                  <div className="tiny muted">Zuletzt</div>
                  <div className="row" style={{ gap: 6 }}>
                    <strong style={{ fontSize: '1.25rem' }}>{formatEuro(stats.last)}</strong>
                    {stats.trend !== null && Math.abs(stats.trend) >= 0.01 && (
                      <span className={`delta ${stats.trend > 0 ? 'up' : 'down'}`}>
                        {stats.trend > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        {formatPercent(stats.trend)}
                      </span>
                    )}
                  </div>
                  <div className="tiny muted">{unit} · {formatDate(stats.lastDate)}</div>
                </div>
                <div>
                  <div className="tiny muted">Durchschnitt</div>
                  <strong style={{ fontSize: '1.25rem' }}>{formatEuro(stats.avg)}</strong>
                  <div className="tiny muted">
                    {formatEuro(stats.min)} – {formatEuro(stats.max)}
                  </div>
                </div>
              </div>
              {stats.count > 1 && (
                <PriceChart
                  unit={unit}
                  points={priced.map((p) => ({ date: p.date, price: p.unitPrice, storeName: storeName(p.storeId), color: storeColor(stores, p.storeId) }))}
                />
              )}
              {storesInChart.length > 1 && (
                <div className="legend">
                  {storesInChart.map((s) => (
                    <span key={String(s)}>
                      <span className="swatch" style={{ background: storeColor(stores, s) }} />
                      {storeName(s)}
                    </span>
                  ))}
                </div>
              )}
              {stats.cheapestStore && (
                <div className="notice ok small">
                  <span>
                    Am günstigsten bei <strong>{stats.cheapestStore.storeName}</strong> (Ø {formatEuro(stats.cheapestStore.avg)})
                  </span>
                </div>
              )}
              {byStore.size > 1 && (
                <HBars
                  rows={[...byStore.entries()].map(([sid, e]) => ({
                    key: String(sid),
                    label: `Ø ${storeName(sid)}`,
                    value: e.sum / e.n,
                    color: storeColor(stores, sid),
                    icon: <span className="swatch" style={{ background: storeColor(stores, sid) }} />,
                  }))}
                />
              )}
              <details>
                <summary className="small text-2">Alle Preise ({priced.length})</summary>
                <table className="nutrients">
                  <tbody>
                    {[...priced].reverse().map((p) => (
                      <tr key={p.key}>
                        <td>
                          {formatDate(p.date)} · {storeName(p.storeId)}
                          <div className="tiny muted">{p.detail}</div>
                        </td>
                        <td>{p.receiptId ? <a href={`#/receipts/${p.receiptId}`}>{formatEuro(p.unitPrice)}</a> : formatEuro(p.unitPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          ) : (
            <div className="small muted">
              Noch keine Preise. Erfasse einen Kassenbon oder scanne das Produkt beim Einkaufen und bestätige den Regalpreis – daraus entsteht der Preisverlauf je Markt.
            </div>
          )}
        </div>

        <div className="section-title">Nährwerte je 100 g / 100 ml</div>
        <div className="card card-pad">
          {n ? (
            <>
              <table className="nutrients">
                <tbody>
                  {MAIN_ROWS.filter((r) => n[r.key] !== undefined).map((r) => (
                    <tr key={r.key} className={r.sub ? 'sub' : undefined}>
                      <td>{r.label}</td>
                      <td>
                        {formatNumber(n[r.key] as number)} {r.unit}
                        {r.key === 'energyKcal' && n.energyKj !== undefined && <span className="muted"> / {formatNumber(n.energyKj)} kJ</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {extras.length > 0 && (
                <details style={{ marginTop: 8 }}>
                  <summary className="small text-2">Weitere Nährstoffe ({extras.length})</summary>
                  <table className="nutrients">
                    <tbody>
                      {extras.map(([key, v]) => (
                        <tr key={key}>
                          <td>{EXTRA_NUTRIENT_LABELS[key] ?? key}</td>
                          <td>{formatExtra(v.value, v.unit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </>
          ) : (
            <div className="stack small muted">
              Keine Nährwerte hinterlegt. Scanne den Barcode, suche das Produkt in Open Food Facts oder trage die Werte selbst ein.
              <button className="btn soft" onClick={() => setOffSearch(true)}>
                <Search size={18} /> In Open Food Facts suchen
              </button>
            </div>
          )}
        </div>

        {(product.ingredients || product.allergens?.length) && (
          <>
            <div className="section-title">Zutaten & Allergene</div>
            <div className="card card-pad stack small">
              {product.ingredients && <div className="text-2">{product.ingredients}</div>}
              {product.allergens && product.allergens.length > 0 && (
                <div className="row wrap" style={{ gap: 6 }}>
                  {product.allergens.map((a) => (
                    <span key={a} className="badge warn">
                      {a}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {product.aliases.length > 0 && (
          <>
            <div className="section-title">Bezeichnungen auf Kassenbons</div>
            <div className="card card-pad row wrap" style={{ gap: 6 }}>
              {product.aliases.map((a) => (
                <span key={a} className="chip" style={{ cursor: 'default' }}>
                  {a}
                  <button className="icon-btn" style={{ width: 24, height: 24 }} aria-label={`${a} entfernen`} onClick={() => removeAlias(a)}>
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          </>
        )}

        <button
          className="btn danger"
          onClick={async () => {
            if (!confirm(`„${product.name}“ löschen? Bon-Positionen bleiben erhalten, verlieren aber die Zuordnung.`)) return;
            await deleteProduct(id);
            navigate('/products');
          }}
        >
          <Trash2 size={18} /> Produkt löschen
        </button>
      </div>

      {offSearch && (
        <OffSearchSheet
          initial={[product.brand, product.name].filter(Boolean).join(' ')}
          onClose={() => setOffSearch(false)}
          onPick={async (off) => {
            await applyOffData(id, off);
            setOffSearch(false);
            ui.toast('Nährwerte übernommen');
          }}
        />
      )}
    </>
  );
}

function OffSearchSheet({ initial, onClose, onPick }: { initial: string; onClose: () => void; onPick: (p: OffProduct) => void }) {
  const [query, setQuery] = useState(initial);
  const [results, setResults] = useState<OffProduct[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setResults(await searchProducts(query));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suche fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Open Food Facts durchsuchen" onClose={onClose}>
      <div className="stack">
        <form className="row" onSubmit={run}>
          <input className="input grow" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus aria-label="Suchbegriff" />
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? <Loader2 className="spin" size={18} /> : <Search size={18} />}
          </button>
        </form>
        {error && <div className="notice error">{error}</div>}
        {results && results.length === 0 && <div className="notice">Keine Treffer – probiere einen kürzeren Begriff oder die Marke.</div>}
        {results && results.length > 0 && (
          <div className="card">
            {results.map((r) => (
              <button key={r.barcode} className="list-row" onClick={() => onPick(r)}>
                <ProductThumb imageUrl={r.imageUrl} category={r.category} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="item-name ellipsis">{r.name}</div>
                  <div className="tiny muted ellipsis">
                    {[r.brand, r.quantity, r.nutriments?.energyKcal !== undefined ? `${formatNumber(r.nutriments.energyKcal)} kcal` : null, CATEGORIES[r.category].label]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <NutriScore grade={r.nutriscore} />
              </button>
            ))}
          </div>
        )}
        <p className="tiny muted" style={{ margin: 0 }}>
          Daten: Open Food Facts (ODbL). Übernommen werden Nährwerte, Bild, Barcode, Zutaten und Allergene.
        </p>
      </div>
    </Sheet>
  );
}
