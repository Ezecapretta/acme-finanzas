/**
 * Clases compartidas para controles de formulario en el tema claro.
 * Reutilizar en inputs, selects y NumericFormat para mantener consistencia
 * y acelerar la migración de las pantallas restantes.
 */
export const inputClass =
  'w-full rounded-[9px] border border-line bg-surface px-3 py-2.5 text-[14px] text-ink placeholder:text-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15';

export const selectClass = inputClass;

export const labelClass = 'mb-2 block text-[13px] font-medium text-muted';
