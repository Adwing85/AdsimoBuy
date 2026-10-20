import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import './styles.css';

registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    // Vom Home-Bildschirm gestartete Apps laden beim Zurückwechseln nicht neu (v. a. iOS).
    // Deshalb aktiv nach Updates suchen; ein neues Update lädt die Seite dann automatisch neu.
    const check = () => {
      if (navigator.onLine) registration.update().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
    setInterval(check, 30 * 60 * 1000);
  },
});

// Persistenten Speicher anfragen, damit der Browser die lokale Datenbank nicht automatisch räumt.
navigator.storage?.persist?.().catch(() => undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
