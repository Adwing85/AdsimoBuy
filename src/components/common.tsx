import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { CATEGORIES, CATEGORY_IDS, type CategoryId } from '../domain/categories';

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function CategorySelect({
  value,
  onChange,
  className = 'select',
  id,
}: {
  value: CategoryId;
  onChange: (c: CategoryId) => void;
  className?: string;
  id?: string;
}) {
  return (
    <select id={id} className={className} value={value} onChange={(e) => onChange(e.target.value as CategoryId)}>
      {CATEGORY_IDS.map((id) => (
        <option key={id} value={id}>
          {CATEGORIES[id].icon} {CATEGORIES[id].label}
        </option>
      ))}
    </select>
  );
}

export function ProductThumb({
  imageUrl,
  category,
  large,
}: {
  imageUrl?: string;
  category: CategoryId;
  large?: boolean;
}) {
  return (
    <div className={`thumb${large ? ' lg' : ''}`} aria-hidden="true">
      {imageUrl ? <img src={imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : CATEGORIES[category].icon}
    </div>
  );
}

export function NutriScore({ grade, scale }: { grade?: string; scale?: boolean }) {
  if (!grade) return null;
  const g = grade.toLowerCase();
  if (!scale) {
    return (
      <span className={`nutri ${g}`} title={`Nutri-Score ${g.toUpperCase()}`}>
        {g.toUpperCase()}
      </span>
    );
  }
  return (
    <span className="nutri-scale" aria-label={`Nutri-Score ${g.toUpperCase()}`}>
      {['a', 'b', 'c', 'd', 'e'].map((x) => (
        <span key={x} className={`nutri ${x}${x === g ? ' active' : ''}`}>
          {x.toUpperCase()}
        </span>
      ))}
    </span>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="big" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}
