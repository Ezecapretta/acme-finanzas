'use client';
import { useEffect, useState, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { fetchApi } from '@/services/api';
import { getUserId } from '@/services/auth';
import { useParams } from 'next/navigation';

interface Movement {
  id: string;
  amount: string;
  currency: string;
  type: string;
  created_at: string;
  box: { name: string };
  transaction: { type: string, description: string, id: string };
}

interface ClientProfile {
  id: string;
  name: string;
  tax_id: string;
  email: string;
  created_at: string;
  is_active: boolean;
  box?: { id: string, name: string };
  source_checks: Array<any>;
  destination_checks: Array<any>;
  movements: Movement[];
}

export default function ClientProfilePage() {
  const params = useParams();
  const id = params?.id as string;
  const [client, setClient] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Date filters
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', tax_id: '', email: '' });
  const [isSaving, setIsSaving] = useState(false);
  useEffect(() => {
    // Set default dates (e.g. current month)
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    setStartDate(firstDay.toISOString().split('T')[0]);
    setEndDate(now.toISOString().split('T')[0]);

    loadClient();
  }, [id]);

  const loadClient = () => {
    setLoading(true);
    fetchApi(`/clients/${id}`)
      .then(setClient)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const openEditModal = () => {
    if (!client) return;
    setEditForm({ name: client.name, tax_id: client.tax_id || '', email: client.email || '' });
    setIsEditing(true);
  };

  const handleUpdateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;
    setIsSaving(true);
    try {
      const updated = await fetchApi(`/clients/${client.id}`, {
        method: 'PUT',
        body: JSON.stringify(editForm)
      });
      setClient({ ...client, ...updated });
      setIsEditing(false);
    } catch (err: any) {
      alert(err.message || "Error al actualizar cliente");
    } finally {
      setIsSaving(false);
    }
  };

  const exportClientPdf = async () => {
    if (!client) return;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (!token) throw new Error('No se encontró token de autenticación.');

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
      const query = new URLSearchParams();
      if (startDate) query.append('from', startDate);
      if (endDate) query.append('to', endDate);
      const response = await fetch(`${apiUrl}/clients/${id}/export-pdf?${query.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Error al generar PDF');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ficha-cliente-${client.name}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'No se pudo descargar el PDF.');
    }
  };

  const exportClientExcel = async () => {
    if (!client) return;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Acme';
    wb.created = new Date();

    // ── Palette ──────────────────────────────────────────────────────────────
    const DARK_BG   = '0D1B2E';   // title row bg
    const MID_BG    = '162033';   // header row bg
    const STRIPE    = '0F172A';   // odd data rows
    const INIT_BG   = '1E293B';   // saldo inicial/final rows
    const GREEN     = '34D399';   // positive amount
    const RED       = 'F87171';   // negative amount
    const GOLD      = 'FCD34D';   // commission text
    const WHITE     = 'F8FAFC';
    const MUTED     = '94A3B8';
    const BORDER_C  = '334155';

    const numFmt = '#,##0.00';

    const thin: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF' + BORDER_C } };
    const allBorders = { top: thin, bottom: thin, left: thin, right: thin };

    const buildSheet = (
      ledger: { initialBalance: number; rows: any[]; closingBalance: number },
      sheetName: string,
      sheetTitle: string,
      currency: string,
      accentArgb: string,
      isArs = false
    ) => {
      const ws = wb.addWorksheet(sheetName, {
        views: [{ state: 'frozen', ySplit: 3 }],
        properties: { tabColor: { argb: 'FF' + accentArgb } },
      });

      ws.columns = [
        { key: 'fecha',   width: 14 },
        { key: 'comp',    width: 14 },
        { key: 'concepto',width: 52 },
        { key: 'importe', width: 18 },
        { key: 'saldo',   width: 18 },
      ];

      // ── Row 1: Title ────────────────────────────────────────────────────────
      const titleRow = ws.addRow([
        `${sheetTitle} — ${client!.name}`,
        '', '', '', '',
      ]);
      ws.mergeCells(`A1:E1`);
      titleRow.height = 28;
      titleRow.eachCell(cell => {
        cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + DARK_BG } };
        cell.font   = { bold: true, size: 14, color: { argb: 'FF' + accentArgb }, name: 'Calibri' };
        cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      });

      // ── Row 2: Period subtitle ───────────────────────────────────────────────
      const periodLabel = startDate && endDate
        ? `Período: ${new Date(startDate + 'T00:00:00').toLocaleDateString('es-AR')} al ${new Date(endDate + 'T00:00:00').toLocaleDateString('es-AR')}`
        : 'Todos los movimientos';
      const subRow = ws.addRow([periodLabel, '', '', '', '']);
      ws.mergeCells(`A2:E2`);
      subRow.height = 18;
      subRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + DARK_BG } };
        cell.font = { size: 10, color: { argb: 'FF' + MUTED }, italic: true, name: 'Calibri' };
        cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      });

      // ── Row 3: Column headers ────────────────────────────────────────────────
      const hdrRow = ws.addRow(['Fecha', 'Comprobante', 'Concepto', 'Importe', 'Saldo']);
      hdrRow.height = 20;
      hdrRow.eachCell(cell => {
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + MID_BG } };
        cell.font      = { bold: true, size: 10, color: { argb: 'FF' + accentArgb }, name: 'Calibri' };
        cell.alignment = { vertical: 'middle', horizontal: cell.address.startsWith('D') || cell.address.startsWith('E') ? 'right' : 'left', indent: 1 };
        cell.border    = allBorders;
      });

      // ── Helper: style a data row ─────────────────────────────────────────────
      const styleDataRow = (
        row: ExcelJS.Row,
        opts: { isSpecial?: boolean; importeVal?: number; isComm?: boolean; rowIndex: number }
      ) => {
        const bgArgb = opts.isSpecial
          ? 'FF' + INIT_BG
          : opts.rowIndex % 2 === 0 ? 'FF' + STRIPE : 'FF0D1421';

        row.eachCell({ includeEmpty: true }, (cell, colNum) => {
          cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
          cell.font   = { size: 10, name: 'Calibri', color: { argb: 'FF' + WHITE } };
          cell.border = allBorders;
          cell.alignment = { vertical: 'middle', horizontal: colNum >= 4 ? 'right' : 'left', indent: 1 };
        });

        // Color importe (col D)
        const impCell = row.getCell(4);
        if (opts.importeVal !== undefined && opts.importeVal !== null) {
          impCell.numFmt = `+${numFmt};-${numFmt};"—"`;
          impCell.font = {
            ...impCell.font as ExcelJS.Font,
            bold: true,
            color: { argb: opts.importeVal >= 0 ? 'FF' + GREEN : 'FF' + RED },
          };
        }

        // Color comisión (col C)
        if (opts.isComm) {
          row.getCell(3).font = { ...row.getCell(3).font as ExcelJS.Font, color: { argb: 'FF' + GOLD }, italic: true };
        }

        // Saldo (col E)
        const saldoCell = row.getCell(5);
        saldoCell.numFmt = numFmt;
        if (opts.isSpecial) {
          saldoCell.font = { ...saldoCell.font as ExcelJS.Font, bold: true, color: { argb: 'FF' + accentArgb } };
        }
      };

      // ── Saldo inicial ────────────────────────────────────────────────────────
      const initRow = ws.addRow([
        startDate ? new Date(startDate + 'T00:00:00').toLocaleDateString('es-AR') : '',
        '',
        'Saldo Inicial (Arrastre)',
        null,
        ledger.initialBalance,
      ]);
      styleDataRow(initRow, { isSpecial: true, rowIndex: 0 });
      initRow.getCell(3).font = { ...initRow.getCell(3).font as ExcelJS.Font, italic: true, color: { argb: 'FF' + MUTED } };

      // ── Data rows ────────────────────────────────────────────────────────────
      ledger.rows.forEach((row: any, i: number) => {
        let concepto = row.transaction.description;
        let isComm = false;
        if (isArs && row.transaction?.type === 'CHECK_TRADE') {
          isComm = ledger.rows.some(
            (r: any) =>
              r.transaction?.id === row.transaction?.id &&
              r.id !== row.id &&
              Number(r.amount) > Number(row.amount)
          );
          if (isComm) concepto = `Comisión (${row.transaction.description})`;
        }
        const exRow = ws.addRow([
          new Date(row.created_at).toLocaleDateString('es-AR'),
          row.transaction.id.split('-')[0].toUpperCase(),
          concepto,
          row.effect,
          row.runningBalance,
        ]);
        styleDataRow(exRow, { importeVal: row.effect, isComm, rowIndex: i + 1 });
      });

      // ── Saldo final ──────────────────────────────────────────────────────────
      const closingRow = ws.addRow([
        endDate ? new Date(endDate + 'T00:00:00').toLocaleDateString('es-AR') : '',
        '',
        'Saldo Final del Período',
        null,
        ledger.closingBalance,
      ]);
      styleDataRow(closingRow, { isSpecial: true, rowIndex: 0 });
      closingRow.height = 18;
      closingRow.getCell(3).font = { bold: true, size: 11, color: { argb: 'FF' + WHITE }, name: 'Calibri' };
      closingRow.getCell(5).font = {
        bold: true, size: 12, name: 'Calibri',
        color: { argb: ledger.closingBalance >= 0 ? 'FF' + GREEN : 'FF' + RED },
      };
    };

    buildSheet(checksLedger, 'Cheques',  'Sub-Libro Cheques', 'ARS', 'A855F7');
    buildSheet(arsLedger,    'ARS',      'Sub-Libro ARS',     'ARS', '0EA5E9', true);
    buildSheet(usdLedger,    'USD',      'Sub-Libro USD',     'USD', '34D399');

    // ── Download ─────────────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const period = startDate && endDate ? `_${startDate}_${endDate}` : '';
    link.download = `cuenta-${client.name}${period}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  // Memoized Ledger Builders
  const { arsLedger, usdLedger, checksLedger } = useMemo(() => {
    const emptyLedger = { initialBalance: 0, rows: [] as any[], closingBalance: 0 };
    if (!client) return { arsLedger: emptyLedger, usdLedger: emptyLedger, checksLedger: emptyLedger };

    const start = startDate ? new Date(startDate).getTime() : 0;
    const end = endDate ? new Date(endDate).getTime() : Infinity;

    // Filter by currency and sort ASCENDING by date for rolling balance
    const processLedger = (movs: Movement[]) => {
      let rollingBalance = 0;
      let initialBalance = 0;
      const ledgerRows = [];

      for (const mov of movs) {
        const movTime = new Date(mov.created_at).getTime();
        const amt = Number(mov.amount);
        const effect = mov.type === 'DEBIT' ? amt : -amt;

        if (movTime < start) {
          initialBalance += effect; rollingBalance += effect;
        } else if (movTime <= end + 86400000) { // include end day
          rollingBalance += effect;
          ledgerRows.push({ ...mov, effect, runningBalance: rollingBalance });
        }
      }

      return { initialBalance, rows: ledgerRows.reverse(), closingBalance: rollingBalance };
    };

    const sortedMovs = [...client.movements].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    
    // We categorize checks movements vs pure cash movements
    // Assuming backend returns check_id globally, we'll proxy `movements` to handle it.
    // If check_id is not exposed in the interface, we'll try to guess based on transaction type if it's CHECK_TRADE or INCOME with checks
    const checkMovs = sortedMovs.filter(m => (m as any).check_id !== null && (m as any).check_id !== undefined);

    // Regla de inclusión en el saldo del cliente:
    // - Todos los movimientos con client_id, agrupados por transacción.
    // - Si hay movimiento con caja física (box_id), se usa ese; si no, asiento puro (AP/AR).
    const deduplicateByTx = (movs: any[]) => {
      const byTxId = new Map<string, any[]>();
      for (const m of movs) {
        const txId = (m as any).transaction_id ?? m.id;
        if (!byTxId.has(txId)) byTxId.set(txId, []);
        byTxId.get(txId)!.push(m);
      }
      return [...byTxId.values()].flatMap(group => {
        const withBox = group.find(m => (m as any).box_id);
        if (withBox) return [withBox];
        return group;
      });
    };

    const arsMovs = deduplicateByTx(
      sortedMovs.filter(m => m.currency === 'ARS' && !(m as any).check_id)
    );
    const usdMovs = deduplicateByTx(
      sortedMovs.filter(m => m.currency === 'USD' && !(m as any).check_id)
    );

    return {
      arsLedger: processLedger(arsMovs),
      usdLedger: processLedger(usdMovs),
      checksLedger: processLedger(checkMovs)
    };
  }, [client, startDate, endDate]);

  // Opening balance modal
  const emptyOB = () => ({ arsAmount: '', arsDir: 'ACREEDOR', usdAmount: '', usdDir: 'ACREEDOR' });
  const [showOBModal, setShowOBModal] = useState(false);
  const [obForm, setObForm] = useState(emptyOB());
  const [obSaving, setObSaving] = useState(false);

  // Client adjustment modal
  const emptyAdj = () => ({ amount: '', currency: 'ARS', direction: 'ACREEDOR', description: '' });
  const [showAdjModal, setShowAdjModal] = useState(false);
  const [adjForm, setAdjForm] = useState(emptyAdj());
  const [adjSaving, setAdjSaving] = useState(false);

  const handleOpeningBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    const clientBalances: any[] = [];
    if (Number(obForm.arsAmount) > 0) clientBalances.push({ currency: 'ARS', amount: Number(obForm.arsAmount), direction: obForm.arsDir });
    if (Number(obForm.usdAmount) > 0) clientBalances.push({ currency: 'USD', amount: Number(obForm.usdAmount), direction: obForm.usdDir });
    if (clientBalances.length === 0) return;
    setObSaving(true);
    try {
      const userId = getUserId();
      await fetchApi('/transactions/opening-balance', {
        method: 'POST',
        body: JSON.stringify({ userId, clientId: client!.id, clientBalances }),
      });
      setShowOBModal(false);
      setObForm(emptyOB());
      loadClient();
    } catch (err: any) {
      alert('Error: ' + (err.message || 'desconocido'));
    } finally {
      setObSaving(false);
    }
  };

  const handleClientAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Number(adjForm.amount) <= 0) return;
    setAdjSaving(true);
    try {
      const userId = getUserId();
      await fetchApi('/transactions/client-adjustment', {
        method: 'POST',
        body: JSON.stringify({
          userId,
          clientId: client!.id,
          amount: Number(adjForm.amount),
          currency: adjForm.currency,
          direction: adjForm.direction,
          description: adjForm.description || undefined,
        }),
      });
      setShowAdjModal(false);
      setAdjForm(emptyAdj());
      loadClient();
    } catch (err: any) {
      alert('Error: ' + (err.message || 'desconocido'));
    } finally {
      setAdjSaving(false);
    }
  };

  const [checkActionLoading, setCheckActionLoading] = useState<string | null>(null); // checkId being processed

  const [checksVisible, setChecksVisible] = useState(10);
  const [arsVisible, setArsVisible] = useState(10);
  const [usdVisible, setUsdVisible] = useState(10);
  const [destChecksVisible, setDestChecksVisible] = useState(10);

  useEffect(() => {
    setChecksVisible(10);
    setArsVisible(10);
    setUsdVisible(10);
    setDestChecksVisible(10);
  }, [startDate, endDate]);

  const handleReturnCheck = async (checkId: string) => {
    if (!confirm('¿Rechazar este cheque y devolverlo a la agencia?')) return;
    const { getUserId } = await import('@/services/auth');
    const userId = getUserId();
    if (!userId) { alert('Sesión inválida.'); return; }
    setCheckActionLoading(checkId);
    try {
      await fetchApi('/transactions/check-return', {
        method: 'POST',
        body: JSON.stringify({ checkId, ownerClientId: client!.id, userId }),
      });
      loadClient();
    } catch (err: any) {
      alert('Error: ' + (err.message || 'desconocido'));
    } finally {
      setCheckActionLoading(null);
    }
  };

  if (loading) return <div className="p-6 text-[#aab6c7] animate-pulse">Cargando ficha de cliente...</div>;
  if (!client) return <div className="p-6 text-red-400">Error: Cliente no encontrado</div>;

  return (
    <div className="w-full h-full animate-in fade-in zoom-in-95 duration-500 pb-12 relative">

      {/* Opening Balance Modal */}
      {showOBModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <form onSubmit={handleOpeningBalance} className="glass-panel w-full max-w-md p-8 rounded-2xl shadow-xl flex flex-col space-y-5 animate-in zoom-in-95 duration-300 border border-[#334155]/50 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <h2 className="text-2xl font-bold text-[#f8fafc]">Registrar Saldo Inicial</h2>
            <p className="text-sm text-[#64748b]">Acreedor = le debemos al cliente &middot; Deudor = el cliente nos debe</p>
            <div className="space-y-3">
              <div className="flex gap-2 items-center">
                <span className="text-xs text-[#7e8b9d] w-8">ARS</span>
                <input
                  type="number" min="0" step="0.01" placeholder="0.00"
                  value={obForm.arsAmount}
                  onChange={e => setObForm(f => ({ ...f, arsAmount: e.target.value }))}
                  className="flex-1 bg-[#081329]/50 border border-[#334155] rounded-xl px-4 py-3 text-[#f8fafc] focus:outline-none focus:border-[#0ea5e9]/50 transition-all"
                />
                <select
                  value={obForm.arsDir}
                  onChange={e => setObForm(f => ({ ...f, arsDir: e.target.value }))}
                  className="bg-[#081329] border border-[#334155] rounded-xl px-3 py-3 text-[#d1dded] text-sm focus:outline-none focus:border-[#0ea5e9]/50"
                >
                  <option value="ACREEDOR">Acreedor</option>
                  <option value="DEUDOR">Deudor</option>
                </select>
              </div>
              <div className="flex gap-2 items-center">
                <span className="text-xs text-[#7e8b9d] w-8">USD</span>
                <input
                  type="number" min="0" step="0.01" placeholder="0.00"
                  value={obForm.usdAmount}
                  onChange={e => setObForm(f => ({ ...f, usdAmount: e.target.value }))}
                  className="flex-1 bg-[#081329]/50 border border-[#334155] rounded-xl px-4 py-3 text-[#f8fafc] focus:outline-none focus:border-[#0ea5e9]/50 transition-all"
                />
                <select
                  value={obForm.usdDir}
                  onChange={e => setObForm(f => ({ ...f, usdDir: e.target.value }))}
                  className="bg-[#081329] border border-[#334155] rounded-xl px-3 py-3 text-[#d1dded] text-sm focus:outline-none focus:border-[#0ea5e9]/50"
                >
                  <option value="ACREEDOR">Acreedor</option>
                  <option value="DEUDOR">Deudor</option>
                </select>
              </div>
            </div>
            <div className="flex space-x-3 pt-2">
              <button type="button" onClick={() => { setShowOBModal(false); setObForm(emptyOB()); }} className="flex-1 px-4 py-3 rounded-xl border border-[#334155] text-[#94a3b8] hover:text-white hover:bg-white/5 font-medium transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={obSaving || (Number(obForm.arsAmount) <= 0 && Number(obForm.usdAmount) <= 0)} className="flex-1 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {obSaving ? 'Guardando...' : 'Registrar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Client Adjustment Modal */}
      {showAdjModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <form onSubmit={handleClientAdjustment} className="glass-panel w-full max-w-md p-8 rounded-2xl shadow-xl flex flex-col space-y-5 animate-in zoom-in-95 duration-300 border border-[#334155]/50 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <h2 className="text-2xl font-bold text-[#f8fafc]">Ajuste de Cuenta Corriente</h2>
            <p className="text-sm text-[#64748b]">Registra un cargo o abono sin movimiento de caja.</p>
            <div className="space-y-4">
              <div className="flex gap-2 items-center">
                <input
                  type="number" min="0.01" step="0.01" placeholder="Importe" required
                  value={adjForm.amount}
                  onChange={e => setAdjForm(f => ({ ...f, amount: e.target.value }))}
                  className="flex-1 bg-[#081329]/50 border border-[#334155] rounded-xl px-4 py-3 text-[#f8fafc] focus:outline-none focus:border-[#0ea5e9]/50 transition-all"
                />
                <select
                  value={adjForm.currency}
                  onChange={e => setAdjForm(f => ({ ...f, currency: e.target.value }))}
                  className="bg-[#081329] border border-[#334155] rounded-xl px-3 py-3 text-[#d1dded] text-sm focus:outline-none focus:border-[#0ea5e9]/50 w-24"
                >
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#94a3b8] uppercase mb-2">Tipo de ajuste</label>
                <div className="flex gap-3">
                  <button type="button"
                    onClick={() => setAdjForm(f => ({ ...f, direction: 'ACREEDOR' }))}
                    className={`flex-1 py-3 rounded-xl border font-medium text-sm transition-all ${
                      adjForm.direction === 'ACREEDOR'
                        ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                        : 'border-[#334155] text-[#64748b] hover:text-white hover:bg-white/5'
                    }`}
                  >
                    Abono / Crédito
                    <span className="block text-[10px] font-normal opacity-70">Le acreditamos al cliente</span>
                  </button>
                  <button type="button"
                    onClick={() => setAdjForm(f => ({ ...f, direction: 'DEUDOR' }))}
                    className={`flex-1 py-3 rounded-xl border font-medium text-sm transition-all ${
                      adjForm.direction === 'DEUDOR'
                        ? 'bg-red-600/20 border-red-500/50 text-red-300'
                        : 'border-[#334155] text-[#64748b] hover:text-white hover:bg-white/5'
                    }`}
                  >
                    Cargo / Débito
                    <span className="block text-[10px] font-normal opacity-70">Le cargamos al cliente</span>
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#94a3b8] uppercase mb-1">Concepto (opcional)</label>
                <input
                  type="text" placeholder="Ej: Comisión, descuento, diferencia..."
                  value={adjForm.description}
                  onChange={e => setAdjForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full bg-[#081329]/50 border border-[#334155] rounded-xl px-4 py-3 text-[#f8fafc] focus:outline-none focus:border-[#0ea5e9]/50 transition-all placeholder-[#475569]"
                />
              </div>
            </div>
            <div className="flex space-x-3 pt-2">
              <button type="button" onClick={() => { setShowAdjModal(false); setAdjForm(emptyAdj()); }} className="flex-1 px-4 py-3 rounded-xl border border-[#334155] text-[#94a3b8] hover:text-white hover:bg-white/5 font-medium transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={adjSaving || Number(adjForm.amount) <= 0} className="flex-1 px-4 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {adjSaving ? 'Guardando...' : 'Registrar Ajuste'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <form onSubmit={handleUpdateClient} className="glass-panel w-full max-w-md p-8 rounded-2xl shadow-xl flex flex-col space-y-5 animate-in zoom-in-95 duration-300 border border-[#334155]/50 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#0ea5e9]/10 rounded-full blur-3xl pointer-events-none"></div>
            
            <h2 className="text-2xl font-bold text-[#f8fafc]">Editar Información</h2>
            
            <div>
              <label className="block text-xs font-bold text-[#94a3b8] uppercase mb-1">Nombre / Razón Social</label>
              <input type="text" required value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full bg-[#081329]/50 border border-[#334155] rounded-xl px-4 py-3 text-[#f8fafc] focus:outline-none focus:border-[#0ea5e9]/50 focus:ring-1 focus:ring-[#0ea5e9]/50 transition-all placeholder-[#475569]" placeholder="Ingresar nombre..." />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-[#94a3b8] uppercase mb-1">Teléfono (Opcional)</label>
              <input type="text" value={editForm.tax_id} onChange={e => setEditForm({ ...editForm, tax_id: e.target.value })} className="w-full bg-[#081329]/50 border border-[#334155] rounded-xl px-4 py-3 text-[#f8fafc] focus:outline-none focus:border-[#0ea5e9]/50 focus:ring-1 focus:ring-[#0ea5e9]/50 transition-all placeholder-[#475569]" placeholder="Ej: 20-12345678-9" />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#94a3b8] uppercase mb-1">Email (Opcional)</label>
              <input type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} className="w-full bg-[#081329]/50 border border-[#334155] rounded-xl px-4 py-3 text-[#f8fafc] focus:outline-none focus:border-[#0ea5e9]/50 focus:ring-1 focus:ring-[#0ea5e9]/50 transition-all placeholder-[#475569]" placeholder="correo@ejemplo.com" />
            </div>

            <div className="flex space-x-3 pt-2">
              <button type="button" onClick={() => setIsEditing(false)} className="flex-1 px-4 py-3 rounded-xl border border-[#334155] text-[#94a3b8] hover:text-white hover:bg-white/5 font-medium transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={isSaving} className={`flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-[#0ea5e9] to-[#3b82f6] text-white font-bold shadow-lg shadow-[#0ea5e9]/20 hover:shadow-[#0ea5e9]/40 transition-all ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}>
                {isSaving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </form>
        </div>
      )}

      <header className="mb-6 flex justify-between items-start">
        <div className="flex items-center space-x-4">
          <button onClick={() => window.history.back()} className="text-[#aab6c7] hover:text-[#0ea5e9] transition-colors p-2 rounded-full border border-transparent hover:border-[#0ea5e9]/30 bg-[#081329]">
             ← Volver
          </button>
          <div>
            <h1 className="text-3xl font-bold text-[#f8fafc] mb-1 tracking-tight">Resumen de Cuenta</h1>
            <div className="flex items-center space-x-3 mt-2">
               <p className="text-[#0ea5e9] font-medium text-lg">{client.name}</p>
               {client.tax_id && <span className="text-[#94a3b8] text-sm">| {client.tax_id}</span>}
            </div>
          </div>
        </div>
        
        <div className="flex space-x-3 items-end">
          <div className="glass-panel px-4 py-2 rounded-xl flex space-x-4 border-[#334155]/50">
             <div>
               <label className="block text-[10px] uppercase font-bold text-[#64748b] mb-1">Desde</label>
               <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent text-[#d1dded] text-sm focus:outline-none" />
             </div>
             <div className="w-px h-8 bg-[#334155]/50 self-center"></div>
             <div>
               <label className="block text-[10px] uppercase font-bold text-[#64748b] mb-1">Hasta</label>
               <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent text-[#d1dded] text-sm focus:outline-none" />
             </div>
          </div>
          <button onClick={exportClientPdf} className="bg-[#4d596b] hover:bg-[#677383] text-white px-4 py-3 rounded-xl font-medium transition-colors border border-[#7e8b9d] shadow-lg">
             📄 Exportar PDF
          </button>
          <button onClick={exportClientExcel} className="bg-emerald-800/40 hover:bg-emerald-700/50 text-emerald-300 px-4 py-3 rounded-xl font-medium transition-colors border border-emerald-600/40 shadow-lg">
             📊 Exportar Excel
          </button>
          <button onClick={() => setShowOBModal(true)} className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 px-4 py-3 rounded-xl font-medium transition-colors border border-emerald-500/20 shadow-lg">
             + Saldo Inicial
          </button>
          <button onClick={() => setShowAdjModal(true)} className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 px-4 py-3 rounded-xl font-medium transition-colors border border-amber-500/20 shadow-lg">
             ± Ajuste
          </button>
          <button onClick={openEditModal} className="bg-black/20 hover:bg-black/40 text-[#aab6c7] hover:text-white px-4 py-3 rounded-xl font-medium transition-colors border border-[#334155]/50 shadow-lg">
             ✏️ Editar Info
          </button>
        </div>
      </header>

      {/* BALANCE SUMMARY STRIP */}
      {(() => {
        const checkBal = checksLedger.closingBalance;
        const arsBal   = arsLedger.closingBalance;
        const usdBal   = usdLedger.closingBalance;
        const netARS   = checkBal + arsBal;
        return (
          <div className="glass-panel rounded-2xl px-6 py-4 mb-6 border border-[#334155]/50 flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[160px]">
              <p className="text-[10px] uppercase font-bold text-[#64748b] mb-0.5 tracking-wider">Saldo Cheques</p>
              <p className={`text-xl font-bold ${checkBal >= 0 ? 'text-violet-400' : 'text-red-400'}`}>
                $ {checkBal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="text-[#334155] text-2xl font-thin">+</div>
            <div className="flex-1 min-w-[160px]">
              <p className="text-[10px] uppercase font-bold text-[#64748b] mb-0.5 tracking-wider">Saldo ARS</p>
              <p className={`text-xl font-bold ${arsBal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                $ {arsBal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="w-px h-10 bg-[#334155]/50 self-center"></div>
            <div className="flex-1 min-w-[200px]">
              <p className="text-[10px] uppercase font-bold text-[#64748b] mb-0.5 tracking-wider">Subtotal ARS + Cheques</p>
              <p className={`text-2xl font-extrabold ${netARS >= 0 ? 'text-emerald-300' : 'text-red-400'}`}>
                $ {netARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
            {(usdBal !== 0) && (
              <>
                <div className="w-px h-10 bg-[#334155]/50 self-center"></div>
                <div className="flex-1 min-w-[160px]">
                  <p className="text-[10px] uppercase font-bold text-[#64748b] mb-0.5 tracking-wider">Saldo USD</p>
                  <p className={`text-xl font-bold ${usdBal >= 0 ? 'text-sky-400' : 'text-red-400'}`}>
                    U$S {usdBal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* PENDING CHECKS — awaiting settlement */}
      {client.destination_checks && client.destination_checks.length > 0 && (
        <section className="glass-panel rounded-2xl p-6 mb-6 border border-amber-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-56 h-56 rounded-full blur-[80px] bg-amber-500/5 pointer-events-none"></div>
          <div className="flex items-center gap-3 mb-5 relative z-10">
            <span className="w-3 h-3 rounded-full bg-amber-400 shadow-[0_0_10px_#f59e0b] animate-pulse"></span>
            <h2 className="text-lg font-bold text-[#f8fafc]">Cheques entregados al cliente</h2>
            <span className="px-2 py-0.5 bg-amber-500/15 border border-amber-500/30 rounded-full text-amber-300 text-xs font-bold">{client.destination_checks.length}</span>
          </div>
          <div className="overflow-x-auto relative z-10">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="text-[#64748b] text-xs uppercase tracking-wider border-b border-[#334155]/30">
                  <th className="pb-3 px-3 font-semibold">Banco</th>
                  <th className="pb-3 px-3 font-semibold">N° Cheque</th>
                  <th className="pb-3 px-3 font-semibold">Vencimiento</th>
                  <th className="pb-3 px-3 font-semibold text-right">Monto</th>
                  <th className="pb-3 px-3 font-semibold">Vendedor</th>
                  <th className="pb-3 px-3 font-semibold text-center">Acción</th>
                </tr>
              </thead>
              <tbody>
                {client.destination_checks.slice(0, destChecksVisible).map((ch: any) => (
                  <tr key={ch.id} className="border-b border-[#334155]/20 hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-3 text-[#d1dded]">{ch.bank_name}</td>
                    <td className="py-3 px-3 font-mono text-[#94a3b8]">{ch.check_number}</td>
                    <td className="py-3 px-3 text-[#94a3b8]">{new Date(ch.due_date).toLocaleDateString('es-AR')}</td>
                    <td className="py-3 px-3 text-right font-bold text-emerald-400">$ {Number(ch.amount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                    <td className="py-3 px-3 text-xs text-[#64748b]">{ch.source_client?.name || <span className="italic">—</span>}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleReturnCheck(ch.id)}
                          disabled={checkActionLoading === ch.id}
                          className="px-3 py-1.5 bg-red-500/15 hover:bg-red-500/30 border border-red-500/30 text-red-400 text-xs font-bold rounded-lg transition-all disabled:opacity-50"
                        >
                          {checkActionLoading === ch.id ? '...' : '✕ Rechazar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {destChecksVisible < client.destination_checks.length && (
            <div className="flex justify-center mt-4 relative z-10">
              <button
                onClick={() => setDestChecksVisible(prev => prev + 10)}
                className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 border border-amber-500/20 rounded-lg text-sm font-medium transition-all"
              >
                Ver más ({client.destination_checks.length - destChecksVisible} restantes)
              </button>
            </div>
          )}
        </section>
      )}

      {/* CHECKS LEDGER */}
      <section className="glass-panel rounded-2xl p-6 mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-[80px] bg-purple-500/5 pointer-events-none"></div>
        <div className="flex justify-between items-end mb-6 border-b border-[#334155]/50 pb-4 relative z-10">
           <h2 className="text-xl font-bold text-[#f8fafc] flex items-center gap-2">
             <span className="w-3 h-3 rounded-full bg-purple-400 shadow-[0_0_10px_#a855f7]"></span>
             Sub-Libro Cheques (Valores de Terceros)
           </h2>
           <div className="text-right">
             <p className="text-sm text-[#94a3b8] mb-1">Saldo en Cartera</p>
             <p className={`text-2xl font-bold ${checksLedger.closingBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                $ {checksLedger.closingBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
             </p>
           </div>
        </div>
        
        <div className="overflow-x-auto relative z-10">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[#64748b] text-xs uppercase tracking-wider border-b border-[#334155]/30">
                <th className="pb-3 px-2 font-semibold">Fecha</th>
                <th className="pb-3 px-2 font-semibold">Comprobante</th>
                <th className="pb-3 px-2 font-semibold">Concepto</th>
                <th className="pb-3 px-2 font-semibold text-right">Importe Nominal</th>
                <th className="pb-3 px-2 font-semibold text-right">Saldo Combinado</th>
              </tr>
            </thead>
            <tbody className="text-sm text-[#d1dded]">
              <tr className="border-b border-[#334155]/10 bg-[#081329]/30">
                 <td className="py-3 px-2 text-[#64748b]">{startDate && new Date(startDate).toLocaleDateString()}</td>
                 <td className="py-3 px-2"></td>
                 <td className="py-3 px-2 font-medium italic text-[#94a3b8]">Saldo Inicial (Arrastre)</td>
                 <td className="py-3 px-2 text-right"></td>
                 <td className="py-3 px-2 text-right font-medium text-[#f8fafc]">$ {checksLedger.initialBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              </tr>
              
              {checksLedger.rows.slice(0, checksVisible).map((row: any) => (
                <tr key={row.id} className="border-b border-[#334155]/30 hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-2 whitespace-nowrap">{new Date(row.created_at).toLocaleDateString()}</td>
                  <td className="py-3 px-2 text-[#94a3b8] font-mono text-xs">{row.transaction.id.split('-')[0].toUpperCase()}</td>
                  <td className="py-3 px-2">{row.transaction.description}</td>
                  <td className={`py-3 px-2 text-right font-medium ${row.effect > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {row.effect > 0 ? '+' : ''}{row.effect.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-2 text-right font-bold text-[#f8fafc]">$ {row.runningBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
              {checksLedger.rows.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-[#64748b]">Sin movimientos de cheques en este período.</td></tr>
              )}
            </tbody>
          </table>
          {checksVisible < checksLedger.rows.length && (
            <div className="p-4 text-center border-t border-[#334155]/30">
              <button onClick={() => setChecksVisible(v => v + 10)} className="text-sm text-[#0ea5e9] hover:text-[#38bdf8] font-medium transition-colors">
                Ver más ({checksLedger.rows.length - checksVisible} restantes)
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ARS LEDGER */}
      <section className="glass-panel rounded-2xl p-6 mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-[80px] bg-[#0ea5e9]/5 pointer-events-none"></div>
        <div className="flex justify-between items-end mb-6 border-b border-[#334155]/50 pb-4 relative z-10">
           <h2 className="text-xl font-bold text-[#f8fafc] flex items-center gap-2">
             <span className="w-3 h-3 rounded-full bg-[#0ea5e9] shadow-[0_0_10px_#0ea5e9]"></span>
             Sub-Libro ARS (Pesos, Cobros y Pagos)
           </h2>
           <div className="text-right">
             <p className="text-sm text-[#94a3b8] mb-1">Saldo Final del Período</p>
             <p className={`text-2xl font-bold ${arsLedger.closingBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                $ {arsLedger.closingBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
             </p>
           </div>
        </div>
        
        <div className="overflow-x-auto relative z-10">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[#64748b] text-xs uppercase tracking-wider border-b border-[#334155]/30">
                <th className="pb-3 px-2 font-semibold">Fecha</th>
                <th className="pb-3 px-2 font-semibold">Comprobante</th>
                <th className="pb-3 px-2 font-semibold">Concepto</th>
                <th className="pb-3 px-2 font-semibold text-right">Importe</th>
                <th className="pb-3 px-2 font-semibold text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="text-sm text-[#d1dded]">
              {/* Initial Balance Row */}
              <tr className="border-b border-[#334155]/10 bg-[#081329]/30">
                 <td className="py-3 px-2 text-[#64748b]">{startDate && new Date(startDate).toLocaleDateString()}</td>
                 <td className="py-3 px-2"></td>
                 <td className="py-3 px-2 font-medium italic text-[#94a3b8]">Saldo Inicial (Arrastre)</td>
                 <td className="py-3 px-2 text-right"></td>
                 <td className="py-3 px-2 text-right font-medium text-[#f8fafc]">$ {arsLedger.initialBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              </tr>
              
              {arsLedger.rows.slice(0, arsVisible).map((row: any) => {
                // Detectar fila de comisión: en una transacción CHECK_TRADE con 2 movimientos
                // (nominal + comisión), la comisión es siempre el de MENOR monto.
                // BUY:  DEBIT 1M (nominal AP) + CREDIT comm (descuento) → CREDIT es comisión
                // SELL: CREDIT 1M (nominal AR) + DEBIT comm (descuento) → DEBIT es comisión
                const isCommissionRow =
                  row.transaction?.type === 'CHECK_TRADE' &&
                  arsLedger.rows.some((r: any) =>
                    r.transaction?.id === row.transaction?.id &&
                    r.id !== row.id &&
                    Number(r.amount) > Number(row.amount)
                  );
                return (
                  <tr key={row.id} className="border-b border-[#334155]/30 hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-2 whitespace-nowrap">{new Date(row.created_at).toLocaleDateString()}</td>
                    <td className="py-3 px-2 text-[#94a3b8] font-mono text-xs">{row.transaction.id.split('-')[0].toUpperCase()}</td>
                    <td className="py-3 px-2">
                      {isCommissionRow
                        ? <><span className="text-amber-400 font-medium">Comisión</span><span className="text-[#64748b] ml-2 text-xs">({row.transaction.description})</span></>
                        : row.transaction.description}
                    </td>
                    <td className={`py-3 px-2 text-right font-medium ${row.effect > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {row.effect > 0 ? '+' : ''}{row.effect.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-2 text-right font-bold text-[#f8fafc]">
                      {`$ ${row.runningBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                    </td>
                  </tr>
                );
              })}
              {arsLedger.rows.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-[#64748b]">Sin movimientos ARS en este período.</td></tr>
              )}
            </tbody>
          </table>
          {arsVisible < arsLedger.rows.length && (
            <div className="p-4 text-center border-t border-[#334155]/30">
              <button onClick={() => setArsVisible(v => v + 10)} className="text-sm text-[#0ea5e9] hover:text-[#38bdf8] font-medium transition-colors">
                Ver más ({arsLedger.rows.length - arsVisible} restantes)
              </button>
            </div>
          )}
        </div>
      </section>

      {/* USD LEDGER */}
      <section className="glass-panel rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-[80px] bg-emerald-500/5 pointer-events-none"></div>
        <div className="flex justify-between items-end mb-6 border-b border-[#334155]/50 pb-4 relative z-10">
           <h2 className="text-xl font-bold text-[#f8fafc] flex items-center gap-2">
             <span className="w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]"></span>
             Sub-Libro USD (Dólares Físicos/Transf)
           </h2>
           <div className="text-right">
             <p className="text-sm text-[#94a3b8] mb-1">Saldo Final del Período</p>
             <p className={`text-2xl font-bold ${usdLedger.closingBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                U$S {usdLedger.closingBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
             </p>
           </div>
        </div>
        
        <div className="overflow-x-auto relative z-10">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[#64748b] text-xs uppercase tracking-wider border-b border-[#334155]/30">
                <th className="pb-3 px-2 font-semibold">Fecha</th>
                <th className="pb-3 px-2 font-semibold">Comprobante</th>
                <th className="pb-3 px-2 font-semibold">Concepto</th>
                <th className="pb-3 px-2 font-semibold text-right">Importe</th>
                <th className="pb-3 px-2 font-semibold text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="text-sm text-[#d1dded]">
              <tr className="border-b border-[#334155]/10 bg-[#081329]/30">
                 <td className="py-3 px-2 text-[#64748b]">{startDate && new Date(startDate).toLocaleDateString()}</td>
                 <td className="py-3 px-2"></td>
                 <td className="py-3 px-2 font-medium italic text-[#94a3b8]">Saldo Inicial (Arrastre)</td>
                 <td className="py-3 px-2 text-right"></td>
                 <td className="py-3 px-2 text-right font-medium text-[#f8fafc]">U$S {usdLedger.initialBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              </tr>
              
              {usdLedger.rows.slice(0, usdVisible).map((row: any) => (
                <tr key={row.id} className="border-b border-[#334155]/30 hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-2 whitespace-nowrap">{new Date(row.created_at).toLocaleDateString()}</td>
                  <td className="py-3 px-2 text-[#94a3b8] font-mono text-xs">{row.transaction.id.split('-')[0].toUpperCase()}</td>
                  <td className="py-3 px-2">{row.transaction.description}</td>
                  <td className={`py-3 px-2 text-right font-medium ${row.effect > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {row.effect > 0 ? '+' : ''}{row.effect.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-2 text-right font-bold text-[#f8fafc]">
                    {`U$S ${row.runningBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                  </td>
                </tr>
              ))}
              {usdLedger.rows.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-[#64748b]">Sin movimientos USD en este período.</td></tr>
              )}
            </tbody>
          </table>
          {usdVisible < usdLedger.rows.length && (
            <div className="p-4 text-center border-t border-[#334155]/30">
              <button onClick={() => setUsdVisible(v => v + 10)} className="text-sm text-[#0ea5e9] hover:text-[#38bdf8] font-medium transition-colors">
                Ver más ({usdLedger.rows.length - usdVisible} restantes)
              </button>
            </div>
          )}
        </div>
      </section>

    </div>
  );
}
