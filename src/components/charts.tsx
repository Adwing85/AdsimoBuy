import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatEuro, formatEuroRound, formatShortDate } from '../format';

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Saubere Achsenwerte (0, 0,5, 1, 1,5 …). */
function niceTicks(min: number, max: number, count = 4): number[] {
  const span = Math.max(max - min, 0.01);
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => span / s <= count) ?? 10 * pow;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; ; v += step) {
    ticks.push(Math.round(v * 1000) / 1000);
    if (v >= max - 1e-9 && ticks.length >= 2) break;
  }
  return ticks;
}

function Tooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div className="chart-tooltip" style={{ left: x, top: y }}>
      {children}
    </div>
  );
}

export interface PricePointView {
  date: number;
  price: number;
  storeName: string;
  color: string;
}

/** Preisverlauf: Linie über die Zeit, Punkte in der Farbe des Marktes, Fadenkreuz + Tooltip. */
export function PriceChart({ points, unit }: { points: PricePointView[]; unit: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = 190;
  const pad = { top: 16, right: 14, bottom: 26, left: 48 };
  const sorted = [...points].sort((a, b) => a.date - b.date);
  if (sorted.length === 0) return null;

  const prices = sorted.map((p) => p.price);
  const ticks = niceTicks(Math.min(...prices) * 0.9, Math.max(...prices) * 1.05);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const t0 = sorted[0].date;
  const t1 = sorted[sorted.length - 1].date;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (t: number) => pad.left + (t1 === t0 ? innerW / 2 : ((t - t0) / (t1 - t0)) * innerW);
  const y = (v: number) => pad.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;
  const path = sorted.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ');
  const xLabels = t1 === t0 ? [t0] : [t0, t0 + (t1 - t0) / 2, t1];

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    sorted.forEach((p, i) => {
      if (Math.abs(x(p.date) - px) < Math.abs(x(sorted[best].date) - px)) best = i;
    });
    setHover(best);
  };

  const h = hover !== null ? sorted[hover] : null;
  const last = sorted[sorted.length - 1];

  return (
    <div className="chart" ref={ref}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Preisverlauf, ${sorted.length} Käufe, zuletzt ${formatEuro(last.price)} ${unit}`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
        style={{ touchAction: 'pan-y' }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={pad.left - 8} y={y(t) + 4} textAnchor="end">
              {formatEuro(t)}
            </text>
          </g>
        ))}
        {xLabels.map((t, i) => (
          <text key={t} x={x(t)} y={height - 6} textAnchor={i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'}>
            {formatShortDate(t)}
          </text>
        ))}
        {sorted.length > 1 && (
          <path d={path} fill="none" stroke="var(--chart-line)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {h && <line x1={x(h.date)} x2={x(h.date)} y1={pad.top} y2={pad.top + innerH} stroke="var(--chart-axis)" strokeWidth={1} />}
        {sorted.map((p, i) => (
          <circle
            key={`${p.date}-${i}`}
            cx={x(p.date)}
            cy={y(p.price)}
            r={hover === i ? 6 : 4.5}
            fill={p.color}
            stroke="var(--chart-surface)"
            strokeWidth={2}
          />
        ))}
        <text
          x={x(last.date)}
          y={y(last.price) - 10}
          textAnchor="end"
          style={{ fill: 'var(--text)', fontWeight: 700, stroke: 'var(--chart-surface)', strokeWidth: 4, paintOrder: 'stroke' }}
        >
          {formatEuro(last.price)}
        </text>
      </svg>
      {h && (
        <Tooltip x={x(h.date)} y={y(h.price)}>
          <strong>
            {formatEuro(h.price)} <span className="muted small">{unit}</span>
          </strong>
          <span className="row" style={{ gap: 6 }}>
            <span className="swatch" style={{ background: h.color }} />
            <span className="text-2">
              {h.storeName} · {formatShortDate(h.date)}
            </span>
          </span>
        </Tooltip>
      )}
    </div>
  );
}

export interface MonthValue {
  key: string;
  label: string;
  value: number;
}

/** Monatsausgaben als Säulen; der gewählte Monat ist hervorgehoben und beschriftet. */
export function MonthBars({ months, selectedKey, onSelect }: { months: MonthValue[]; selectedKey: string; onSelect?: (key: string) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = 170;
  const pad = { top: 22, right: 8, bottom: 24, left: 44 };
  const max = Math.max(...months.map((m) => m.value), 1);
  const ticks = niceTicks(0, max, 3);
  const top = ticks[ticks.length - 1];
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const band = innerW / months.length;
  const barW = Math.min(24, band * 0.6);
  const y = (v: number) => pad.top + innerH - (v / top) * innerH;
  const h = hover !== null ? months[hover] : null;

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label="Ausgaben der letzten Monate" onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--chart-axis)' : 'var(--chart-grid)'} strokeWidth={1} />
            <text x={pad.left - 8} y={y(t) + 4} textAnchor="end">
              {formatEuroRound(t)}
            </text>
          </g>
        ))}
        {months.map((m, i) => {
          const cx = pad.left + band * i + band / 2;
          const barH = Math.max(0, innerH - (y(m.value) - pad.top));
          const selected = m.key === selectedKey;
          const r = Math.min(4, barH);
          const x0 = cx - barW / 2;
          const y0 = y(m.value);
          const d =
            barH > 0
              ? `M${x0},${y0 + barH} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + barW - r} Q${x0 + barW},${y0} ${x0 + barW},${y0 + r} V${y0 + barH} Z`
              : '';
          return (
            <g
              key={m.key}
              onPointerEnter={() => setHover(i)}
              onClick={() => onSelect?.(m.key)}
              style={{ cursor: onSelect ? 'pointer' : 'default' }}
              tabIndex={0}
              role="button"
              aria-label={`${m.label}: ${formatEuro(m.value)}`}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect?.(m.key)}
            >
              <rect x={pad.left + band * i} y={pad.top} width={band} height={innerH} fill="transparent" />
              {d && <path d={d} fill={selected ? 'var(--chart-accent)' : 'var(--chart-accent-soft)'} opacity={hover === i && !selected ? 0.8 : 1} />}
              <text x={cx} y={height - 6} textAnchor="middle" style={selected ? { fill: 'var(--text)', fontWeight: 700 } : undefined}>
                {m.label}
              </text>
              {selected && m.value > 0 && (
                <text x={cx} y={y0 - 6} textAnchor="middle" style={{ fill: 'var(--text)', fontWeight: 700 }}>
                  {formatEuroRound(m.value)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {h && h.key !== selectedKey && (
        <Tooltip x={pad.left + band * months.indexOf(h) + band / 2} y={y(h.value)}>
          <strong>{formatEuro(h.value)}</strong>
          <span className="text-2">{h.label}</span>
        </Tooltip>
      )}
    </div>
  );
}

export interface BarRow {
  key: string;
  label: string;
  icon?: ReactNode;
  value: number;
  color?: string;
  hint?: string;
}

/** Horizontale Balken (Rangliste) mit Wert am Balkenende. */
export function HBars({ rows, format = formatEuro }: { rows: BarRow[]; format?: (n: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 0.01);
  return (
    <div>
      {rows.map((r) => (
        <div className="hbar" key={r.key} title={r.hint}>
          <div className="hbar-label">
            <span className="row ellipsis" style={{ gap: 8 }}>
              {r.icon}
              <span className="ellipsis">{r.label}</span>
            </span>
            <strong className="num">{format(r.value)}</strong>
          </div>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? 'var(--chart-accent)' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
