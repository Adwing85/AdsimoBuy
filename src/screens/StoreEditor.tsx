import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowLeft, ArrowUp, GripVertical, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Empty } from '../components/common';
import { db } from '../db/db';
import { deleteStore, updateStore } from '../db/repo';
import { CATEGORIES, type CategoryId } from '../domain/categories';
import { learnOrder, MIN_TRIPS_FOR_LEARNING } from '../domain/learnOrder';
import { CHAINS, completeOrder, defaultOrderFor } from '../domain/stores';
import { goBack, navigate } from '../hooks/useRoute';
import { useUi } from '../ui';

export function StoreEditor({ id }: { id: number }) {
  const ui = useUi();
  const store = useLiveQuery(() => db.stores.get(id), [id]);
  const events = useLiveQuery(() => db.checkEvents.where('storeId').equals(id).toArray(), [id]) ?? [];
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (store) {
      setName(store.name);
      setLocation(store.location ?? '');
    }
  }, [store?.id]);

  if (store === undefined) return null;
  if (!store) {
    return (
      <div className="page">
        <Empty icon="🏬" title="Markt nicht gefunden" />
      </div>
    );
  }

  const order = completeOrder(store.categoryOrder);
  const learned = learnOrder(events, order);
  const learnedDiffers = learned && learned.order.some((c, i) => c !== order[i]);
  const trips = new Set(events.map((e) => e.tripKey)).size;

  const setOrder = (next: CategoryId[]) => updateStore(id, { categoryOrder: next });
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [c] = next.splice(from, 1);
    next.splice(to, 0, c);
    setOrder(next);
  };

  // Ziehen per Griff (Touch & Maus): Zielzeile anhand der Zeigerposition bestimmen.
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragIndex === null || !listRef.current) return;
    const rows = [...listRef.current.querySelectorAll<HTMLElement>('[data-row]')];
    const target = rows.findIndex((r) => {
      const rect = r.getBoundingClientRect();
      return e.clientY >= rect.top && e.clientY <= rect.bottom;
    });
    if (target >= 0 && target !== dragIndex) {
      move(dragIndex, target);
      setDragIndex(target);
    }
  };

  return (
    <>
      <header className="topbar">
        <button className="icon-btn back" aria-label="Zurück" onClick={() => goBack('/settings')}>
          <ArrowLeft size={22} />
        </button>
        <h1>{store.name}</h1>
      </header>
      <div className="page">
        <form
          className="card card-pad stack"
          onSubmit={async (e) => {
            e.preventDefault();
            await updateStore(id, { name: name.trim() || store.name, location: location.trim() || undefined });
            ui.toast('Gespeichert');
          }}
        >
          <div className="row small muted">
            <span className="store-dot" style={{ background: CHAINS[store.chain].color }} /> Kette: {CHAINS[store.chain].label}
          </div>
          <div className="grid-2">
            <label className="field">
              Name
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              Filiale / Ort
              <input className="input" value={location} placeholder="z. B. Hauptstraße" onChange={(e) => setLocation(e.target.value)} />
            </label>
          </div>
          <button className="btn" type="submit">
            Speichern
          </button>
        </form>

        {learned && learnedDiffers ? (
          <div className="card card-pad stack">
            <div className="row">
              <Sparkles size={20} className="muted" />
              <strong className="grow">Gelernter Laufweg</strong>
              <span className="badge accent">{learned.trips} Einkäufe</span>
            </div>
            <div className="small text-2">
              So hast du in diesem Markt tatsächlich eingekauft:{' '}
              {learned.observed
                .slice(0, 6)
                .map((c) => CATEGORIES[c].label)
                .join(' → ')}
              {learned.observed.length > 6 ? ' → …' : ''}
            </div>
            <button
              className="btn primary"
              onClick={async () => {
                await setOrder(learned.order);
                ui.toast('Gelernte Reihenfolge übernommen');
              }}
            >
              Reihenfolge übernehmen
            </button>
          </div>
        ) : (
          <div className="notice small">
            <Sparkles size={18} style={{ flex: 'none' }} />
            <span>
              Die App lernt den Laufweg mit: Wähle beim Einkaufen diesen Markt in der Liste und hake Artikel in der Reihenfolge ab, in der du sie in den
              Wagen legst. {trips < MIN_TRIPS_FOR_LEARNING ? `Noch ${MIN_TRIPS_FOR_LEARNING - trips} Einkauf(e) bis zum ersten Vorschlag.` : 'Deine Reihenfolge passt bereits.'}
            </span>
          </div>
        )}

        <div className="section-title">
          Laufweg ab Eingang<span className="spacer" />
          <button className="btn ghost small" onClick={() => setOrder(defaultOrderFor(store.chain))}>
            <RotateCcw size={16} /> Standard
          </button>
        </div>
        <div
          className="card group"
          ref={listRef}
          onPointerMove={onPointerMove}
          onPointerUp={() => setDragIndex(null)}
          onPointerCancel={() => setDragIndex(null)}
          style={{ touchAction: dragIndex !== null ? 'none' : undefined }}
        >
          {order.map((c, i) => (
            <div key={c} data-row className={`reorder-row${dragIndex === i ? ' dragging' : ''}`}>
              <span
                className="icon-btn"
                style={{ cursor: 'grab', touchAction: 'none', width: 32 }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  setDragIndex(i);
                }}
                aria-hidden="true"
              >
                <GripVertical size={18} />
              </span>
              <span className="pos">{i + 1}</span>
              <span aria-hidden="true">{CATEGORIES[c].icon}</span>
              <span className="grow ellipsis">{CATEGORIES[c].label}</span>
              <button className="icon-btn" style={{ width: 38 }} aria-label={`${CATEGORIES[c].label} nach oben`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                <ArrowUp size={18} />
              </button>
              <button
                className="icon-btn"
                style={{ width: 38 }}
                aria-label={`${CATEGORIES[c].label} nach unten`}
                disabled={i === order.length - 1}
                onClick={() => move(i, i + 1)}
              >
                <ArrowDown size={18} />
              </button>
            </div>
          ))}
        </div>

        <button
          className="btn danger"
          onClick={async () => {
            if (!confirm(`Markt „${store.name}“ löschen? Bons behalten ihren Marktnamen.`)) return;
            await deleteStore(id);
            navigate('/settings');
          }}
        >
          <Trash2 size={18} /> Markt löschen
        </button>
      </div>
    </>
  );
}
