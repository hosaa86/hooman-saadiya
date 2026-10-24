/** Tiny inline trend line with the allowed band shaded. */
export function Sparkline({ values, min, max, className = '' }: { values: number[]; min: number; max: number; className?: string }) {
  if (values.length < 2) return <div className={className} />;
  const lo = Math.min(min, ...values) - 0.5;
  const hi = Math.max(max, ...values) + 0.5;
  const W = 100;
  const H = 28;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * W},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} aria-hidden>
      <rect x="0" y={y(max)} width={W} height={y(min) - y(max)} className="fill-emerald-500/10" />
      <polyline points={pts} fill="none" strokeWidth="1.5" vectorEffect="non-scaling-stroke" className="stroke-current" />
    </svg>
  );
}
