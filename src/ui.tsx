import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Barcode, Camera, ReceiptText } from 'lucide-react';
import { BarcodeScanner, type ScannerMode } from './components/BarcodeScanner';
import { Sheet } from './components/common';
import { PhotoImport } from './components/PhotoImport';
import { useSettings } from './hooks/data';
import { navigate } from './hooks/useRoute';

interface ToastAction {
  label: string;
  run: () => void;
}

interface Ui {
  toast(message: string, action?: ToastAction): void;
  openScanMenu(): void;
  openScanner(mode: ScannerMode): void;
  openPhotoImport(): void;
}

const UiContext = createContext<Ui | null>(null);

export function useUi(): Ui {
  const ui = useContext(UiContext);
  if (!ui) throw new Error('UiProvider fehlt');
  return ui;
}

type Overlay = { kind: 'none' } | { kind: 'menu' } | { kind: 'scanner'; mode: ScannerMode } | { kind: 'photo' };

export function UiProvider({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const [overlay, setOverlay] = useState<Overlay>({ kind: 'none' });
  const [toast, setToast] = useState<{ message: string; action?: ToastAction; id: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const showToast = useCallback((message: string, action?: ToastAction) => {
    window.clearTimeout(timer.current);
    setToast({ message, action, id: Date.now() });
    timer.current = window.setTimeout(() => setToast(null), action ? 5000 : 2800);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const ui = useMemo<Ui>(
    () => ({
      toast: showToast,
      openScanMenu: () => setOverlay({ kind: 'menu' }),
      openScanner: (mode) => setOverlay({ kind: 'scanner', mode }),
      openPhotoImport: () => setOverlay({ kind: 'photo' }),
    }),
    [showToast],
  );

  const close = useCallback(() => setOverlay({ kind: 'none' }), []);
  const listId = settings.activeListId;

  return (
    <UiContext.Provider value={ui}>
      {children}

      {overlay.kind === 'menu' && (
        <Sheet title="Erfassen" onClose={close}>
          <div className="action-list">
            <button className="action" onClick={() => setOverlay({ kind: 'photo' })} disabled={!listId}>
              <span className="action-icon">
                <Camera size={22} />
              </span>
              <div>
                <strong>Einkaufszettel fotografieren</strong>
                <span>Zettel, Notiz oder Screenshot → Liste</span>
              </div>
            </button>
            <button className="action" onClick={() => setOverlay({ kind: 'scanner', mode: 'list' })}>
              <span className="action-icon">
                <Barcode size={22} />
              </span>
              <div>
                <strong>Barcode scannen</strong>
                <span>Produkt mit Nährwerten speichern & auf die Liste setzen</span>
              </div>
            </button>
            <button
              className="action"
              onClick={() => {
                close();
                navigate('/receipts/new');
              }}
            >
              <span className="action-icon">
                <ReceiptText size={22} />
              </span>
              <div>
                <strong>Kassenbon erfassen</strong>
                <span>Ausgaben tracken & Preise den Produkten zuordnen</span>
              </div>
            </button>
          </div>
        </Sheet>
      )}

      {overlay.kind === 'scanner' && (
        <BarcodeScanner mode={overlay.mode} listId={listId} onClose={close} onToast={showToast} />
      )}

      {overlay.kind === 'photo' && listId && (
        <PhotoImport
          listId={listId}
          apiKey={settings.apiKey}
          ocrMode={settings.ocrMode}
          onClose={close}
          onDone={(added) => {
            close();
            navigate('/list');
            showToast(added ? `${added} Artikel hinzugefügt` : 'Alles stand schon auf der Liste');
          }}
        />
      )}

      {toast && (
        <div className="toast" role="status" key={toast.id}>
          <span>{toast.message}</span>
          {toast.action && (
            <button
              onClick={() => {
                toast.action?.run();
                setToast(null);
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </UiContext.Provider>
  );
}
