import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, CheckCircle2, Loader2, Plus, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CategorySelect, Progress } from '../components/common';
import { isAiAvailable } from '../components/PhotoImport';
import { PhotoPicker } from '../components/PhotoPicker';
import { db } from '../db/db';
import { classify, saveReceipt, type ReceiptDraftLine } from '../db/repo';
import type { Product, Store } from '../db/types';
import type { CategoryId } from '../domain/categories';
import { findBestMatch, nameSimilarity } from '../domain/matching';
import { parseReceiptText, sumItems, type ParsedReceiptLine } from '../domain/parseReceiptText';
import { detectChain, type ChainId } from '../domain/stores';
import { normalize, parseDecimal, round2 } from '../domain/text';
import { formatEuro, fromDateInput, toDateInput } from '../format';
import { useSettings, useStores } from '../hooks/data';
import { goBack, navigate } from '../hooks/useRoute';
import { resizeImage } from '../services/image';
import { useUi } from '../ui';

interface Line extends ReceiptDraftLine {
  key: number;
  priceText: string;
}

type Step = { kind: 'pick' } | { kind: 'busy'; progress: number; status: string } | { kind: 'review' };

let lineKey = 1;

function priceText(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

function findStore(stores: Store[], chain: ChainId | null, name?: string | null): Store | undefined {
  if (name) {
    const key = normalize(name);
    const byName = stores.find((s) => normalize(s.name) === key);
    if (byName) return byName;
    chain = chain ?? detectChain(name);
  }
  return chain ? stores.find((s) => s.chain === chain) : undefined;
}

export function ReceiptCapture() {
  const ui = useUi();
  const settings = useSettings();
  const stores = useStores();
  const products = useLiveQuery(() => db.products.toArray()) ?? [];
  const activeList = useLiveQuery(() => (settings.activeListId ? db.lists.get(settings.activeListId) : undefined), [settings.activeListId]);

  const [useAi, setUseAi] = useState(false);
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<Blob | undefined>();
  const [preview, setPreview] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string | undefined>();
  const [source, setSource] = useState<'ocr' | 'ai' | 'manual'>('manual');
  const [storeId, setStoreId] = useState<number | undefined>();
  const [date, setDate] = useState(toDateInput(Date.now()));
  const [totalText, setTotalText] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => setUseAi(isAiAvailable(settings.apiKey, settings.ocrMode)), [settings.apiKey, settings.ocrMode]);
  useEffect(() => {
    if (storeId === undefined && activeList?.storeId) setStoreId(activeList.storeId);
  }, [activeList?.storeId, storeId]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const toLines = async (parsed: Array<ParsedReceiptLine & { category?: CategoryId; matchedProductId?: number | null }>): Promise<Line[]> => {
    const candidates = products.map((p) => ({ id: p.id!, name: p.name, brand: p.brand, aliases: p.aliases }));
    const result: Line[] = [];
    for (const item of parsed) {
      let allocation: Line['allocation'];
      let category = item.category;
      if (item.kind === 'item') {
        const aiMatch = item.matchedProductId && products.find((p) => p.id === item.matchedProductId);
        const match = aiMatch ? { id: aiMatch.id! } : findBestMatch(item.name, candidates);
        allocation = match ? match.id : 'new';
        const product = match ? products.find((p) => p.id === match.id) : undefined;
        category = product?.category ?? category ?? (await classify(item.name));
      } else {
        category = category ?? 'getraenke';
      }
      result.push({
        key: lineKey++,
        rawName: item.name,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        priceText: priceText(item.totalPrice),
        kind: item.kind,
        category: category ?? 'sonstiges',
        allocation,
      });
    }
    return result;
  };

  const handlePhoto = async (file: File) => {
    setError(null);
    setPreview(URL.createObjectURL(file));
    setImage(await resizeImage(file, 1600, 0.8));
    setStep({ kind: 'busy', progress: 0.05, status: useAi ? 'KI liest den Bon …' : 'Texterkennung startet …' });
    try {
      if (useAi && settings.apiKey) {
        const { extractReceiptWithAi } = await import('../services/ai');
        const r = await extractReceiptWithAi(settings.apiKey, file, products.filter((p) => p.id).map((p) => ({ id: p.id!, name: p.name, brand: p.brand, aliases: p.aliases })));
        const store = findStore(stores, null, r.store);
        if (store) setStoreId(store.id);
        if (r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) setDate(r.date);
        if (r.total !== null) setTotalText(priceText(r.total));
        setLines(await toLines(r.items.map((i) => ({ ...i, matchedProductId: i.matchedProductId }))));
        setSource('ai');
      } else {
        const { recognizeText } = await import('../services/ocr');
        const text = await recognizeText(file, 'receipt', (progress, status) => setStep({ kind: 'busy', progress, status }));
        const r = parseReceiptText(text);
        setRawText(text);
        const store = findStore(stores, r.chain);
        if (store) setStoreId(store.id);
        if (r.date) setDate(toDateInput(r.date));
        if (r.total !== null) setTotalText(priceText(r.total));
        setLines(await toLines(r.items));
        setSource('ocr');
      }
      setStep({ kind: 'review' });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep({ kind: 'pick' });
    }
  };

  const startManual = () => {
    setSource('manual');
    setLines([newLine()]);
    setStep({ kind: 'review' });
  };

  const newLine = (): Line => ({
    key: lineKey++,
    rawName: '',
    quantity: 1,
    unit: 'stk',
    unitPrice: 0,
    totalPrice: 0,
    priceText: '',
    kind: 'item',
    category: 'sonstiges',
    allocation: 'new',
  });

  const update = (key: number, changes: Partial<Line>) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...changes };
        if (changes.priceText !== undefined || changes.quantity !== undefined) {
          const total = parseDecimal(next.priceText);
          next.totalPrice = Number.isFinite(total) ? total : 0;
          next.unitPrice = next.quantity > 0 ? round2(next.totalPrice / next.quantity) : next.totalPrice;
        }
        return next;
      }),
    );

  const changeName = async (line: Line, rawName: string) => {
    update(line.key, { rawName });
  };

  const finishName = async (line: Line) => {
    if (line.allocation !== 'new' || !line.rawName.trim()) return;
    const match = findBestMatch(line.rawName, products.map((p) => ({ id: p.id!, name: p.name, brand: p.brand, aliases: p.aliases })));
    if (match) {
      const p = products.find((x) => x.id === match.id);
      update(line.key, { allocation: match.id, category: p?.category ?? line.category });
    } else if (line.category === 'sonstiges') {
      update(line.key, { category: await classify(line.rawName) });
    }
  };

  const valid = lines.filter((l) => l.rawName.trim() && l.totalPrice !== 0);
  const sum = sumItems(valid);
  const total = totalText.trim() ? parseDecimal(totalText) : sum;
  const diff = Number.isFinite(total) ? round2(total - sum) : 0;
  const store = stores.find((s) => s.id === storeId);

  const save = async () => {
    if (valid.length === 0) return;
    setSaving(true);
    try {
      const id = await saveReceipt({
        storeId,
        storeName: store?.name ?? 'Unbekannter Markt',
        date: fromDateInput(date),
        total: Number.isFinite(total) ? total : sum,
        image,
        rawText,
        source,
        lines: valid.map(({ key: _k, priceText: _p, ...rest }) => ({ ...rest, rawName: rest.rawName.trim() })),
      });
      const created = valid.filter((l) => l.kind === 'item' && l.allocation === 'new').length;
      ui.toast(`Bon gespeichert${created ? ` · ${created} neue Produkte` : ''}`);
      navigate(`/receipts/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <>
      <header className="topbar">
        <button className="icon-btn back" aria-label="Zurück" onClick={() => goBack('/expenses')}>
          <ArrowLeft size={22} />
        </button>
        <h1>Kassenbon erfassen</h1>
      </header>
      <div className="page">
        {error && <div className="notice error">{error}</div>}

        {step.kind === 'pick' && (
          <div className="card card-pad stack">
            <p className="small text-2" style={{ margin: 0 }}>
              Fotografiere den Bon möglichst gerade und vollständig bei gutem Licht. Lange Bons gehen auch in mehreren Fotos – erfasse dann einfach
              mehrere Bons.
            </p>
            <PhotoPicker onPick={handlePhoto} cameraLabel="Bon fotografieren" />
            {settings.apiKey ? (
              <label className="row small" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
                <Sparkles size={16} /> KI-Erkennung (genauer, ordnet Produkte automatisch zu)
              </label>
            ) : (
              <div className="notice small">
                Offline-Texterkennung aktiv. Mit der KI-Erkennung (unter <a href="#/settings">Mehr</a>) werden Bons deutlich zuverlässiger gelesen.
              </div>
            )}
            <button className="btn ghost" onClick={startManual}>
              Ohne Foto manuell erfassen
            </button>
          </div>
        )}

        {step.kind === 'busy' && (
          <div className="card card-pad stack">
            {preview && <img className="photo-preview" src={preview} alt="Kassenbon" />}
            <div className="row">
              <Loader2 className="spin" size={20} /> {step.status}
            </div>
            <Progress value={step.progress} />
          </div>
        )}

        {step.kind === 'review' && (
          <>
            {preview && (
              <details className="card card-pad">
                <summary className="small text-2">Foto anzeigen</summary>
                <img className="photo-preview" style={{ maxHeight: 'none', marginTop: 10 }} src={preview} alt="Kassenbon" />
              </details>
            )}

            <div className="card card-pad stack">
              <label className="field">
                Markt
                <select className="select" value={storeId ?? ''} onChange={(e) => setStoreId(e.target.value ? Number(e.target.value) : undefined)}>
                  <option value="">Unbekannter Markt</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.location ? ` · ${s.location}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid-2">
                <label className="field">
                  Datum
                  <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label className="field">
                  Summe laut Bon (€)
                  <input className="input" inputMode="decimal" value={totalText} placeholder={priceText(sum)} onChange={(e) => setTotalText(e.target.value)} />
                </label>
              </div>
              {valid.length > 0 &&
                (Math.abs(diff) < 0.01 ? (
                  <div className="notice ok small">
                    <CheckCircle2 size={18} /> Positionen ergeben {formatEuro(sum)} – passt zur Bon-Summe.
                  </div>
                ) : (
                  <div className="notice warn small">
                    <TriangleAlert size={18} style={{ flex: 'none' }} />
                    <span>
                      Positionen ergeben {formatEuro(sum)}, Bon-Summe {formatEuro(total)} (Differenz {formatEuro(diff)}). Bitte Positionen prüfen.
                    </span>
                  </div>
                ))}
            </div>

            <div className="section-title">
              Positionen ({valid.length})<span className="spacer" />
              <span className="tiny" style={{ textTransform: 'none', letterSpacing: 0 }}>
                Name · Menge · Betrag
              </span>
            </div>
            <div className="card">
              {lines.map((l) => (
                <LineEditor
                  key={l.key}
                  line={l}
                  products={products}
                  onName={(v) => changeName(l, v)}
                  onBlurName={() => finishName(l)}
                  onChange={(c) => update(l.key, c)}
                  onRemove={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                />
              ))}
              {lines.length === 0 && <div className="card-pad small muted">Keine Positionen erkannt – füge sie manuell hinzu.</div>}
            </div>
            <button className="btn soft" onClick={() => setLines((ls) => [...ls, newLine()])}>
              <Plus size={18} /> Position hinzufügen
            </button>

            {rawText && (
              <details className="small muted">
                <summary>Erkannter Rohtext</summary>
                <pre style={{ whiteSpace: 'pre-wrap' }}>{rawText}</pre>
              </details>
            )}

            <button className="btn primary block" disabled={valid.length === 0 || saving} onClick={save}>
              {saving ? <Loader2 className="spin" size={18} /> : null} Bon speichern ({formatEuro(Number.isFinite(total) ? total : sum)})
            </button>
          </>
        )}
      </div>
    </>
  );
}

function LineEditor({
  line,
  products,
  onName,
  onBlurName,
  onChange,
  onRemove,
}: {
  line: Line;
  products: Product[];
  onName: (v: string) => void;
  onBlurName: () => void;
  onChange: (c: Partial<Line>) => void;
  onRemove: () => void;
}) {
  // Beste Kandidaten oben, danach alle Produkte alphabetisch.
  const options = useMemo(() => {
    const ranked = products
      .map((p) => ({ p, score: line.rawName ? nameSimilarity(line.rawName, p.name) : 0 }))
      .sort((a, b) => b.score - a.score);
    const top = ranked.filter((r) => r.score >= 0.35).slice(0, 5).map((r) => r.p);
    const rest = products.filter((p) => !top.includes(p)).sort((a, b) => a.name.localeCompare(b.name, 'de'));
    return { top, rest };
  }, [products, line.rawName]);

  const allocationValue = line.allocation === undefined ? '' : String(line.allocation);
  const isDeposit = line.kind === 'deposit';

  return (
    <div className="line-edit">
      <div className="stack" style={{ gap: 6, minWidth: 0 }}>
        <div className="inputs">
          <input className="input" value={line.rawName} placeholder="Artikel" onChange={(e) => onName(e.target.value)} onBlur={onBlurName} aria-label="Bezeichnung" />
          <input
            className="input num"
            inputMode="decimal"
            value={String(line.quantity).replace('.', ',')}
            onChange={(e) => {
              const q = parseDecimal(e.target.value);
              onChange({ quantity: Number.isFinite(q) && q > 0 ? q : 1 });
            }}
            aria-label={line.unit === 'kg' ? 'Gewicht in kg' : 'Menge'}
            title={line.unit === 'kg' ? 'kg' : 'Stück'}
          />
          <input className="input num" inputMode="decimal" value={line.priceText} placeholder="0,00" onChange={(e) => onChange({ priceText: e.target.value })} aria-label="Betrag in Euro" />
        </div>
        {isDeposit ? (
          <div className="row small muted">
            <span className="badge">Pfand</span>
            <span className="grow">zählt nicht als Produkt</span>
            <button className="btn ghost small" onClick={() => onChange({ kind: 'item', allocation: 'new' })}>
              Ist ein Artikel
            </button>
          </div>
        ) : (
          <div className="selects">
            <select
              className="select"
              value={allocationValue}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'new') onChange({ allocation: 'new' });
                else if (v === '') onChange({ allocation: undefined });
                else if (v === 'deposit') onChange({ kind: 'deposit', allocation: undefined });
                else {
                  const p = products.find((x) => x.id === Number(v));
                  onChange({ allocation: Number(v), category: p?.category ?? line.category });
                }
              }}
              aria-label="Produkt zuordnen"
            >
              <option value="new">＋ Neues Produkt</option>
              <option value="">— nicht zuordnen</option>
              <option value="deposit">Pfand / Leergut</option>
              {options.top.length > 0 && (
                <optgroup label="Passende Produkte">
                  {options.top.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.brand ? ` (${p.brand})` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              {options.rest.length > 0 && (
                <optgroup label="Alle Produkte">
                  {options.rest.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.brand ? ` (${p.brand})` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <CategorySelect value={line.category} onChange={(category) => onChange({ category })} />
          </div>
        )}
        {line.unit === 'kg' && (
          <div className="tiny muted">
            {String(line.quantity).replace('.', ',')} kg × {formatEuro(line.unitPrice)}/kg
          </div>
        )}
      </div>
      <button className="icon-btn" onClick={onRemove} aria-label="Position entfernen" style={{ alignSelf: 'flex-start' }}>
        <Trash2 size={18} />
      </button>
    </div>
  );
}
