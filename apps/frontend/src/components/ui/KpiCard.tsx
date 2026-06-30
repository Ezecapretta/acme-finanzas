import { Card } from './Card';

type DeltaTone = 'positive' | 'negative' | 'accent';

const DELTA_CLASS: Record<DeltaTone, string> = {
  positive: 'text-positive',
  negative: 'text-negative',
  accent: 'text-accent',
};

interface KpiCardProps {
  label: string;
  value: string;
  /** Texto destacado con color (monto secundario, conteo, etc.). */
  delta?: string;
  deltaTone?: DeltaTone;
  /** Texto tenue a continuación del delta. */
  sub?: string;
  loading?: boolean;
}

/**
 * Tarjeta KPI: label, valor en Geist Mono y una línea secundaria coloreada.
 * En `loading` muestra skeletons suaves en lugar de los valores.
 */
export function KpiCard({ label, value, delta, deltaTone = 'accent', sub, loading }: KpiCardProps) {
  return (
    <Card hover className="px-[19px] py-[18px]">
      <div className="text-[12.5px] font-medium text-subtle mb-[13px]">{label}</div>

      {loading ? (
        <div className="h-[22px] w-3/4 rounded-md bg-track animate-pulse" />
      ) : (
        <div className="font-mono text-[22px] font-semibold tracking-[-0.02em] text-ink">
          {value}
        </div>
      )}

      {loading ? (
        <div className="mt-[10px] h-[14px] w-1/2 rounded bg-track animate-pulse" />
      ) : (
        (delta || sub) && (
          <div className={`mt-[10px] text-[12px] font-medium ${delta ? DELTA_CLASS[deltaTone] : 'text-faint'}`}>
            {delta}
            {sub && <span className="font-normal text-faint"> {sub}</span>}
          </div>
        )
      )}
    </Card>
  );
}
