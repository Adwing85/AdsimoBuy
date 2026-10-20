import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Empty } from '../components/common';
import { db } from '../db/db';
import { deleteReceipt, reassignReceiptItem } from '../db/repo';
import { CATEGORIES } from '../domain/categories';
import { CHAINS } from '../domain/stores';
import { formatDate, formatEuro, formatNumber } from '../format';
import { useStores } from '../hooks/data';
import { goBack, navigate } from '../hooks/useRoute';
import { useUi } from '../ui';

const SOURCE_LABEL = { ocr: 'Texterkennung', ai: 'KI-Erkennung', manual: 'Manuell' } as const;

export function ReceiptDetail({ id }: { id: number }) {
  const ui = useUi();
  const stores = useStores();
  const receipt = useLiveQuery(() => db.receipts.get(id), [id]);
  const items = useLiveQuery(() => db.receiptItems.where('receiptId').equals(id).toArray(), [id]) ?? [];
  const products = useLiveQuery(() => db.products.orderBy('name').toArray()) ?? [];
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!receipt?.image) return;
    const url = URL.createObjectURL(receipt.image);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [receipt?.image]);

  if (receipt === undefined) return null;
  if (!receipt) {
    return (
      <div className="page">
        <Empty icon="🧾" title="Bon nicht gefunden">
          <a href="#/expenses">Zu den Ausgaben</a>
        </Empty>
      </div>
    );
  }

  const store = stores.find((s) => s.id === receipt.storeId);
  const productName = (pid?: number) => products.find((p) => p.id === pid)?.name;
  const deposits = items.filter((i) => i.kind === 'deposit');
  const articles = items.filter((i) => i.kind === 'item');

  return (
    <>
      <header className="topbar">
        <button className="icon-btn back" aria-label="Zurück" onClick={() => goBack('/expenses')}>
          <ArrowLeft size={22} />
        </button>
        <h1>{receipt.storeName}</h1>
      </header>
      <div className="page">
        <div className="card card-pad stack">
          <div className="row">
            {store && <span className="store-dot" style={{ background: CHAINS[store.chain].color }} />}
            <div className="grow">
              <div className="small muted">
                {formatDate(receipt.date)} · {articles.length} Artikel · {SOURCE_LABEL[receipt.source]}
              </div>
            </div>
          </div>
          <div className="hero">{formatEuro(receipt.total)}</div>
          {imageUrl && (
            <details>
              <summary className="small text-2">Bon-Foto anzeigen</summary>
              <img className="photo-preview" style={{ maxHeight: 'none', marginTop: 10 }} src={imageUrl} alt="Kassenbon" />
            </details>
          )}
        </div>

        <div className="section-title">Positionen & Zuordnung</div>
        <div className="card">
          {articles.map((i) => (
            <div key={i.id} className="line-edit" style={{ gridTemplateColumns: '1fr auto' }}>
              <div className="stack" style={{ gap: 6, minWidth: 0 }}>
                <div className="row" style={{ gap: 6 }}>
                  <span aria-hidden="true">{CATEGORIES[i.category].icon}</span>
                  <strong className="ellipsis grow">{i.rawName}</strong>
                </div>
                <div className="tiny muted">
                  {i.unit === 'kg' ? `${formatNumber(i.quantity)} kg × ${formatEuro(i.unitPrice)}/kg` : `${i.quantity} × ${formatEuro(i.unitPrice)}`}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <select
                    className="select"
                    value={i.productId ?? ''}
                    onChange={(e) => reassignReceiptItem(i, e.target.value ? Number(e.target.value) : undefined)}
                    aria-label="Produkt zuordnen"
                  >
                    <option value="">— nicht zugeordnet</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.brand ? ` (${p.brand})` : ''}
                      </option>
                    ))}
                  </select>
                  {i.productId && productName(i.productId) && (
                    <a className="btn small" href={`#/products/${i.productId}`}>
                      Öffnen
                    </a>
                  )}
                </div>
              </div>
              <strong className="num">{formatEuro(i.totalPrice)}</strong>
            </div>
          ))}
          {deposits.map((i) => (
            <div key={i.id} className="line-edit">
              <div className="row small">
                <span className="badge">Pfand</span> {i.rawName}
              </div>
              <strong className="num">{formatEuro(i.totalPrice)}</strong>
            </div>
          ))}
        </div>

        <button
          className="btn danger"
          onClick={async () => {
            if (!confirm('Diesen Bon samt Preisen löschen?')) return;
            await deleteReceipt(id);
            ui.toast('Bon gelöscht');
            navigate('/expenses');
          }}
        >
          <Trash2 size={18} /> Bon löschen
        </button>
      </div>
    </>
  );
}
