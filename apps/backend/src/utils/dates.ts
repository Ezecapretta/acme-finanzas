/**
 * Parsea una fecha proveniente de un formulario ("YYYY-MM-DD") como mediodía
 * en Argentina (UTC-3). Evita que `new Date("YYYY-MM-DD")` interprete la cadena
 * como UTC midnight, lo que en AR cae en el día anterior (21:00 del día previo).
 *
 * Uso: cuando el cuerpo del request trae una fecha de formulario, ej: req.body.date
 * NO usar para rangos de consulta que ya vienen como ISO completo desde el frontend.
 */
export function parseArgDate(dateStr: string): Date {
  // T12:00:00-03:00 = mediodía Argentina = 15:00 UTC
  // Siempre dentro del día calendario argentino sin importar la hora real.
  return new Date(`${dateStr}T12:00:00-03:00`);
}
