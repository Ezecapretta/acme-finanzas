'use client';

export interface OverdraftInfo {
  boxName: string;
  clientName: string | null;
  currency: 'ARS' | 'USD';
  currentBalance: number;
  projectedBalance: number;
}

interface Props {
  overdrafts: OverdraftInfo[];
  onConfirm: () => void;
  onCancel: () => void;
}

const fmt = (n: number, currency: string) =>
  `${currency === 'USD' ? 'U$S' : '$'} ${n.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

export default function OverdraftConfirmModal({ overdrafts, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-[14px] border border-warn/40 bg-surface p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="mb-5 flex items-start gap-3">
          <span className="mt-0.5 text-2xl">⚠️</span>
          <div>
            <h3 className="text-lg font-bold text-warn">Saldo insuficiente</h3>
            <p className="mt-0.5 text-sm text-muted">
              Esta operación dejará {overdrafts.length > 1 ? 'estas cuentas' : 'esta cuenta'} en negativo.
              ¿Querés autorizarla de todas formas?
            </p>
          </div>
        </div>

        {/* Overdraft rows */}
        <div className="mb-6 space-y-3">
          {overdrafts.map((o, i) => (
            <div key={i} className="rounded-xl border border-warn/30 bg-warn-bg px-4 py-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">
                  {o.clientName ?? o.boxName}
                </span>
                {o.clientName && (
                  <span className="text-[11px] text-faint">{o.boxName}</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-faint">Saldo actual</p>
                  <p className="font-mono font-bold text-positive">{fmt(o.currentBalance, o.currency)}</p>
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-faint">Saldo proyectado</p>
                  <p className="font-mono font-bold text-negative">{fmt(o.projectedBalance, o.currency)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-line py-3 text-sm font-semibold text-muted transition hover:bg-track hover:text-ink"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-warn py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-90"
          >
            Autorizar de todas formas
          </button>
        </div>
      </div>
    </div>
  );
}
