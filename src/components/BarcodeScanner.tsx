import { useLiveQuery } from 'dexie-react-hooks';
import { Flashlight, FlashlightOff, ImagePlus, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '../db/db';
import { addItems, upsertFromOff } from '../db/repo';
import type { Product } from '../db/types';
import { CATEGORIES } from '../domain/categories';
import { formatNumber } from '../format';
import { navigate } from '../hooks/useRoute';
import { decodeBarcodeFromImage, isValidGtin, startScanner, type ScannerHandle } from '../services/barcode';
import { fetchProductByBarcode } from '../services/openFoodFacts';
import { NutriScore, ProductThumb } from './common';

export type ScannerMode = 'list' | 'product';

type Lookup =
  | { state: 'idle' }
  | { state: 'loading'; code: string }
  | { state: 'found'; code: string; product: Product }
  | { state: 'unknown'; code: string }
  | { state: 'error'; code: string; message: string };

export function BarcodeScanner({
  mode,
  listId,
  onClose,
  onToast,
}: {
  mode: ScannerMode;
  listId?: number;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const handleRef = useRef<ScannerHandle | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torch, setTorch] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [manual, setManual] = useState('');
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' });
  const [scanning, setScanning] = useState(true);
  const list = useLiveQuery(() => (listId ? db.lists.get(listId) : undefined), [listId]);

  const resolve = useCallback(async (code: string) => {
    setScanning(false);
    navigator.vibrate?.(60);
    setLookup({ state: 'loading', code });
    try {
      const local = await db.products.where('barcode').equals(code).first();
      if (local) {
        setLookup({ state: 'found', code, product: local });
        return;
      }
      const off = await fetchProductByBarcode(code);
      if (!off) {
        setLookup({ state: 'unknown', code });
        return;
      }
      const id = await upsertFromOff(off);
      const product = await db.products.get(id);
      setLookup(product ? { state: 'found', code, product } : { state: 'unknown', code });
    } catch (err) {
      setLookup({
        state: 'error',
        code,
        message: navigator.onLine ? (err instanceof Error ? err.message : String(err)) : 'Offline – Produktdaten können gerade nicht geladen werden.',
      });
    }
  }, []);

  useEffect(() => {
    if (!scanning || !videoRef.current) return;
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Die Kamera ist hier nicht verfügbar (HTTPS erforderlich). Gib den Code manuell ein oder nutze ein Foto.');
      return;
    }
    startScanner(videoRef.current, (code) => {
      if (!cancelled) resolve(code);
    })
      .then((h) => {
        if (cancelled) h.stop();
        else {
          handleRef.current = h;
          setCameraError(null);
          setTorchAvailable(Boolean(h.setTorch));
        }
      })
      .catch((err: unknown) => {
        const name = err instanceof DOMException ? err.name : '';
        setCameraError(
          name === 'NotAllowedError'
            ? 'Kamerazugriff verweigert. Erlaube die Kamera in den Browser-Einstellungen oder gib den Code manuell ein.'
            : 'Kamera konnte nicht gestartet werden. Gib den Code manuell ein oder nutze ein Foto.',
        );
      });
    return () => {
      cancelled = true;
      handleRef.current?.stop();
      handleRef.current = null;
      setTorch(false);
    };
  }, [scanning, resolve]);

  const resume = () => {
    setLookup({ state: 'idle' });
    setScanning(true);
  };

  const toggleTorch = async () => {
    const h = handleRef.current;
    if (!h?.setTorch) return;
    await h.setTorch(!torch).catch(() => undefined);
    setTorch(!torch);
  };

  const addToList = async (product: Product) => {
    if (!listId) return;
    const added = await addItems(listId, [{ name: product.name, productId: product.id, category: product.category, source: 'barcode' }]);
    onToast(added ? `„${product.name}“ zur Liste hinzugefügt` : `„${product.name}“ steht schon auf der Liste`);
    resume();
  };

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manual.replace(/\D/g, '');
    if (code.length < 6) return;
    if (!isValidGtin(code)) {
      onToast('Die Prüfziffer passt nicht – bitte Code kontrollieren.');
      return;
    }
    setManual('');
    resolve(code);
  };

  const fromPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const code = await decodeBarcodeFromImage(file);
    if (code) resolve(code);
    else onToast('Kein Barcode auf dem Foto gefunden.');
  };

  const n = lookup.state === 'found' ? lookup.product.nutriments : undefined;

  return (
    <div className="scanner" role="dialog" aria-label="Barcode scannen">
      <video ref={videoRef} muted playsInline />
      {scanning && !cameraError && <div className="scanner-frame" aria-hidden="true" />}

      <div className="scanner-top">
        <button className="icon-btn" onClick={onClose} aria-label="Scanner schließen">
          <X size={22} />
        </button>
        <div className="grow">
          <strong>Barcode scannen</strong>
          <div className="tiny" style={{ opacity: 0.8 }}>
            {mode === 'list' && list ? `Fügt zu „${list.name}“ hinzu` : 'Produkt nachschlagen & speichern'}
          </div>
        </div>
        {torchAvailable && (
          <button className="icon-btn" onClick={toggleTorch} aria-label="Licht umschalten" aria-pressed={torch}>
            {torch ? <FlashlightOff size={20} /> : <Flashlight size={20} />}
          </button>
        )}
      </div>

      <div className="scanner-bottom stack">
        {cameraError && <div className="notice warn">{cameraError}</div>}

        {lookup.state !== 'idle' && (
          <div className="card card-pad" style={{ color: 'var(--text)' }}>
            {lookup.state === 'loading' && (
              <div className="row">
                <Loader2 className="spin" size={20} /> Suche {lookup.code} …
              </div>
            )}
            {lookup.state === 'found' && (
              <div className="stack">
                <div className="row">
                  <ProductThumb imageUrl={lookup.product.imageUrl} category={lookup.product.category} />
                  <div className="grow">
                    <div className="item-name">{lookup.product.name}</div>
                    <div className="small muted ellipsis">
                      {[lookup.product.brand, lookup.product.quantity, CATEGORIES[lookup.product.category].label].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <NutriScore grade={lookup.product.nutriscore} />
                </div>
                {n && (
                  <div className="small text-2">
                    je 100 g: {n.energyKcal !== undefined && `${formatNumber(n.energyKcal)} kcal · `}
                    {n.sugars !== undefined && `Zucker ${formatNumber(n.sugars)} g · `}
                    {n.fat !== undefined && `Fett ${formatNumber(n.fat)} g · `}
                    {n.proteins !== undefined && `Eiweiß ${formatNumber(n.proteins)} g`}
                  </div>
                )}
                <div className="grid-2">
                  {mode === 'list' && listId ? (
                    <button className="btn primary" onClick={() => addToList(lookup.product)}>
                      Zur Liste
                    </button>
                  ) : (
                    <button className="btn primary" onClick={resume}>
                      Weiter scannen
                    </button>
                  )}
                  <button
                    className="btn"
                    onClick={() => {
                      onClose();
                      navigate(`/products/${lookup.product.id}`);
                    }}
                  >
                    Details
                  </button>
                </div>
                {mode === 'list' && (
                  <button className="btn ghost small" onClick={resume}>
                    Abbrechen & weiter scannen
                  </button>
                )}
              </div>
            )}
            {lookup.state === 'unknown' && (
              <div className="stack">
                <div>
                  <strong>Unbekanntes Produkt</strong>
                  <div className="small muted">Der Code {lookup.code} ist nicht in Open Food Facts. Leg es selbst an – es wird lokal gespeichert.</div>
                </div>
                <div className="grid-2">
                  <button
                    className="btn primary"
                    onClick={() => {
                      onClose();
                      navigate(`/products/new/${lookup.code}`);
                    }}
                  >
                    Produkt anlegen
                  </button>
                  <button className="btn" onClick={resume}>
                    Weiter scannen
                  </button>
                </div>
              </div>
            )}
            {lookup.state === 'error' && (
              <div className="stack">
                <div className="notice error">{lookup.message}</div>
                <div className="grid-2">
                  <button className="btn primary" onClick={() => resolve(lookup.code)}>
                    Erneut versuchen
                  </button>
                  <button className="btn" onClick={resume}>
                    Weiter scannen
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <form className="row" onSubmit={submitManual}>
          <input
            className="input grow"
            inputMode="numeric"
            placeholder="Code manuell eingeben"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            aria-label="Barcode manuell eingeben"
          />
          <button className="btn primary" type="submit" disabled={manual.replace(/\D/g, '').length < 6}>
            Suchen
          </button>
          <button type="button" className="icon-btn" onClick={() => galleryRef.current?.click()} aria-label="Barcode aus Foto lesen">
            <ImagePlus size={20} />
          </button>
          <input ref={galleryRef} type="file" accept="image/*" hidden onChange={fromPhoto} />
        </form>
      </div>
    </div>
  );
}
