import { useEffect, useState } from 'react';

function current(): string[] {
  return window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
}

/** Minimaler Hash-Router: "#/products/12" -> ["products", "12"]. Funktioniert auch auf statischem Hosting. */
export function useRoute(): string[] {
  const [route, setRoute] = useState(current);
  useEffect(() => {
    const onChange = () => {
      setRoute(current());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(path: string): void {
  window.location.hash = path.startsWith('/') ? path : `/${path}`;
}

export function goBack(fallback: string): void {
  if (window.history.length > 1) window.history.back();
  else navigate(fallback);
}
