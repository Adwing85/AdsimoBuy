import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Loader2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { db } from '../db/db';
import { addItems, confirmItemWithProduct, productForUnknownBarcode, productPricePoints } from '../db/repo';
import type { Product } from '../db/types';
import { CATEGORIES } from '../domain/categories';
import { ITEM_MATCH_THRESHOLD, rankItemsForProduct } from '../domain/matching';
import { CHAINS } from '../domain/stores';
import { parseDecimal } from '../domain/text';
import { formatEuro, formatRelativeDays } from '../format';
import { fetchCommunityPrices, type CommunityPrice } from '../services/openPrices';
import { NutriScore, ProductThumb } from './common';

const NEW = 'new';

/** Nach dem Scan im Laden: passenden Listeneintrag wählen, Preis prüfen, abhaken. */
export function CheckCard({
  barcode,
  product,
  listId,
  targetItemId,
  onDone,
  onCancel,
}: {
  barcode: string;
  product?: Product;
  listId: number;
  targetItemId?: number;
  onDone: (message: string, remainingOpen: number) => void;
  onCancel: () => void;
}) {
  const list = useLiveQuery(() => db.lists.get(listId), [listId]);
  const store = useLiveQuery(() => (list?.storeId ? db.stores.get(list.storeId) : undefined), [list?.storeId]);
  const openItems = useLiveQuery(() => db.items.where('[listId+checked]').equals([listId, 0]).toArray(), [listId]);
  const ownPrices = useLiveQuery(() => (product?.id ? productPricePoints(product.id) : []), [product?.id]);
  const [community, setCommunity] = useState<CommunityPrice[] | 'loading' | 'error'>('loading');
  const [selected, setSelected] = useState<string | null>(null);
  const [priceText, setPriceText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!navigator.onLine) {
      setCommunity('error');
      return;
    }
    const ctrl = new AbortController();
    fetchCommunityPrices(barcode, ctrl.signal)
      .then(setCommunity)
      .catch(() => !ctrl.signal.aborted && setCommunity('error'));
    return () => ctrl.abort();
  }, [barcode]);

  const ranked = useMemo(() => {
    if (!openItems) return [];
    const candidates = openItems.map((i) => ({ id: i.id!, name: i.name, category: i.category, productId: i.productId }));
    return product ? rankItemsForProduct(product, candidates) : candidates.map((c) => ({ id: c.id, score: 0 }));
  }, [openItems, product]);

  // Vorauswahl: gezielt gescannter Eintrag, sonst bester Treffer, sonst "neu".
  useEffect(() => {
    if (selected !== null || !openItems) return;
    if (targetItemId && openItems.some((i) => i.id === targetItemId)) setSelected(String(targetItemId));
    else if (ranked[0] && (ranked[0].score >= 0.3 || !product)) setSelected(String(ranked[0].id));
    else setSelected(product ? NEW : null);
  }, [openItems, ranked, selected, targetItemId, product]);

  const storePrice = useMemo(() => {
    if (!ownPrices || !store?.id) return undefined;
    return ownPrices.filter((p) => p.storeId === store.id).sort((a, b) => b.date - a.date)[0];
  }, [ownPrices, store?.id]);
  const anyPrice = useMemo(() => ownPrices?.slice().sort((a, b) => b.date - a.date)[0], [ownPrices]);
  const communityList = Array.isArray(community) ? community : [];
  const sameChain = store ? communityList.filter((c) => c.chain === store.chain) : [];
  const communityShown = (sameChain.length ? sameChain : communityList).slice(0, 2);

  // Preisfeld mit dem besten bekannten Preis für diesen Markt vorbelegen.
  useEffect(() => {
    if (priceText !== null || ownPrices === undefined) return;
    const suggestion = storePrice?.unitPrice ?? (community === 'loading' ? undefined : sameChain[0]?.price);
    if (suggestion !== undefined) setPriceText(suggestion.toFixed(2).replace('.', ','));
    else if (community !== 'loading') setPriceText('');
  }, [ownPrices, storePrice, community, sameChain, priceText]);

  const selectedItem = openItems?.find((i) => String(i.id) === selected);
  const best = ranked[0];
  const uncertain = product && selectedItem && best?.id === selectedItem.id && best.score < ITEM_MATCH_THRESHOLD && !targetItemId;

  const confirm = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const parsed = priceText ? parseDecimal(priceText) : NaN;
      const price = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
      let item = selectedItem;
      if (selected === NEW && product) {
        await addItems(listId, [{ name: product.name, productId: product.id, category: product.category, source: 'barcode' }]);
        item = await db.items
          .where('[listId+checked]')
          .equals([listId, 0])
          .filter((i) => i.productId === product.id || i.name === product.name)
          .first();
      }
      if (!item) return;
      const productId = product?.id ?? (await productForUnknownBarcode(barcode, item.name, item.category));
      await confirmItemWithProduct(item, productId, list?.storeId, price);
      const remaining = (openItems?.length ?? 1) - (selected === NEW ? 0 : 1);
      onDone(`„${item.name}“ abgehakt${price ? ` · ${formatEuro(price)}` : ''}`, remaining);
    } finally {
      setBusy(false);
    }
  };

  if (!openItems) {
    return (
      <div className="row">
        <Loader2 className="spin" size={20} /> Lade Liste …
      </div>
    );
  }
  if (selected === null) {
    return (
      <div className="stack">
        <div className="notice">Auf der Liste ist nichts mehr offen.</div>
        <button className="btn" onClick={onCancel}>
          Weiter scannen
        </button>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row">
        {product ? (
          <>
            <ProductThumb imageUrl={product.imageUrl} category={product.category} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="item-name ellipsis">{product.name}</div>
              <div className="small muted ellipsis">{[product.brand, product.quantity].filter(Boolean).join(' · ') || CATEGORIES[product.category].label}</div>
            </div>
            <NutriScore grade={product.nutriscore} />
          </>
        ) : (
          <div className="grow">
            <div className="item-name">Barcode {barcode}</div>
            <div className="small muted">Nicht in Open Food Facts – wird unter dem Namen des Listeneintrags gespeichert.</div>
          </div>
        )}
      </div>

      <label className="field">
        Abhaken auf der Liste
        <select className="select" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {ranked.map((r) => {
            const item = openItems.find((i) => i.id === r.id);
            return item ? (
              <option key={r.id} value={r.id}>
                {CATEGORIES[item.category].icon} {item.quantity ? `${item.quantity} ` : ''}
                {item.name}
              </option>
            ) : null;
          })}
          {product && <option value={NEW}>＋ Nicht auf der Liste – hinzufügen & abhaken</option>}
        </select>
      </label>
      {uncertain && <div className="notice warn small">Unsicherer Treffer – bitte prüfen, ob das der richtige Eintrag ist.</div>}

      <div className="card card-pad stack" style={{ gap: 6 }}>
        <div className="row small">
          <span className="grow text-2">{store ? `Dein Preis bei ${store.name}` : 'Dein letzter Preis'}</span>
          <strong className="num">
            {storePrice ? `${formatEuro(storePrice.unitPrice)} · ${formatRelativeDays(storePrice.date)}` : anyPrice && !store ? formatEuro(anyPrice.unitPrice) : '–'}
          </strong>
        </div>
        {store && anyPrice && anyPrice !== storePrice && (
          <div className="row tiny muted">
            <span className="grow">Zuletzt woanders</span>
            <span className="num">{formatEuro(anyPrice.unitPrice)}</span>
          </div>
        )}
        <div className="row small" style={{ alignItems: 'flex-start' }}>
          <Users size={16} className="muted" style={{ flex: 'none', marginTop: 2 }} />
          <span className="grow text-2">Open Prices (Community)</span>
          {community === 'loading' ? (
            <Loader2 className="spin" size={16} />
          ) : communityShown.length === 0 ? (
            <span className="muted">{community === 'error' ? 'nicht erreichbar' : 'keine Daten'}</span>
          ) : (
            <span className="stack" style={{ gap: 2, alignItems: 'flex-end' }}>
              {communityShown.map((c, i) => (
                <span key={i} className="num tiny" style={{ textAlign: 'right' }}>
                  <strong className="small">{formatEuro(c.price)}</strong> {c.storeName}
                  {c.city ? ` ${c.city}` : ''} · {c.date ? formatRelativeDays(c.date) : '?'}
                  {c.discounted ? ' (Angebot)' : ''}
                </span>
              ))}
            </span>
          )}
        </div>
        {store && communityList.length > 0 && sameChain.length === 0 && (
          <div className="tiny muted">Keine Community-Preise für {CHAINS[store.chain].label} – angezeigt werden andere Märkte.</div>
        )}
      </div>

      <div className="row">
        <label className="field grow">
          Preis am Regal (€){!store && <span className="tiny muted">Tipp: Markt in der Liste wählen</span>}
          <input
            className="input num"
            inputMode="decimal"
            placeholder="optional"
            value={priceText ?? ''}
            onChange={(e) => setPriceText(e.target.value)}
          />
        </label>
      </div>

      <div className="grid-2">
        <button className="btn" onClick={onCancel} disabled={busy}>
          Abbrechen
        </button>
        <button className="btn primary" onClick={confirm} disabled={busy || !selected}>
          {busy ? <Loader2 className="spin" size={18} /> : <Check size={18} />} Abhaken
        </button>
      </div>
    </div>
  );
}
