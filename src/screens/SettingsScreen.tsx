import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Download, KeyRound, Loader2, Plus, RefreshCw, ShieldCheck, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { db } from '../db/db';
import { addStore, exportBackup, importBackup, resetAll, setSetting, type OcrMode } from '../db/repo';
import { CHAIN_IDS, CHAINS, type ChainId } from '../domain/stores';
import { useSettings, useStores } from '../hooks/data';
import { navigate } from '../hooks/useRoute';
import { useUi } from '../ui';

export function SettingsScreen() {
  const ui = useUi();
  const settings = useSettings();
  const stores = useStores();
  const counts = useLiveQuery(async () => ({
    products: await db.products.count(),
    receipts: await db.receipts.count(),
    items: await db.items.count(),
  }));
  const [chain, setChain] = useState<ChainId>('lidl');
  const [storeName, setStoreName] = useState('');
  const [storeLocation, setStoreLocation] = useState('');
  const [key, setKey] = useState('');
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyMessage, setKeyMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [updateBusy, setUpdateBusy] = useState(false);

  const checkForUpdate = async () => {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (!registration) {
      ui.toast('Updates werden nur in der installierten Web-App geprüft.');
      return;
    }
    setUpdateBusy(true);
    try {
      await registration.update();
      // Ein gefundenes Update wird installiert und lädt die App anschließend selbst neu.
      if (registration.installing || registration.waiting) ui.toast('Update gefunden – die App startet gleich neu');
      else ui.toast(`Du hast die neueste Version (${__APP_VERSION__})`);
    } catch {
      ui.toast('Update-Prüfung fehlgeschlagen – bist du online?');
    } finally {
      setUpdateBusy(false);
    }
  };

  const saveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) return;
    setKeyBusy(true);
    setKeyMessage(null);
    try {
      const { testApiKey } = await import('../services/ai');
      await testApiKey(trimmed);
      await setSetting('apiKey', trimmed);
      setKey('');
      setKeyMessage({ ok: true, text: 'Schlüssel funktioniert und ist gespeichert.' });
    } catch (err) {
      setKeyMessage({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setKeyBusy(false);
    }
  };

  const download = async () => {
    const blob = await exportBackup();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `adsimobuy-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <header className="topbar">
        <h1>Mehr</h1>
      </header>
      <div className="page">
        <div className="section-title">Märkte & Laufwege</div>
        <div className="card">
          {stores.map((s) => (
            <a key={s.id} className="list-row" href={`#/stores/${s.id}`}>
              <span className="store-dot" style={{ background: CHAINS[s.chain].color }} />
              <div className="grow">
                <div className="item-name">{s.name}</div>
                <div className="tiny muted">{[s.location, s.name !== CHAINS[s.chain].label ? CHAINS[s.chain].label : null, 'Laufweg anpassen'].filter(Boolean).join(' · ')}</div>
              </div>
              <ChevronRight size={18} className="muted" />
            </a>
          ))}
        </div>
        <form
          className="card card-pad stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const id = await addStore(chain, storeName || CHAINS[chain].label, storeLocation);
            setStoreName('');
            setStoreLocation('');
            ui.toast('Markt hinzugefügt');
            navigate(`/stores/${id}`);
          }}
        >
          <strong>Markt hinzufügen</strong>
          <div className="grid-2">
            <label className="field">
              Kette (Laufweg-Vorlage)
              <select className="select" value={chain} onChange={(e) => setChain(e.target.value as ChainId)}>
                {CHAIN_IDS.map((c) => (
                  <option key={c} value={c}>
                    {CHAINS[c].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Filiale / Ort
              <input className="input" value={storeLocation} placeholder="optional" onChange={(e) => setStoreLocation(e.target.value)} />
            </label>
          </div>
          <label className="field">
            Name
            <input className="input" value={storeName} placeholder={CHAINS[chain].label} onChange={(e) => setStoreName(e.target.value)} />
          </label>
          <button className="btn soft" type="submit">
            <Plus size={18} /> Hinzufügen
          </button>
        </form>

        <div className="section-title">Texterkennung (Zettel & Bons)</div>
        <div className="card card-pad stack">
          <div className="stack" style={{ gap: 8 }} role="radiogroup" aria-label="Erkennungsmodus">
            {(
              [
                ['auto', 'Automatisch', 'KI, wenn ein Schlüssel hinterlegt ist – sonst offline'],
                ['ocr', 'Immer offline', 'Tesseract-Texterkennung direkt auf dem Gerät, kostenlos'],
                ['ai', 'Immer KI', 'Claude liest auch Handschrift und ordnet Bon-Positionen zu'],
              ] as Array<[OcrMode, string, string]>
            ).map(([value, label, hint]) => (
              <label key={value} className="row" style={{ cursor: 'pointer', alignItems: 'flex-start' }}>
                <input type="radio" name="ocrMode" checked={settings.ocrMode === value} onChange={() => setSetting('ocrMode', value)} style={{ marginTop: 4 }} />
                <span>
                  <strong>{label}</strong>
                  <div className="small muted">{hint}</div>
                </span>
              </label>
            ))}
          </div>
          <hr className="divider" />
          {settings.apiKey ? (
            <div className="row">
              <ShieldCheck size={20} className="muted" />
              <span className="grow small">
                Anthropic-API-Schlüssel hinterlegt (…{settings.apiKey.slice(-4)})
              </span>
              <button className="btn small danger" onClick={() => setSetting('apiKey', undefined)}>
                Entfernen
              </button>
            </div>
          ) : (
            <form className="stack" onSubmit={saveKey}>
              <label className="field">
                Anthropic-API-Schlüssel für die KI-Erkennung (optional)
                <div className="row">
                  <input
                    className="input grow"
                    type="password"
                    autoComplete="off"
                    placeholder="sk-ant-…"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                  />
                  <button className="btn primary" type="submit" disabled={!key.trim() || keyBusy}>
                    {keyBusy ? <Loader2 className="spin" size={18} /> : <KeyRound size={18} />} Prüfen
                  </button>
                </div>
              </label>
            </form>
          )}
          {keyMessage && <div className={`notice small ${keyMessage.ok ? 'ok' : 'error'}`}>{keyMessage.text}</div>}
          <div className="tiny muted">
            Der Schlüssel bleibt nur auf diesem Gerät. Bei KI-Erkennung wird das Foto (und für Bons die Liste deiner Produktnamen) direkt an die
            Anthropic-API gesendet; dafür fallen API-Kosten über dein Anthropic-Konto an. Schlüssel gibt es unter console.anthropic.com.
          </div>
        </div>

        <div className="section-title">Daten</div>
        <div className="card card-pad stack">
          <div className="small text-2">
            Alles wird lokal auf diesem Gerät gespeichert: {counts?.products ?? 0} Produkte, {counts?.receipts ?? 0} Bons, {counts?.items ?? 0}{' '}
            Listeneinträge. Sichere regelmäßig, um nichts zu verlieren.
          </div>
          <div className="grid-2">
            <button className="btn" onClick={download}>
              <Download size={18} /> Sichern
            </button>
            <button className="btn" onClick={() => importRef.current?.click()}>
              <Upload size={18} /> Wiederherstellen
            </button>
          </div>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              if (!confirm('Aktuelle Daten durch die Sicherung ersetzen?')) return;
              try {
                await importBackup(file);
                ui.toast('Sicherung wiederhergestellt');
              } catch (err) {
                ui.toast(err instanceof Error ? err.message : 'Import fehlgeschlagen');
              }
            }}
          />
          <button
            className="btn danger"
            onClick={async () => {
              if (!confirm('Wirklich ALLE Daten (Listen, Produkte, Bons) löschen?')) return;
              await resetAll();
              ui.toast('Alle Daten gelöscht');
            }}
          >
            Alles zurücksetzen
          </button>
          <div className="tiny muted">Die Sicherung enthält keine Bon-Fotos und keinen API-Schlüssel.</div>
        </div>

        <div className="section-title">Über</div>
        <div className="card card-pad small text-2 stack" style={{ gap: 6 }}>
          <div className="row">
            <span className="grow">
              <strong>AdsimoBuy</strong> · Version {__APP_VERSION__}
            </span>
            <button className="btn small" onClick={checkForUpdate} disabled={updateBusy}>
              {updateBusy ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />} Nach Update suchen
            </button>
          </div>
          <div>
            Tipp: Über „Zum Startbildschirm hinzufügen“ im Browser-Menü wird AdsimoBuy wie eine App installiert und funktioniert auch offline.
          </div>
          <div>
            Produkt- und Nährwertdaten von <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a> (ODbL).
            Standard-Laufwege sind typische Anordnungen – passe sie an deine Filiale an.
          </div>
        </div>
      </div>
    </>
  );
}
