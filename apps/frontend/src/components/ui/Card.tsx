import type { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Añade elevación de sombra + borde más marcado al pasar el mouse. */
  hover?: boolean;
}

/**
 * Tarjeta base del sistema de diseño: fondo blanco, borde fino, radio 14px.
 * Con `hover` eleva una sombra suave (usada por los KPIs).
 */
export function Card({ hover = false, className = '', children, ...rest }: CardProps) {
  return (
    <div
      className={[
        'rounded-[14px] border border-line bg-surface',
        hover
          ? 'transition-[box-shadow,border-color] duration-200 hover:border-line-hover hover:shadow-[0_8px_24px_-12px_rgba(20,20,18,0.18)]'
          : '',
        className,
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}
