import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, ReceiptText, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { HBars, MonthBars, type BarRow } from '../components/charts';
import { Empty, NutriScore } from '../components/common';
import { db } from '../db/db';
import { CATEGORIES, type CategoryId } from '../domain/categories';
import { priceStats } from '../domain/prices';
import { CHAINS } from '../domain/stores';
import { monthKey } from '../domain/text';
import { formatDate, formatEuro, formatMonth, formatMonthShort, formatPercent } from '../format';
import { storeColor, useStores } from '../hooks/data';
import { navigate } from '../hooks/useRoute';

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKey(d.getTime());
}

function monthStart(key: string): number {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).getTime();
}

export function ExpensesScreen() {
  const stores = useStores();
  const receipts = useLiveQuery(() => db.receipts.orderBy('date').reverse().toArray());
  const receiptItems = useLiveQuery(() => db.receiptItems.toArray()) ?? [];
  const products = useLiveQuery(() => db.products.toArray()) ?? [];
  const [month, setMonth] = useState(monthKey(Date.now()));

  const monthReceipts = useMemo(() => (receipts ?? []).filter((r) => monthKey(r.date) === month), [receipts, month]);
  const monthItems = useMemo(() => receiptItems.filter((i) => monthKey(i.date) === month), [receiptItems, month]);
  const total = monthReceipts.reduce((s, r) => s + r.total, 0);
  const prevTotal = (receipts ?? []).filter((r) => monthKey(r.date) === shiftMonth(month, -1)).reduce((s, r) => s + r.total, 0);

  const months = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5)).map((key) => ({
        key,
        label: formatMonthShort(monthStart(key)),
        value: (receipts ?? []).filter((r) => monthKey(r.date) === key).reduce((s, r) => s + r.total, 0),
      })),
    [receipts, month],
  );

  const byCategory: BarRow[] = useMemo(() => {
    const map = new Map<CategoryId, number>();
    for (const i of monthItems) if (i.kind === 'item') map.set(i.category, (map.get(i.category) ?? 0) + i.totalPrice);
    const rows = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const top: BarRow[] = rows.slice(0, 7).map(([c, v]) => ({
      key: c,
      label: CATEGORIES[c].label,
      icon: <span aria-hidden="true">{CATEGORIES[c].icon}</span>,
      value: v,
    }));
    const rest = rows.slice(7).reduce((s, [, v]) => s + v, 0);
    if (rest > 0) top.push({ key: 'rest', label: 'Weitere Kategorien', icon: <span aria-hidden="true">⋯</span>, value: rest });
    return top;
  }, [monthItems]);

  const deposit = monthItems.filter((i) => i.kind === 'deposit').reduce((s, i) => s + i.totalPrice, 0);

  const byStore: BarRow[] = useMemo(() => {
    const map = new Map<string, { storeId?: number; name: string; value: number }>();
    for (const r of monthReceipts) {
      const key = String(r.storeId ?? r.storeName);
      const e = map.get(key) ?? { storeId: r.storeId, name: r.storeName, value: 0 };
      e.value += r.total;
      map.set(key, e);
    }
    return [...map.values()]
      .sort((a, b) => b.value - a.value)
      .map((e) => ({
        key: String(e.storeId ?? e.name),
        label: e.name,
        value: e.value,
        color: storeColor(stores, e.storeId),
        icon: <span className="swatch" style={{ background: storeColor(stores, e.storeId) }} />,
      }));
  }, [monthReceipts, stores]);

  // Preis-Radar: Produkte, deren letzter Preis deutlich vom bisherigen Schnitt abweicht.
  const radar = useMemo(() => {
    const byProduct = new Map<number, Array<{ date: number; unitPrice: number }>>();
    for (const i of receiptItems) {
      if (i.kind !== 'item' || !i.productId || i.unitPrice <= 0) continue;
      const list = byProduct.get(i.productId) ?? [];
      list.push({ date: i.date, unitPrice: i.unitPrice });
      byProduct.set(i.productId, list);
    }
    const result: Array<{ productId: number; name: string; trend: number; last: number; nutriscore?: string }> = [];
    for (const [pid, points] of byProduct) {
      const s = priceStats(points);
      if (!s || s.count < 2 || s.trend === null || Math.abs(s.trend) < 0.05) continue;
      const p = products.find((x) => x.id === pid);
      if (p) result.push({ productId: pid, name: p.name, trend: s.trend, last: s.last, nutriscore: p.nutriscore });
    }
    return result.sort((a, b) => Math.abs(b.trend) - Math.abs(a.trend)).slice(0, 6);
  }, [receiptItems, products]);

  // Nutri-Score-Verteilung der gekauften Produkte im Monat (nach Ausgaben).
  const nutri = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of monthItems) {
      if (i.kind !== 'item' || !i.productId) continue;
      const grade = products.find((p) => p.id === i.productId)?.nutriscore;
      if (grade) map.set(grade, (map.get(grade) ?? 0) + i.totalPrice);
    }
    return ['a', 'b', 'c', 'd', 'e'].filter((g) => map.has(g)).map((g) => ({ grade: g, value: map.get(g)! }));
  }, [monthItems, products]);

  const delta = prevTotal > 0 ? (total - prevTotal) / prevTotal : null;
  const isCurrentMonth = month === monthKey(Date.now());

  return (
    <>
      <header className="topbar">
        <h1>Ausgaben</h1>
        <button className="btn primary small" onClick={() => navigate('/receipts/new')}>
          <ReceiptText size={18} /> Bon erfassen
        </button>
      </header>
      <div className="page">
        <div className="row">
          <button className="icon-btn filled" aria-label="Vorheriger Monat" onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft size={20} />
          </button>
          <strong className="grow" style={{ textAlign: 'center' }}>
            {formatMonth(monthStart(month))}
          </strong>
          <button className="icon-btn filled" aria-label="Nächster Monat" disabled={isCurrentMonth} onClick={() => setMonth(shiftMonth(month, 1))}>
            <ChevronRight size={20} />
          </button>
        </div>

        {receipts && receipts.length === 0 ? (
          <Empty icon="🧾" title="Noch keine Ausgaben">
            <p className="small">
              Fotografiere nach dem Einkauf deinen Kassenbon. Die Positionen werden erkannt, deinen Produkten zugeordnet und daraus entstehen
              Ausgaben-Übersicht und Preisverläufe.
            </p>
            <button className="btn primary" onClick={() => navigate('/receipts/new')}>
              <ReceiptText size={18} /> Ersten Bon erfassen
            </button>
          </Empty>
        ) : (
          <>
            <div className="card card-pad stack" style={{ gap: 6 }}>
              <div className="small muted">Ausgaben im {formatMonth(monthStart(month)).split(' ')[0]}</div>
              <div className="hero">{formatEuro(total)}</div>
              <div className="row small text-2 wrap" style={{ gap: 12 }}>
                <span>{monthReceipts.length === 1 ? '1 Einkauf' : `${monthReceipts.length} Einkäufe`}</span>
                {monthReceipts.length > 0 && <span>Ø {formatEuro(total / monthReceipts.length)} pro Einkauf</span>}
                {delta !== null && (
                  <span className={`delta ${delta > 0 ? 'up' : 'down'}`}>
                    {delta > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />} {formatPercent(delta)} ggü. Vormonat
                  </span>
                )}
              </div>
              <MonthBars months={months} selectedKey={month} onSelect={setMonth} />
            </div>

            {byCategory.length > 0 && (
              <>
                <div className="section-title">Nach Kategorie</div>
                <div className="card card-pad">
                  <HBars rows={byCategory} />
                  {deposit !== 0 && (
                    <div className="tiny muted" style={{ marginTop: 6 }}>
                      Pfand (Saldo): {formatEuro(deposit)}
                    </div>
                  )}
                </div>
              </>
            )}

            {byStore.length > 0 && (
              <>
                <div className="section-title">Nach Markt</div>
                <div className="card card-pad">
                  <HBars rows={byStore} />
                </div>
              </>
            )}

            {nutri.length > 0 && (
              <>
                <div className="section-title">Nutri-Score deiner Einkäufe</div>
                <div className="card card-pad">
                  <HBars
                    rows={nutri.map((n) => ({
                      key: n.grade,
                      label: `Nutri-Score ${n.grade.toUpperCase()}`,
                      icon: <NutriScore grade={n.grade} />,
                      value: n.value,
                      color: 'var(--chart-accent)',
                    }))}
                  />
                </div>
              </>
            )}

            {radar.length > 0 && (
              <>
                <div className="section-title">Preis-Radar</div>
                <div className="card">
                  {radar.map((r) => (
                    <a key={r.productId} className="list-row" href={`#/products/${r.productId}`}>
                      <div className="grow">
                        <div className="item-name ellipsis">{r.name}</div>
                        <div className="tiny muted">zuletzt {formatEuro(r.last)} · ggü. bisherigem Schnitt</div>
                      </div>
                      <span className={`badge ${r.trend > 0 ? 'danger' : 'accent'}`}>
                        {r.trend > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {formatPercent(r.trend)}
                      </span>
                    </a>
                  ))}
                </div>
              </>
            )}

            <div className="section-title">Kassenbons</div>
            {monthReceipts.length === 0 ? (
              <div className="card card-pad small muted">Keine Bons in diesem Monat.</div>
            ) : (
              <div className="card">
                {monthReceipts.map((r) => {
                  const store = stores.find((s) => s.id === r.storeId);
                  return (
                    <a key={r.id} className="list-row" href={`#/receipts/${r.id}`}>
                      <span className="store-dot" style={{ background: store ? CHAINS[store.chain].color : 'var(--muted)' }} />
                      <div className="grow">
                        <div className="item-name">{r.storeName}</div>
                        <div className="tiny muted">{formatDate(r.date)}</div>
                      </div>
                      <strong className="num">{formatEuro(r.total)}</strong>
                    </a>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
