import { useLiveQuery } from 'dexie-react-hooks';
import { Barcode, Camera, Check, ChefHat, ChevronDown, ListPlus, MoreVertical, Plus, ReceiptText, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { CategorySelect, Empty, ProductThumb, Progress, Sheet } from '../components/common';
import { db } from '../db/db';
import {
  addItems,
  clearChecked,
  createList,
  deleteList,
  setItemChecked,
  setSetting,
  updateItem,
} from '../db/repo';
import type { ListItem, Product } from '../db/types';
import { CATEGORIES } from '../domain/categories';
import { parseListLine, quantityMultiplier } from '../domain/parseListText';
import { estimateTotal } from '../domain/prices';
import { CHAINS, groupByStoreOrder } from '../domain/stores';
import { repurchaseSuggestions } from '../domain/suggestions';
import { normalize } from '../domain/text';
import { formatEuro } from '../format';
import { useSettings, useStores } from '../hooks/data';
import { navigate } from '../hooks/useRoute';
import { useUi } from '../ui';

export function ListScreen() {
  const ui = useUi();
  const settings = useSettings();
  const stores = useStores();
  const listId = settings.activeListId;
  const lists = useLiveQuery(() => db.lists.orderBy('updatedAt').reverse().toArray()) ?? [];
  const list = lists.find((l) => l.id === listId) ?? lists[0];
  const items = useLiveQuery(() => (list?.id ? db.items.where('listId').equals(list.id).toArray() : []), [list?.id]) ?? [];
  const products = useLiveQuery(() => db.products.toArray()) ?? [];
  const productById = useMemo(() => new Map(products.map((p) => [p.id!, p])), [products]);
  const store = stores.find((s) => s.id === list?.storeId);

  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [editing, setEditing] = useState<ListItem | null>(null);
  const [listMenu, setListMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const open = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked).sort((a, b) => (b.checkedAt ?? 0) - (a.checkedAt ?? 0));
  const order = store?.categoryOrder ?? CHAINS.other.order;
  const groups = groupByStoreOrder(open, order);

  const estimate = estimateTotal(
    open.map((i) => ({
      unitPrice: i.productId ? productById.get(i.productId)?.lastUnitPrice : undefined,
      multiplier: quantityMultiplier(i.quantity),
    })),
  );

  const suggestions = useMemo(() => {
    const onList = new Set(items.filter((i) => !i.checked).map((i) => i.productId).filter((x): x is number => x !== undefined));
    const openNames = new Set(items.filter((i) => !i.checked).map((i) => normalize(i.name)));
    return repurchaseSuggestions(
      products.filter((p) => !openNames.has(normalize(p.name))).map((p) => ({ productId: p.id!, name: p.name, days: p.purchaseDays })),
      Date.now(),
      { excludeIds: onList, limit: 6 },
    );
  }, [products, items]);

  const autocomplete = useMemo(() => {
    const q = normalize(text);
    if (q.length < 2) return [];
    return products
      .filter((p) => normalize(p.name).includes(q) || (p.brand && normalize(p.brand).includes(q)))
      .sort((a, b) => {
        const as = normalize(a.name).startsWith(q) ? 0 : 1;
        const bs = normalize(b.name).startsWith(q) ? 0 : 1;
        return as - bs || b.purchaseDays.length - a.purchaseDays.length;
      })
      .slice(0, 6);
  }, [text, products]);

  if (!list?.id) {
    return (
      <div className="page">
        <Empty icon="📝" title="Noch keine Liste">
          <button className="btn primary" onClick={() => createList('Einkaufsliste')}>
            Liste anlegen
          </button>
        </Empty>
      </div>
    );
  }
  const activeListId = list.id;

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const entry = parseListLine(text);
    if (!entry) return;
    setText('');
    inputRef.current?.focus();
    const added = await addItems(activeListId, [{ ...entry, source: 'manual' }]);
    if (!added) ui.toast(`„${entry.name}“ steht schon auf der Liste`);
  };

  const addProduct = async (p: Product, source: 'manual' | 'suggestion') => {
    setText('');
    const added = await addItems(activeListId, [{ name: p.name, productId: p.id, category: p.category, source }]);
    if (!added) ui.toast(`„${p.name}“ steht schon auf der Liste`);
  };

  const toggle = (item: ListItem) => {
    navigator.vibrate?.(15);
    setItemChecked(item, !item.checked, list.storeId);
  };

  const remove = async (item: ListItem) => {
    if (!item.id) return;
    await db.items.delete(item.id);
    setEditing(null);
    ui.toast(`„${item.name}“ entfernt`, { label: 'Rückgängig', run: () => db.items.add({ ...item }) });
  };

  const progress = items.length ? done.length / items.length : 0;

  return (
    <>
      <header className="topbar">
        <button className="btn ghost grow" style={{ justifyContent: 'flex-start', padding: 0, minWidth: 0 }} onClick={() => setListMenu(true)}>
          <h1 style={{ flex: 'none', maxWidth: '100%' }}>{list.name}</h1>
          <ChevronDown size={20} className="muted" style={{ flex: 'none' }} />
        </button>
        <button className="icon-btn" aria-label="Liste verwalten" onClick={() => setListMenu(true)}>
          <MoreVertical size={22} />
        </button>
      </header>

      <div className="page">
        <div className="chips" role="group" aria-label="Markt auswählen">
          {stores.map((s) => (
            <button
              key={s.id}
              className="chip"
              aria-pressed={s.id === list.storeId}
              onClick={() => db.lists.update(activeListId, { storeId: s.id === list.storeId ? undefined : s.id, updatedAt: Date.now() })}
            >
              <span className="store-dot" style={{ background: CHAINS[s.chain].color }} />
              {s.name}
              {s.location ? <span className="muted"> · {s.location}</span> : null}
            </button>
          ))}
          <a className="chip" href="#/settings" style={{ textDecoration: 'none', color: 'inherit' }}>
            <Plus size={16} /> Markt
          </a>
        </div>

        <div style={{ position: 'relative' }}>
          <form className="add-bar" onSubmit={submit}>
            <input
              ref={inputRef}
              className="input grow"
              placeholder="Was brauchst du? z. B. „2x Milch“"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              enterKeyHint="done"
              aria-label="Artikel hinzufügen"
            />
            {text.trim() ? (
              <button className="icon-btn filled" type="submit" aria-label="Hinzufügen" style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
                <Plus size={22} />
              </button>
            ) : (
              <>
                <button type="button" className="icon-btn" aria-label="Einkaufszettel fotografieren" onClick={ui.openPhotoImport}>
                  <Camera size={22} />
                </button>
                <button type="button" className="icon-btn" aria-label="Barcode scannen" onClick={() => ui.openScanner('list')}>
                  <Barcode size={22} />
                </button>
              </>
            )}
          </form>
          {focused && autocomplete.length > 0 && (
            <div className="autocomplete">
              {autocomplete.map((p) => (
                <button key={p.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => addProduct(p, 'manual')}>
                  <ProductThumb imageUrl={p.imageUrl} category={p.category} />
                  <div className="grow">
                    <div className="item-name ellipsis">{p.name}</div>
                    <div className="tiny muted">
                      {[p.brand, p.lastUnitPrice ? formatEuro(p.lastUnitPrice) : null, CATEGORIES[p.category].label].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <Plus size={18} className="muted" />
                </button>
              ))}
            </div>
          )}
        </div>

        {suggestions.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <div className="section-title">
              <Sparkles size={14} /> Wird bald fällig
            </div>
            <div className="chips">
              {suggestions.map((s) => {
                const p = productById.get(s.productId);
                return (
                  <button
                    key={s.productId}
                    className="chip suggest"
                    title={`Kaufst du etwa alle ${s.intervalDays} Tage – zuletzt vor ${s.daysSinceLast} Tagen`}
                    onClick={() => p && addProduct(p, 'suggestion')}
                  >
                    <Plus size={14} /> {s.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {items.length > 0 && (
          <div className="card summary-strip">
            <div className="grow stack" style={{ gap: 6 }}>
              <div className="row small">
                <strong>
                  {done.length} von {items.length} im Wagen
                </strong>
                <span className="grow" />
                {estimate.known > 0 && (
                  <span className="text-2" title={estimate.unknown ? `${estimate.unknown} Artikel ohne bekannten Preis` : undefined}>
                    ≈ <strong className="num">{formatEuro(estimate.total)}</strong>
                    {estimate.unknown > 0 && <span className="muted"> +{estimate.unknown} ohne Preis</span>}
                  </span>
                )}
              </div>
              <Progress value={progress} />
            </div>
          </div>
        )}

        {store && open.length > 0 && (
          <div className="small muted" style={{ marginTop: -4 }}>
            Sortiert nach Laufweg in <strong className="text-2">{store.name}</strong>
          </div>
        )}
        {!store && open.length > 0 && (
          <div className="notice small">Tipp: Wähle oben deinen Markt – dann wird die Liste nach dem Laufweg im Laden sortiert.</div>
        )}

        {items.length === 0 && (
          <Empty icon="🛒" title="Deine Liste ist leer">
            <p className="small">Tippe oben einen Artikel ein, fotografiere einen Einkaufszettel oder ein Gericht, oder scanne einen Barcode.</p>
            <div className="row wrap" style={{ justifyContent: 'center', marginTop: 12 }}>
              <button className="btn soft" onClick={ui.openPhotoImport}>
                <Camera size={18} /> Zettel fotografieren
              </button>
              <button className="btn soft" onClick={ui.openDishImport}>
                <ChefHat size={18} /> Gericht
              </button>
              <button className="btn soft" onClick={() => ui.openScanner('list')}>
                <Barcode size={18} /> Barcode
              </button>
            </div>
          </Empty>
        )}

        {groups.map((g, gi) => (
          <section key={g.category} className="card group" aria-label={CATEGORIES[g.category].label}>
            <div className="group-head">
              {store && <span className="step">{gi + 1}</span>}
              <span aria-hidden="true">{CATEGORIES[g.category].icon}</span>
              <span className="grow">{CATEGORIES[g.category].label}</span>
              <span className="muted">{g.items.length}</span>
            </div>
            {g.items.map((item) => (
              <ItemRow key={item.id} item={item} product={item.productId ? productById.get(item.productId) : undefined} onToggle={toggle} onEdit={setEditing} />
            ))}
          </section>
        ))}

        {done.length > 0 && (
          <>
            <div className="section-title">
              <Check size={14} /> Im Wagen ({done.length})<span className="spacer" />
              <button className="btn ghost small" onClick={() => clearChecked(activeListId)}>
                <Trash2 size={16} /> Leeren
              </button>
            </div>
            <section className="card group">
              {done.map((item) => (
                <ItemRow key={item.id} item={item} product={item.productId ? productById.get(item.productId) : undefined} onToggle={toggle} onEdit={setEditing} />
              ))}
            </section>
            {open.length === 0 && (
              <div className="notice ok">
                <ReceiptText size={20} style={{ flex: 'none' }} />
                <div className="grow">
                  Alles erledigt! Erfasse jetzt deinen Kassenbon, damit Ausgaben und Preise den Produkten zugeordnet werden.
                  <div style={{ marginTop: 8 }}>
                    <button className="btn primary small" onClick={() => navigate('/receipts/new')}>
                      Bon erfassen
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {editing && (
        <ItemEditor
          item={editing}
          product={editing.productId ? productById.get(editing.productId) : undefined}
          onClose={() => setEditing(null)}
          onDelete={() => remove(editing)}
        />
      )}

      {listMenu && (
        <ListMenu
          currentId={activeListId}
          lists={lists}
          onClose={() => setListMenu(false)}
          onToast={ui.toast}
        />
      )}
    </>
  );
}

function ItemRow({
  item,
  product,
  onToggle,
  onEdit,
}: {
  item: ListItem;
  product?: Product;
  onToggle: (i: ListItem) => void;
  onEdit: (i: ListItem) => void;
}) {
  const price = product?.lastUnitPrice;
  return (
    <div className={`item${item.checked ? ' done' : ''}`}>
      <button
        className="check"
        onClick={() => onToggle(item)}
        aria-label={item.checked ? `${item.name} zurück auf die Liste` : `${item.name} abhaken`}
        aria-pressed={Boolean(item.checked)}
      >
        <Check size={16} strokeWidth={3} />
      </button>
      <div className="item-main" onClick={() => onEdit(item)}>
        <div className="item-name">
          {item.quantity && <span className="qty">{item.quantity} </span>}
          {item.name}
        </div>
        {(item.note || product?.brand || price) && (
          <div className="item-meta">
            {product?.brand && <span>{product.brand}</span>}
            {price ? <span className="num">zuletzt {formatEuro(price)}</span> : null}
            {item.note && <span>{item.note}</span>}
          </div>
        )}
      </div>
      {product?.imageUrl && <ProductThumb imageUrl={product.imageUrl} category={product.category} />}
    </div>
  );
}

function ItemEditor({
  item,
  product,
  onClose,
  onDelete,
}: {
  item: ListItem;
  product?: Product;
  onClose: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity ?? '');
  const [note, setNote] = useState(item.note ?? '');
  const [category, setCategory] = useState(item.category);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateItem(item, { name: name.trim() || item.name, quantity: quantity.trim() || undefined, note: note.trim() || undefined, category });
    onClose();
  };

  return (
    <Sheet title="Artikel bearbeiten" onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <label className="field">
          Artikel
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="grid-2">
          <label className="field">
            Menge
            <input className="input" value={quantity} placeholder="z. B. 2× oder 500 g" onChange={(e) => setQuantity(e.target.value)} />
          </label>
          <label className="field">
            Notiz
            <input className="input" value={note} placeholder="z. B. Bio" onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <label className="field">
          Kategorie (bestimmt den Platz im Laufweg)
          <CategorySelect value={category} onChange={setCategory} />
        </label>
        {product && (
          <button
            type="button"
            className="list-row card"
            style={{ borderTop: '1px solid var(--border)' }}
            onClick={() => {
              onClose();
              navigate(`/products/${product.id}`);
            }}
          >
            <ProductThumb imageUrl={product.imageUrl} category={product.category} />
            <div className="grow">
              <div className="item-name ellipsis">{product.name}</div>
              <div className="tiny muted">Verknüpftes Produkt · Nährwerte & Preisverlauf ansehen</div>
            </div>
          </button>
        )}
        <div className="grid-2">
          <button type="button" className="btn danger" onClick={onDelete}>
            <Trash2 size={18} /> Entfernen
          </button>
          <button type="submit" className="btn primary">
            Speichern
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function ListMenu({
  currentId,
  lists,
  onClose,
  onToast,
}: {
  currentId: number;
  lists: Array<{ id?: number; name: string }>;
  onClose: () => void;
  onToast: (m: string) => void;
}) {
  const current = lists.find((l) => l.id === currentId);
  const [rename, setRename] = useState(current?.name ?? '');
  const [newName, setNewName] = useState('');

  return (
    <Sheet title="Listen" onClose={onClose}>
      <div className="stack">
        <div className="card">
          {lists.map((l) => (
            <button
              key={l.id}
              className="list-row"
              onClick={async () => {
                await setSetting('activeListId', l.id);
                onClose();
              }}
            >
              <span className="grow item-name">{l.name}</span>
              {l.id === currentId && <Check size={18} className="muted" />}
            </button>
          ))}
        </div>
        <form
          className="row"
          onSubmit={async (e) => {
            e.preventDefault();
            await createList(newName || 'Neue Liste');
            onClose();
          }}
        >
          <input className="input grow" placeholder="Neue Liste, z. B. Grillabend" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button className="btn soft" type="submit">
            <ListPlus size={18} /> Anlegen
          </button>
        </form>
        <hr className="divider" />
        <form
          className="row"
          onSubmit={async (e) => {
            e.preventDefault();
            if (rename.trim()) await db.lists.update(currentId, { name: rename.trim() });
            onClose();
          }}
        >
          <input className="input grow" value={rename} onChange={(e) => setRename(e.target.value)} aria-label="Liste umbenennen" />
          <button className="btn" type="submit">
            Umbenennen
          </button>
        </form>
        <button
          className="btn danger"
          onClick={async () => {
            if (!confirm(`Liste „${current?.name}“ mit allen Einträgen löschen?`)) return;
            await deleteList(currentId);
            onToast('Liste gelöscht');
            onClose();
          }}
        >
          <Trash2 size={18} /> Diese Liste löschen
        </button>
      </div>
    </Sheet>
  );
}
