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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0a1628] border border-amber-500/40 rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start gap-3 mb-5">
          <span className="text-2xl mt-0.5">⚠️</span>
          <div>
            <h3 className="text-lg font-bold text-amber-400">Saldo insuficiente</h3>
            <p className="text-sm text-[#94a3b8] mt-0.5">
              Esta operación dejará {overdrafts.length > 1 ? 'estas cuentas' : 'esta cuenta'} en negativo.
              ¿Querés autorizarla de todas formas?
            </p>
          </div>
        </div>

        {/* Overdraft rows */}
        <div className="space-y-3 mb-6">
          {overdrafts.map((o, i) => (
            <div key={i} className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-[#d1dded] text-sm">
                  {o.clientName ?? o.boxName}
                </span>
                {o.clientName && (
                  <span className="text-[11px] text-[#64748b]">{o.boxName}</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-[#64748b] mb-1 uppercase tracking-wider font-bold text-[10px]">Saldo actual</p>
                  <p className="font-mono font-bold text-emerald-400">{fmt(o.currentBalance, o.currency)}</p>
                </div>
                <div>
                  <p className="text-[#64748b] mb-1 uppercase tracking-wider font-bold text-[10px]">Saldo proyectado</p>
                  <p className="font-mono font-bold text-red-400">{fmt(o.projectedBalance, o.currency)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-[#334155] text-[#94a3b8] hover:text-[#d1dded] hover:bg-white/5 font-semibold text-sm transition"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#0a1628] font-bold text-sm transition shadow-lg shadow-amber-500/20"
          >
            Autorizar de todas formas
          </button>
        </div>
      </div>
    </div>
  );
}
