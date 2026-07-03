'use client';
import { useEffect, useState, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { fetchApi } from '@/services/api';
import { getUserId } from '@/services/auth';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { inputClass, selectClass } from '@/components/ui/forms';

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

  if (loading) return <div className="animate-pulse p-6 text-muted">Cargando ficha de cliente...</div>;
  if (!client) return <div className="p-6 text-negative">Error: Cliente no encontrado</div>;

  return (
    <div className="relative mx-auto h-full w-full max-w-[1400px] animate-in fade-in duration-500 pb-12">

      {/* Opening Balance Modal */}
      {showOBModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-in fade-in duration-200">
          <form onSubmit={handleOpeningBalance} className="flex w-full max-w-md flex-col space-y-5 rounded-[14px] border border-line bg-surface p-8 shadow-2xl animate-in zoom-in-95 duration-300">
            <h2 className="text-2xl font-semibold text-ink">Registrar Saldo Inicial</h2>
            <p className="text-sm text-faint">Acreedor = le debemos al cliente &middot; Deudor = el cliente nos debe</p>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-8 text-xs text-faint">ARS</span>
                <input
                  type="number" min="0" step="0.01" placeholder="0.00"
                  value={obForm.arsAmount}
                  onChange={e => setObForm(f => ({ ...f, arsAmount: e.target.value }))}
                  className={`${inputClass} flex-1`}
                />
                <select
                  value={obForm.arsDir}
                  onChange={e => setObForm(f => ({ ...f, arsDir: e.target.value }))}
                  className={`${selectClass} w-auto px-3 text-sm`}
                >
                  <option value="ACREEDOR">Acreedor</option>
                  <option value="DEUDOR">Deudor</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-8 text-xs text-faint">USD</span>
                <input
                  type="number" min="0" step="0.01" placeholder="0.00"
                  value={obForm.usdAmount}
                  onChange={e => setObForm(f => ({ ...f, usdAmount: e.target.value }))}
                  className={`${inputClass} flex-1`}
                />
                <select
                  value={obForm.usdDir}
                  onChange={e => setObForm(f => ({ ...f, usdDir: e.target.value }))}
                  className={`${selectClass} w-auto px-3 text-sm`}
                >
                  <option value="ACREEDOR">Acreedor</option>
                  <option value="DEUDOR">Deudor</option>
                </select>
              </div>
            </div>
            <div className="flex space-x-3 pt-2">
              <button type="button" onClick={() => { setShowOBModal(false); setObForm(emptyOB()); }} className="flex-1 rounded-xl border border-line px-4 py-3 font-medium text-muted transition-colors hover:bg-track hover:text-ink">
                Cancelar
              </button>
              <button type="submit" disabled={obSaving || (Number(obForm.arsAmount) <= 0 && Number(obForm.usdAmount) <= 0)} className="flex-1 rounded-xl bg-positive px-4 py-3 font-bold text-white shadow-sm transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                {obSaving ? 'Guardando...' : 'Registrar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Client Adjustment Modal */}
      {showAdjModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-in fade-in duration-200">
          <form onSubmit={handleClientAdjustment} className="flex w-full max-w-md flex-col space-y-5 rounded-[14px] border border-line bg-surface p-8 shadow-2xl animate-in zoom-in-95 duration-300">
            <h2 className="text-2xl font-semibold text-ink">Ajuste de Cuenta Corriente</h2>
            <p className="text-sm text-faint">Registra un cargo o abono sin movimiento de caja.</p>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="number" min="0.01" step="0.01" placeholder="Importe" required
                  value={adjForm.amount}
                  onChange={e => setAdjForm(f => ({ ...f, amount: e.target.value }))}
                  className={`${inputClass} flex-1`}
                />
                <select
                  value={adjForm.currency}
                  onChange={e => setAdjForm(f => ({ ...f, currency: e.target.value }))}
                  className={`${selectClass} w-24 px-3 text-sm`}
                >
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold uppercase text-muted">Tipo de ajuste</label>
                <div className="flex gap-3">
                  <button type="button"
                    onClick={() => setAdjForm(f => ({ ...f, direction: 'ACREEDOR' }))}
                    className={`flex-1 rounded-xl border py-3 text-sm font-medium transition-all ${
                      adjForm.direction === 'ACREEDOR'
                        ? 'border-positive bg-positive-bg text-positive'
                        : 'border-line text-muted hover:bg-track hover:text-ink'
                    }`}
                  >
                    Abono / Crédito
                    <span className="block text-[10px] font-normal opacity-70">Le acreditamos al cliente</span>
                  </button>
                  <button type="button"
                    onClick={() => setAdjForm(f => ({ ...f, direction: 'DEUDOR' }))}
                    className={`flex-1 rounded-xl border py-3 text-sm font-medium transition-all ${
                      adjForm.direction === 'DEUDOR'
                        ? 'border-negative bg-negative-bg text-negative'
                        : 'border-line text-muted hover:bg-track hover:text-ink'
                    }`}
                  >
                    Cargo / Débito
                    <span className="block text-[10px] font-normal opacity-70">Le cargamos al cliente</span>
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-muted">Concepto (opcional)</label>
                <input
                  type="text" placeholder="Ej: Comisión, descuento, diferencia..."
                  value={adjForm.description}
                  onChange={e => setAdjForm(f => ({ ...f, description: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="flex space-x-3 pt-2">
              <button type="button" onClick={() => { setShowAdjModal(false); setAdjForm(emptyAdj()); }} className="flex-1 rounded-xl border border-line px-4 py-3 font-medium text-muted transition-colors hover:bg-track hover:text-ink">
                Cancelar
              </button>
              <button type="submit" disabled={adjSaving || Number(adjForm.amount) <= 0} className="flex-1 rounded-xl bg-warn px-4 py-3 font-bold text-white shadow-sm transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                {adjSaving ? 'Guardando...' : 'Registrar Ajuste'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-in fade-in duration-200">
          <form onSubmit={handleUpdateClient} className="flex w-full max-w-md flex-col space-y-5 rounded-[14px] border border-line bg-surface p-8 shadow-2xl animate-in zoom-in-95 duration-300">
            <h2 className="text-2xl font-semibold text-ink">Editar Información</h2>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-muted">Nombre / Razón Social</label>
              <input type="text" required value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className={inputClass} placeholder="Ingresar nombre..." />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-muted">Teléfono (Opcional)</label>
              <input type="text" value={editForm.tax_id} onChange={e => setEditForm({ ...editForm, tax_id: e.target.value })} className={inputClass} placeholder="Ej: 20-12345678-9" />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-muted">Email (Opcional)</label>
              <input type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} className={inputClass} placeholder="correo@ejemplo.com" />
            </div>

            <div className="flex space-x-3 pt-2">
              <button type="button" onClick={() => setIsEditing(false)} className="flex-1 rounded-xl border border-line px-4 py-3 font-medium text-muted transition-colors hover:bg-track hover:text-ink">
                Cancelar
              </button>
              <button type="submit" disabled={isSaving} className={`flex-1 rounded-xl bg-ink px-4 py-3 font-bold text-white shadow-sm transition-all hover:opacity-85 ${isSaving ? 'cursor-not-allowed opacity-70' : ''}`}>
                {isSaving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </form>
        </div>
      )}

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center space-x-4">
          <button onClick={() => window.history.back()} className="rounded-full border border-line bg-surface p-2 text-muted transition-colors hover:text-ink">
             ← Volver
          </button>
          <div>
            <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-ink">Resumen de Cuenta</h1>
            <div className="mt-2 flex items-center space-x-3">
               <p className="text-lg font-medium text-accent">{client.name}</p>
               {client.tax_id && <span className="text-sm text-muted">| {client.tax_id}</span>}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex space-x-4 rounded-xl border border-line bg-surface px-4 py-2">
             <div>
               <label className="mb-1 block text-[10px] font-bold uppercase text-faint">Desde</label>
               <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent text-sm text-ink focus:outline-none" />
             </div>
             <div className="h-8 w-px self-center bg-line"></div>
             <div>
               <label className="mb-1 block text-[10px] font-bold uppercase text-faint">Hasta</label>
               <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent text-sm text-ink focus:outline-none" />
             </div>
          </div>
          <button onClick={exportClientPdf} className="rounded-xl border border-line bg-surface px-4 py-3 font-medium text-ink-soft shadow-sm transition-colors hover:bg-track">
             📄 Exportar PDF
          </button>
          <button onClick={exportClientExcel} className="rounded-xl border border-positive/20 bg-positive-bg px-4 py-3 font-medium text-positive shadow-sm transition-colors hover:opacity-80">
             📊 Exportar Excel
          </button>
          <button onClick={() => setShowOBModal(true)} className="rounded-xl border border-positive/20 bg-positive-bg px-4 py-3 font-medium text-positive shadow-sm transition-colors hover:opacity-80">
             + Saldo Inicial
          </button>
          <button onClick={() => setShowAdjModal(true)} className="rounded-xl border border-warn/20 bg-warn-bg px-4 py-3 font-medium text-warn shadow-sm transition-colors hover:opacity-80">
             ± Ajuste
          </button>
          <button onClick={openEditModal} className="rounded-xl border border-line bg-surface px-4 py-3 font-medium text-muted shadow-sm transition-colors hover:bg-track hover:text-ink">
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
          <Card className="mb-6 flex flex-wrap items-center gap-4 px-6 py-4">
            <div className="min-w-[160px] flex-1">
              <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-faint">Saldo Cheques</p>
              <p className={`text-xl font-bold ${checkBal >= 0 ? 'text-accent' : 'text-negative'}`}>
                $ {checkBal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="text-2xl font-thin text-line-hover">+</div>
            <div className="min-w-[160px] flex-1">
              <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-faint">Saldo ARS</p>
              <p className={`text-xl font-bold ${arsBal >= 0 ? 'text-positive' : 'text-negative'}`}>
                $ {arsBal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="h-10 w-px self-center bg-line"></div>
            <div className="min-w-[200px] flex-1">
              <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-faint">Subtotal ARS + Cheques</p>
              <p className={`text-2xl font-extrabold ${netARS >= 0 ? 'text-positive' : 'text-negative'}`}>
                $ {netARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
            {(usdBal !== 0) && (
              <>
                <div className="h-10 w-px self-center bg-line"></div>
                <div className="min-w-[160px] flex-1">
                  <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-faint">Saldo USD</p>
                  <p className={`text-xl font-bold ${usdBal >= 0 ? 'text-ink' : 'text-negative'}`}>
                    U$S {usdBal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </>
            )}
          </Card>
        );
      })()}

      {/* PENDING CHECKS — awaiting settlement */}
      {client.destination_checks && client.destination_checks.length > 0 && (
        <Card className="mb-6 p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-warn"></span>
            <h2 className="text-lg font-bold text-ink">Cheques entregados al cliente</h2>
            <span className="rounded-full bg-warn-bg px-2 py-0.5 text-xs font-bold text-warn">{client.destination_checks.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wider text-faint">
                  <th className="px-3 pb-3 font-semibold">Banco</th>
                  <th className="px-3 pb-3 font-semibold">N° Cheque</th>
                  <th className="px-3 pb-3 font-semibold">Vencimiento</th>
                  <th className="px-3 pb-3 text-right font-semibold">Monto</th>
                  <th className="px-3 pb-3 font-semibold">Vendedor</th>
                  <th className="px-3 pb-3 text-center font-semibold">Acción</th>
                </tr>
              </thead>
              <tbody>
                {client.destination_checks.slice(0, destChecksVisible).map((ch: any) => (
                  <tr key={ch.id} className="border-b border-line transition-colors hover:bg-row-hover">
                    <td className="px-3 py-3 text-ink">{ch.bank_name}</td>
                    <td className="px-3 py-3 font-mono text-muted">{ch.check_number}</td>
                    <td className="px-3 py-3 text-muted">{new Date(ch.due_date).toLocaleDateString('es-AR')}</td>
                    <td className="px-3 py-3 text-right font-bold text-positive">$ {Number(ch.amount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                    <td className="px-3 py-3 text-xs text-faint">{ch.source_client?.name || <span className="italic">—</span>}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleReturnCheck(ch.id)}
                          disabled={checkActionLoading === ch.id}
                          className="rounded-lg border border-negative/30 bg-negative-bg px-3 py-1.5 text-xs font-bold text-negative transition-all hover:opacity-80 disabled:opacity-50"
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
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => setDestChecksVisible(prev => prev + 10)}
                className="rounded-lg border border-warn/20 bg-warn-bg px-4 py-2 text-sm font-medium text-warn transition-all hover:opacity-80"
              >
                Ver más ({client.destination_checks.length - destChecksVisible} restantes)
              </button>
            </div>
          )}
        </Card>
      )}

      {/* CHECKS LEDGER */}
      <Card className="mb-8 p-6">
        <div className="mb-6 flex items-end justify-between border-b border-line pb-4">
           <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
             <span className="h-3 w-3 rounded-full bg-accent"></span>
             Sub-Libro Cheques (Valores de Terceros)
           </h2>
           <div className="text-right">
             <p className="mb-1 text-sm text-muted">Saldo en Cartera</p>
             <p className={`text-2xl font-bold ${checksLedger.closingBalance >= 0 ? 'text-positive' : 'text-negative'}`}>
                $ {checksLedger.closingBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
             </p>
           </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wider text-faint">
                <th className="px-2 pb-3 font-semibold">Fecha</th>
                <th className="px-2 pb-3 font-semibold">Comprobante</th>
                <th className="px-2 pb-3 font-semibold">Concepto</th>
                <th className="px-2 pb-3 text-right font-semibold">Importe Nominal</th>
                <th className="px-2 pb-3 text-right font-semibold">Saldo Combinado</th>
              </tr>
            </thead>
            <tbody className="text-sm text-ink">
              <tr className="border-b border-line bg-canvas">
                 <td className="px-2 py-3 text-faint">{startDate && new Date(startDate).toLocaleDateString()}</td>
                 <td className="px-2 py-3"></td>
                 <td className="px-2 py-3 font-medium italic text-muted">Saldo Inicial (Arrastre)</td>
                 <td className="px-2 py-3 text-right"></td>
                 <td className="px-2 py-3 text-right font-medium text-ink">$ {checksLedger.initialBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              </tr>

              {checksLedger.rows.slice(0, checksVisible).map((row: any) => (
                <tr key={row.id} className="border-b border-line transition-colors hover:bg-row-hover">
                  <td className="whitespace-nowrap px-2 py-3">{new Date(row.created_at).toLocaleDateString()}</td>
                  <td className="px-2 py-3 font-mono text-xs text-muted">{row.transaction.id.split('-')[0].toUpperCase()}</td>
                  <td className="px-2 py-3">{row.transaction.description}</td>
                  <td className={`px-2 py-3 text-right font-medium ${row.effect > 0 ? 'text-positive' : 'text-negative'}`}>
                    {row.effect > 0 ? '+' : ''}{row.effect.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-2 py-3 text-right font-bold text-ink">$ {row.runningBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
              {checksLedger.rows.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-faint">Sin movimientos de cheques en este período.</td></tr>
              )}
            </tbody>
          </table>
          {checksVisible < checksLedger.rows.length && (
            <div className="border-t border-line p-4 text-center">
              <button onClick={() => setChecksVisible(v => v + 10)} className="text-sm font-medium text-accent transition-colors hover:underline">
                Ver más ({checksLedger.rows.length - checksVisible} restantes)
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* ARS LEDGER */}
      <Card className="mb-8 p-6">
        <div className="mb-6 flex items-end justify-between border-b border-line pb-4">
           <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
             <span className="h-3 w-3 rounded-full bg-accent"></span>
             Sub-Libro ARS (Pesos, Cobros y Pagos)
           </h2>
           <div className="text-right">
             <p className="mb-1 text-sm text-muted">Saldo Final del Período</p>
             <p className={`text-2xl font-bold ${arsLedger.closingBalance >= 0 ? 'text-positive' : 'text-negative'}`}>
                $ {arsLedger.closingBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
             </p>
           </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wider text-faint">
                <th className="px-2 pb-3 font-semibold">Fecha</th>
                <th className="px-2 pb-3 font-semibold">Comprobante</th>
                <th className="px-2 pb-3 font-semibold">Concepto</th>
                <th className="px-2 pb-3 text-right font-semibold">Importe</th>
                <th className="px-2 pb-3 text-right font-semibold">Saldo</th>
              </tr>
            </thead>
            <tbody className="text-sm text-ink">
              {/* Initial Balance Row */}
              <tr className="border-b border-line bg-canvas">
                 <td className="px-2 py-3 text-faint">{startDate && new Date(startDate).toLocaleDateString()}</td>
                 <td className="px-2 py-3"></td>
                 <td className="px-2 py-3 font-medium italic text-muted">Saldo Inicial (Arrastre)</td>
                 <td className="px-2 py-3 text-right"></td>
                 <td className="px-2 py-3 text-right font-medium text-ink">$ {arsLedger.initialBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
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
                  <tr key={row.id} className="border-b border-line transition-colors hover:bg-row-hover">
                    <td className="whitespace-nowrap px-2 py-3">{new Date(row.created_at).toLocaleDateString()}</td>
                    <td className="px-2 py-3 font-mono text-xs text-muted">{row.transaction.id.split('-')[0].toUpperCase()}</td>
                    <td className="px-2 py-3">
                      {isCommissionRow
                        ? <><span className="font-medium text-warn">Comisión</span><span className="ml-2 text-xs text-faint">({row.transaction.description})</span></>
                        : row.transaction.description}
                    </td>
                    <td className={`px-2 py-3 text-right font-medium ${row.effect > 0 ? 'text-positive' : 'text-negative'}`}>
                      {row.effect > 0 ? '+' : ''}{row.effect.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-2 py-3 text-right font-bold text-ink">
                      {`$ ${row.runningBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                    </td>
                  </tr>
                );
              })}
              {arsLedger.rows.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-faint">Sin movimientos ARS en este período.</td></tr>
              )}
            </tbody>
          </table>
          {arsVisible < arsLedger.rows.length && (
            <div className="border-t border-line p-4 text-center">
              <button onClick={() => setArsVisible(v => v + 10)} className="text-sm font-medium text-accent transition-colors hover:underline">
                Ver más ({arsLedger.rows.length - arsVisible} restantes)
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* USD LEDGER */}
      <Card className="p-6">
        <div className="mb-6 flex items-end justify-between border-b border-line pb-4">
           <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
             <span className="h-3 w-3 rounded-full bg-positive"></span>
             Sub-Libro USD (Dólares Físicos/Transf)
           </h2>
           <div className="text-right">
             <p className="mb-1 text-sm text-muted">Saldo Final del Período</p>
             <p className={`text-2xl font-bold ${usdLedger.closingBalance >= 0 ? 'text-positive' : 'text-negative'}`}>
                U$S {usdLedger.closingBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
             </p>
           </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wider text-faint">
                <th className="px-2 pb-3 font-semibold">Fecha</th>
                <th className="px-2 pb-3 font-semibold">Comprobante</th>
                <th className="px-2 pb-3 font-semibold">Concepto</th>
                <th className="px-2 pb-3 text-right font-semibold">Importe</th>
                <th className="px-2 pb-3 text-right font-semibold">Saldo</th>
              </tr>
            </thead>
            <tbody className="text-sm text-ink">
              <tr className="border-b border-line bg-canvas">
                 <td className="px-2 py-3 text-faint">{startDate && new Date(startDate).toLocaleDateString()}</td>
                 <td className="px-2 py-3"></td>
                 <td className="px-2 py-3 font-medium italic text-muted">Saldo Inicial (Arrastre)</td>
                 <td className="px-2 py-3 text-right"></td>
                 <td className="px-2 py-3 text-right font-medium text-ink">U$S {usdLedger.initialBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              </tr>

              {usdLedger.rows.slice(0, usdVisible).map((row: any) => (
                <tr key={row.id} className="border-b border-line transition-colors hover:bg-row-hover">
                  <td className="whitespace-nowrap px-2 py-3">{new Date(row.created_at).toLocaleDateString()}</td>
                  <td className="px-2 py-3 font-mono text-xs text-muted">{row.transaction.id.split('-')[0].toUpperCase()}</td>
                  <td className="px-2 py-3">{row.transaction.description}</td>
                  <td className={`px-2 py-3 text-right font-medium ${row.effect > 0 ? 'text-positive' : 'text-negative'}`}>
                    {row.effect > 0 ? '+' : ''}{row.effect.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-2 py-3 text-right font-bold text-ink">
                    {`U$S ${row.runningBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                  </td>
                </tr>
              ))}
              {usdLedger.rows.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-faint">Sin movimientos USD en este período.</td></tr>
              )}
            </tbody>
          </table>
          {usdVisible < usdLedger.rows.length && (
            <div className="border-t border-line p-4 text-center">
              <button onClick={() => setUsdVisible(v => v + 10)} className="text-sm font-medium text-accent transition-colors hover:underline">
                Ver más ({usdLedger.rows.length - usdVisible} restantes)
              </button>
            </div>
          )}
        </div>
      </Card>

    </div>
  );
}
