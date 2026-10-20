import { ListChecks, Package, ScanLine, Settings2, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ensureSeed } from './db/repo';
import { useRoute } from './hooks/useRoute';
import { ExpensesScreen } from './screens/ExpensesScreen';
import { ListScreen } from './screens/ListScreen';
import { ProductDetail } from './screens/ProductDetail';
import { ProductForm } from './screens/ProductForm';
import { ProductsScreen } from './screens/ProductsScreen';
import { ReceiptCapture } from './screens/ReceiptCapture';
import { ReceiptDetail } from './screens/ReceiptDetail';
import { SettingsScreen } from './screens/SettingsScreen';
import { StoreEditor } from './screens/StoreEditor';
import { UiProvider, useUi } from './ui';

function Screen({ route }: { route: string[] }) {
  const [section, a, b] = route;
  const num = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : undefined);

  switch (section) {
    case 'products':
      if (a === 'new') return <ProductForm key={`new-${b ?? ''}`} barcode={b} />;
      if (num(a) && b === 'edit') return <ProductForm key={`edit-${a}`} id={num(a)} />;
      if (num(a)) return <ProductDetail key={a} id={num(a)!} />;
      return <ProductsScreen />;
    case 'expenses':
      return <ExpensesScreen />;
    case 'receipts':
      if (a === 'new') return <ReceiptCapture />;
      if (num(a)) return <ReceiptDetail key={a} id={num(a)!} />;
      return <ExpensesScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'stores':
      if (num(a)) return <StoreEditor key={a} id={num(a)!} />;
      return <SettingsScreen />;
    default:
      return <ListScreen />;
  }
}

function Nav({ section }: { section: string }) {
  const ui = useUi();
  const tab = (href: string, label: string, icon: React.ReactNode, active: boolean) => (
    <a href={href} aria-current={active ? 'page' : undefined}>
      {icon}
      {label}
    </a>
  );
  return (
    <nav className="nav" aria-label="Hauptnavigation">
      <div className="nav-inner">
        {tab('#/list', 'Liste', <ListChecks size={24} />, section === 'list' || section === '')}
        {tab('#/products', 'Produkte', <Package size={24} />, section === 'products')}
        <button className="scan-fab" onClick={ui.openScanMenu} aria-label="Erfassen: Foto, Barcode oder Kassenbon">
          <ScanLine size={28} />
        </button>
        {tab('#/expenses', 'Ausgaben', <Wallet size={24} />, section === 'expenses' || section === 'receipts')}
        {tab('#/settings', 'Mehr', <Settings2 size={24} />, section === 'settings' || section === 'stores')}
      </div>
    </nav>
  );
}

export function App() {
  const route = useRoute();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureSeed()
      .then(() => setReady(true))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (error) {
    return (
      <div className="page" style={{ paddingTop: 40 }}>
        <div className="notice error">Die lokale Datenbank konnte nicht geöffnet werden: {error}</div>
      </div>
    );
  }
  if (!ready) return null;

  return (
    <UiProvider>
      <div className="app">
        <Screen route={route} />
      </div>
      <Nav section={route[0] ?? ''} />
    </UiProvider>
  );
}
