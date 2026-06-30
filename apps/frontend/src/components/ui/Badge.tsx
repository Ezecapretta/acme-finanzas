import type { ReactNode } from 'react';

export type Tone = 'positive' | 'negative' | 'accent' | 'warn' | 'neutral';

const TONE_CLASSES: Record<Tone, string> = {
  positive: 'text-positive bg-positive-bg',
  negative: 'text-negative bg-negative-bg',
  accent: 'text-accent bg-accent-bg',
  warn: 'text-warn bg-warn-bg',
  neutral: 'text-muted bg-track',
};

/** Badge de tipo (Ingreso / Egreso / Cheque / C/V USD) — cuadrado, 10.5px. */
export function Badge({ tone = 'neutral', className = '', children }: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-[9px] py-[3px] text-[10.5px] font-semibold ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Pill redondeada — usada para el estado de la posición FX y el badge del sidebar. */
export function Pill({ tone = 'accent', className = '', children }: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-[5px] text-[11.5px] font-semibold ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
