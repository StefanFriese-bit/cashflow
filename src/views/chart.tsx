import { useEffect, useRef, useState } from 'preact/hooks';
import { diffDays, monthName, nice, ymd } from '../engine/dates';
import { money } from '../engine/money';

export interface Series {
  id: string;
  name: string;
  tone: 'a' | 'b' | '';
  points: { date: string; bal: number }[];
}

function niceStep(range: number): number {
  const raw = range / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / p;
  return (n < 1.5 ? 1 : n < 3.5 ? 2.5 : n < 7.5 ? 5 : 10) * p;
}

/** End-of-day balance per account. One y-axis (pounds), one line per account, hover/touch to read a day. */
export function BalanceChart({ series, height = 190, today }: { series: Series[]; height?: number; today: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 600));
    ro.observe(el);
    setW(el.clientWidth || 600);
    return () => ro.disconnect();
  }, []);
  const pts = series[0]?.points || [];
  if (!pts.length) return null;
  const n = pts.length;
  const all = series.flatMap((s) => s.points.map((p) => p.bal));
  let lo = Math.min(0, ...all);
  let hi = Math.max(...all, 100);
  const step = niceStep(hi - lo);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const padL = 46;
  const padR = 66;
  const padT = 10;
  const padB = 24;
  const iw = Math.max(50, w - padL - padR);
  const ih = height - padT - padB;
  const x = (i: number) => padL + (i / Math.max(1, n - 1)) * iw;
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo || 1)) * ih;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 0.01; v += step) ticks.push(v);
  const months: { i: number; label: string }[] = [];
  pts.forEach((p, i) => {
    const [, m, d] = ymd(p.date);
    if (d === 1) months.push({ i, label: monthName(m) });
  });
  const ti = pts.findIndex((p) => p.date === today);
  const kfmt = (v: number) => (Math.abs(v) >= 1000 ? `£${Math.round(v / 100) / 10}k` : `£${Math.round(v)}`);

  const onMove = (clientX: number) => {
    const r = wrap.current!.getBoundingClientRect();
    const i = Math.round(((clientX - r.left - padL) / iw) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  // direct labels at the right end, nudged apart so they never overlap
  const ends = series.map((s) => ({ s, y: y(s.points[n - 1].bal) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 26) ends[i].y = ends[i - 1].y + 26;

  return (
    <div
      class="chart"
      ref={wrap}
      onMouseMove={(e) => onMove(e.clientX)}
      onMouseLeave={() => setHover(null)}
      onTouchStart={(e) => onMove(e.touches[0].clientX)}
      onTouchMove={(e) => onMove(e.touches[0].clientX)}
      onTouchEnd={() => setTimeout(() => setHover(null), 1600)}
      role="img"
      aria-label={series.map((s) => `${s.name}: ${money(s.points[0].bal)} now, ${money(s.points[n - 1].bal)} on ${nice(s.points[n - 1].date)}`).join('. ')}
    >
      <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`}>
        {ticks.map((v) => (
          <g>
            <line x1={padL} x2={padL + iw} y1={y(v)} y2={y(v)} stroke="var(--line)" stroke-width={v === 0 ? 1.5 : 1} stroke-dasharray={v === 0 ? undefined : '2 4'} />
            <text x={padL - 8} y={y(v) + 4} text-anchor="end" font-size="11" fill="var(--ink-3)">
              {kfmt(v)}
            </text>
          </g>
        ))}
        {months.map((m) => (
          <text x={x(m.i)} y={height - 6} font-size="11" fill="var(--ink-3)" text-anchor="middle">
            {m.label}
          </text>
        ))}
        {lo < 0 && <rect x={padL} y={y(0)} width={iw} height={y(lo) - y(0)} fill="var(--bad-soft)" opacity="0.6" />}
        {ti >= 0 && <line x1={x(ti)} x2={x(ti)} y1={padT} y2={padT + ih} stroke="var(--ink-3)" stroke-width="1" />}
        {series.map((s) => {
          const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.bal).toFixed(1)}`).join('');
          return <path d={d} fill="none" stroke={`var(--${s.tone || 'ink-2'})`} stroke-width="2" stroke-linejoin="round" />;
        })}
        {ends.map(({ s, y: ly }) => (
          <g>
            <circle cx={x(n - 1)} cy={y(s.points[n - 1].bal)} r="4" fill={`var(--${s.tone || 'ink-2'})`} stroke="var(--card)" stroke-width="2" />
            <text x={x(n - 1) + 9} y={ly + 4} font-size="11.5" font-weight="700" fill="var(--ink)">
              {s.name}
            </text>
            <text x={x(n - 1) + 9} y={ly + 17} font-size="11" fill="var(--ink-2)">
              {kfmt(s.points[n - 1].bal)}
            </text>
          </g>
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + ih} stroke="var(--ink)" stroke-width="1" />
            {series.map((s) => (
              <circle cx={x(hover)} cy={y(s.points[hover].bal)} r="5" fill={`var(--${s.tone || 'ink-2'})`} stroke="var(--card)" stroke-width="2" />
            ))}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div class="tip" style={{ left: `${Math.min(Math.max(x(hover), 80), w - 80)}px` }}>
          <div style={{ opacity: 0.8 }}>
            {nice(pts[hover].date)}
            {diffDays(pts[hover].date, today) === 0 ? ' · today' : ''}
          </div>
          {series.map((s) => (
            <div>
              {s.name} <b>{money(s.points[hover].bal)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
