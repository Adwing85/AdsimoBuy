import { Loader2, Sparkles, Type } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { addItems, classify, type OcrMode } from '../db/repo';
import type { CategoryId } from '../domain/categories';
import { parseListText } from '../domain/parseListText';
import { CategorySelect, Progress, Sheet } from './common';
import { PhotoPicker } from './PhotoPicker';

interface Entry {
  key: number;
  include: boolean;
  name: string;
  quantity: string;
  category: CategoryId;
}

type Step = { kind: 'pick' } | { kind: 'text' } | { kind: 'busy'; progress: number; status: string } | { kind: 'review' };

export function isAiAvailable(apiKey: string | undefined, mode: OcrMode): boolean {
  return Boolean(apiKey) && mode !== 'ocr';
}

/** Einkaufszettel abfotografieren oder Text einfügen → Einträge prüfen → zur Liste. */
export function PhotoImport({
  listId,
  apiKey,
  ocrMode,
  onClose,
  onDone,
}: {
  listId: number;
  apiKey?: string;
  ocrMode: OcrMode;
  onClose: () => void;
  onDone: (added: number) => void;
}) {
  const [useAi, setUseAi] = useState(isAiAvailable(apiKey, ocrMode));
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [entries, setEntries] = useState<Entry[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [ocrText, setOcrText] = useState('');

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const fromParsed = async (items: Array<{ name: string; quantity?: string; category?: CategoryId }>) => {
    const list: Entry[] = [];
    for (const [i, item] of items.entries()) {
      list.push({
        key: i,
        include: true,
        name: item.name,
        quantity: item.quantity ?? '',
        category: item.category ?? (await classify(item.name)),
      });
    }
    setEntries(list);
    setStep({ kind: 'review' });
  };

  const handlePhoto = async (file: File) => {
    setError(null);
    setOcrText('');
    setPreview(URL.createObjectURL(file));
    setStep({ kind: 'busy', progress: 0.05, status: useAi ? 'KI liest den Zettel …' : 'Texterkennung startet …' });
    try {
      if (useAi && apiKey) {
        const { extractListWithAi } = await import('../services/ai');
        const result = await extractListWithAi(apiKey, file);
        await fromParsed(result.items.map((i) => ({ name: i.name, quantity: i.quantity ?? undefined, category: i.category })));
      } else {
        const { recognizeText } = await import('../services/ocr');
        const raw = await recognizeText(file, 'list', (progress, status) => setStep({ kind: 'busy', progress, status }));
        setOcrText(raw);
        await fromParsed(parseListText(raw));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep({ kind: 'pick' });
    }
  };

  const selected = useMemo(() => entries.filter((e) => e.include && e.name.trim()), [entries]);

  const save = async () => {
    const added = await addItems(
      listId,
      selected.map((e) => ({ name: e.name, quantity: e.quantity || undefined, category: e.category, source: 'photo' as const })),
    );
    onDone(added);
  };

  const update = (key: number, changes: Partial<Entry>) =>
    setEntries((list) => list.map((e) => (e.key === key ? { ...e, ...changes } : e)));

  return (
    <Sheet title="Einkaufszettel importieren" onClose={onClose}>
      <div className="stack">
        {step.kind === 'pick' && (
          <>
            <p className="small text-2" style={{ margin: 0 }}>
              Fotografiere einen Zettel (auch handschriftlich), einen Screenshot oder eine Notiz. Die Artikel werden erkannt, einsortiert und
              du kannst sie vor dem Übernehmen prüfen.
            </p>
            {error && <div className="notice error">{error}</div>}
            <PhotoPicker onPick={handlePhoto} cameraLabel="Zettel fotografieren" />
            {apiKey && (
              <label className="row small" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
                <Sparkles size={16} /> KI-Erkennung (besser bei Handschrift)
              </label>
            )}
            {!apiKey && (
              <div className="notice small">
                Offline-Texterkennung aktiv. Für Handschrift empfiehlt sich die KI-Erkennung – einrichten unter <a href="#/settings">Mehr → Texterkennung</a>.
              </div>
            )}
            <button className="btn ghost" onClick={() => setStep({ kind: 'text' })}>
              <Type size={18} /> Stattdessen Text einfügen
            </button>
          </>
        )}

        {step.kind === 'text' && (
          <>
            <textarea
              className="input"
              placeholder={'z. B. aus WhatsApp kopiert:\n2x Milch\nBrot, Eier, Äpfel\n500 g Hackfleisch'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
            <div className="grid-2">
              <button className="btn" onClick={() => setStep({ kind: 'pick' })}>
                Zurück
              </button>
              <button className="btn primary" disabled={!text.trim()} onClick={() => fromParsed(parseListText(text))}>
                Erkennen
              </button>
            </div>
          </>
        )}

        {step.kind === 'busy' && (
          <div className="stack" style={{ padding: '12px 0' }}>
            {preview && <img className="photo-preview" src={preview} alt="Aufgenommener Zettel" />}
            <div className="row">
              <Loader2 className="spin" size={20} />
              <span>{step.status}</span>
            </div>
            <Progress value={step.progress} />
          </div>
        )}

        {step.kind === 'review' && (
          <>
            {preview && <img className="photo-preview" src={preview} alt="Aufgenommener Zettel" />}
            {entries.length === 0 ? (
              <div className="notice warn">
                Es wurden keine Artikel erkannt. Versuche ein schärferes Foto mit gutem Licht{apiKey ? ' oder die KI-Erkennung' : ''}.
              </div>
            ) : (
              <div className="card">
                {entries.map((e) => (
                  <div key={e.key} className={`line-edit${e.include ? '' : ' off'}`}>
                    <div className="stack" style={{ gap: 6 }}>
                      <div className="row" style={{ gap: 6 }}>
                        <input
                          className="input grow"
                          value={e.name}
                          onChange={(ev) => update(e.key, { name: ev.target.value })}
                          aria-label="Artikel"
                        />
                        <input
                          className="input"
                          style={{ width: 84 }}
                          value={e.quantity}
                          placeholder="Menge"
                          onChange={(ev) => update(e.key, { quantity: ev.target.value })}
                          aria-label="Menge"
                        />
                      </div>
                      <CategorySelect value={e.category} onChange={(c) => update(e.key, { category: c })} />
                    </div>
                    <input
                      type="checkbox"
                      checked={e.include}
                      onChange={(ev) => update(e.key, { include: ev.target.checked })}
                      aria-label={`${e.name} übernehmen`}
                      style={{ width: 22, height: 22, alignSelf: 'center' }}
                    />
                  </div>
                ))}
              </div>
            )}
            {ocrText && (
              <details className="small muted">
                <summary>Erkannter Rohtext</summary>
                <pre style={{ whiteSpace: 'pre-wrap' }}>{ocrText}</pre>
              </details>
            )}
            <div className="grid-2">
              <button className="btn" onClick={() => setStep({ kind: preview ? 'pick' : 'text' })}>
                {preview ? 'Neues Foto' : 'Zurück'}
              </button>
              <button className="btn primary" disabled={selected.length === 0} onClick={save}>
                {selected.length} übernehmen
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
