import { Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { TransactionRepository } from '../repositories/transaction.repository';

export const getBalanceSheet = async (req: Request, res: Response) => {
  try {
    // 1. Todas las cajas activas con info del cliente
    const boxes = await prisma.box.findMany({
      where: { is_active: true },
      include: { client: { select: { id: true, name: true } } }
    });

    // 2. Saldos en paralelo
    const boxesWithBalances = await Promise.all(
      boxes.map(async (box: any) => {
        const balances = await TransactionRepository.getBoxBalances(box.id);
        return { ...box, balances };
      })
    );

    // 3. Separar cajas propias (agencia) de cajas de clientes
    const agencyBoxes = boxesWithBalances.filter((b: any) => !b.client_id);
    const clientBoxes = boxesWithBalances.filter((b: any) => b.client_id);

    // 4. Cheques en cartera propios (source_client_id = null → son nuestros)
    const checks = await prisma.check.findMany({
      where: { status: 'IN_PORTFOLIO' }
    });

    // 5. AR/AP neto por cliente — todos los movimientos con client_id que no sean cheques.
    //    Incluye: cajas de clientes (FX), cajas de agencia con client_id (fondeos/cobros),
    //    y asientos de obligación (box_id=null, cheques).
    //    Los movimientos de agencia en FX NO tienen client_id → se excluyen automáticamente.
    const agencyBoxIds = agencyBoxes.map((b: any) => b.id);
    const clientNetMovements = await prisma.movement.findMany({
      where: {
        client_id: { not: null },
        check_id:  null,
        // Incluye todos los movimientos con client_id (con y sin box_id).
        // La deduplicación abajo evita doble conteo en transacciones con ambas patas.
      },
      include: { client: { select: { id: true, name: true } } },
    });
    // Deduplicar: para cada (cliente, transacción, moneda) preferir la pata con box_id.
    // Replica la misma lógica de la ficha de cliente (deduplicateByTx).
    const dedupedClientMovements = (() => {
      const groups = new Map<string, any[]>();
      for (const m of clientNetMovements as any[]) {
        const key = `${m.client_id}|${m.transaction_id ?? m.id}|${m.currency}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(m);
      }
      return [...groups.values()].flatMap(group => {
        const withBox = group.find((m: any) => m.box_id);
        return withBox ? [withBox] : group;
      });
    })();
    const arApByClient: Record<string, { name: string; netARS: number; netUSD: number }> = {};
    for (const m of dedupedClientMovements) {
      if (!m.client_id) continue;
      if (!arApByClient[m.client_id]) {
        arApByClient[m.client_id] = { name: m.client?.name || m.client_id, netARS: 0, netUSD: 0 };
      }
      const effect = m.type === 'DEBIT' ? Number(m.amount) : -Number(m.amount);
      if (m.currency === 'ARS') arApByClient[m.client_id].netARS += effect;
      else if (m.currency === 'USD') arApByClient[m.client_id].netUSD += effect;
    }
    const arApPositions = Object.entries(arApByClient).map(([clientId, pos]: any) => ({ clientId, ...pos }));
    // AP: agencia le debe al cliente (algún componente > 0). AR: cliente le debe a la agencia (< 0).
    const apPositions = arApPositions.filter((p: any) => p.netARS > 0.01 || p.netUSD > 0.01);
    const arPositions = arApPositions.filter((p: any) => p.netARS < -0.01 || p.netUSD < -0.01);
    // Usar solo el componente positivo/negativo de cada moneda para evitar doble conteo
    const totalAP_ARS = apPositions.reduce((s: number, p: any) => s + Math.max(p.netARS, 0), 0);
    const totalAR_ARS = arPositions.reduce((s: number, p: any) => s + Math.max(-p.netARS, 0), 0);
    const totalAP_USD = apPositions.reduce((s: number, p: any) => s + Math.max(p.netUSD, 0), 0);
    const totalAR_USD = arPositions.reduce((s: number, p: any) => s + Math.max(-p.netUSD, 0), 0);

    // 6. Totales ACTIVO (EFT + Cheques en cartera + Cuentas x Cobrar)
    const totalEFT_ARS  = agencyBoxes.reduce((s: number, b: any) => s + b.balances.ARS, 0);
    const totalEFT_USD  = agencyBoxes.reduce((s: number, b: any) => s + b.balances.USD, 0);
    const checksARS     = checks.filter((c: any) => c.currency === 'ARS').reduce((s: number, c: any) => s + Number(c.amount), 0);
    const checksUSD     = checks.filter((c: any) => c.currency === 'USD').reduce((s: number, c: any) => s + Number(c.amount), 0);
    const totalActivo_ARS = totalEFT_ARS + checksARS + totalAR_ARS;
    const totalActivo_USD = totalEFT_USD + checksUSD + totalAR_USD;

    // 7. Totales PASIVO (Cuentas x Pagar)
    // Las comisiones ya están embebidas como movimientos en el AR/AP neto de cada cliente.
    const totalPasivo_ARS = totalAP_ARS;
    const totalPasivo_USD = totalAP_USD;

    // 8. Patrimonio Neto
    const patrimonioNeto_ARS = totalActivo_ARS - totalPasivo_ARS;
    const patrimonioNeto_USD = totalActivo_USD - totalPasivo_USD;

    // 9. Posición Neta FX — todas las operaciones C/V de dólares acumuladas
    const fxTxs = await prisma.transaction.findMany({
      where: { type: 'FX_TRADE' },
      include: { movements: { include: { box: true } } },
    });
    let fxComprasUSD = 0, fxVentasUSD = 0, fxComprasARS = 0, fxVentasARS = 0;
    const agencyBoxIdSet = new Set(agencyBoxes.map((b: any) => b.id));
    for (const tx of fxTxs as any[]) {
      const movs: any[] = tx.movements;
      const hasClient = movs.some((m: any) => m.client_id);
      if (hasClient) {
        // FX con cliente: leer desde la caja del cliente (perspectiva agencia = inverso)
        const clientUsd = movs.find((m: any) => m.box?.client_id && m.currency === 'USD');
        const clientArs = movs.find((m: any) => m.box?.client_id && m.currency === 'ARS');
        if (!clientUsd) continue;
        if (clientUsd.type === 'DEBIT') {
          // cliente recibió USD → agencia vendió USD
          fxVentasUSD += Number(clientUsd.amount);
          if (clientArs) fxVentasARS += Number(clientArs.amount);
        } else {
          // cliente entregó USD → agencia compró USD
          fxComprasUSD += Number(clientUsd.amount);
          if (clientArs) fxComprasARS += Number(clientArs.amount);
        }
      } else {
        // FX ventanilla: leer desde caja de agencia directamente
        const agUsd = movs.find((m: any) => agencyBoxIdSet.has(m.box_id) && m.currency === 'USD');
        const agArs = movs.find((m: any) => agencyBoxIdSet.has(m.box_id) && m.currency === 'ARS');
        if (!agUsd) continue;
        if (agUsd.type === 'DEBIT') {
          // agencia recibió USD → compró
          fxComprasUSD += Number(agUsd.amount);
          if (agArs) fxComprasARS += Number(agArs.amount);
        } else {
          // agencia entregó USD → vendió
          fxVentasUSD += Number(agUsd.amount);
          if (agArs) fxVentasARS += Number(agArs.amount);
        }
      }
    }
    const fxNetUSD = fxVentasUSD - fxComprasUSD; // positivo = vendiste más USD de los que compraste

    // 10. Aportes de socios (CAPITAL_CONTRIBUTION) — para desglosar el Patrimonio Neto
    const capitalMovs = await prisma.movement.findMany({
      where: {
        box_id: { not: null },
        type: 'DEBIT',
        transaction: { category: 'CAPITAL_CONTRIBUTION' },
      },
      select: { amount: true, currency: true },
    });
    const aportesARS = (capitalMovs as any[]).filter(m => m.currency === 'ARS').reduce((s: number, m: any) => s + Number(m.amount), 0);
    const aportesUSD = (capitalMovs as any[]).filter(m => m.currency === 'USD').reduce((s: number, m: any) => s + Number(m.amount), 0);

    res.json({
      agencyBoxes: agencyBoxes.map((b: any) => ({ id: b.id, name: b.name, balances: b.balances })),
      clientBoxes: clientBoxes.map((b: any) => ({
        id: b.id,
        name: b.name,
        clientName: b.client?.name || b.name,
        balances: b.balances,
      })),
      checksInPortfolio: { count: checks.length, ARS: checksARS, USD: checksUSD },
      arPositions: arPositions.map((p: any) => ({ clientId: p.clientId, clientName: p.name, netARS: Math.max(-p.netARS, 0), netUSD: Math.max(-p.netUSD, 0) })),
      apPositions: apPositions.map((p: any) => ({ clientId: p.clientId, clientName: p.name, netARS: Math.max(p.netARS, 0), netUSD: Math.max(p.netUSD, 0) })),
      fxPosition: {
        comprasUSD: fxComprasUSD,
        ventasUSD:  fxVentasUSD,
        comprasARS: fxComprasARS,
        ventasARS:  fxVentasARS,
        netUSD:     fxNetUSD,
        totalOps:   fxTxs.length,
      },
      capitalContributions: { ARS: aportesARS, USD: aportesUSD },
      totals: {
        totalEFT_ARS,  totalEFT_USD,
        checksARS,     checksUSD,
        totalAR_ARS,   totalAR_USD,
        totalAP_ARS,   totalAP_USD,
        totalActivo_ARS, totalActivo_USD,
        totalPasivo_ARS, totalPasivo_USD,
        patrimonioNeto_ARS: patrimonioNeto_ARS,
        patrimonioNeto_USD: patrimonioNeto_USD,
        // backwards-compat
        saldoNeto_ARS: patrimonioNeto_ARS,
        saldoNeto_USD: patrimonioNeto_USD,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getDailyClosing = async (req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const boxes = await prisma.box.findMany();
    const closeout = await Promise.all(
      boxes.map(async (box: any) => {
        const balance = await TransactionRepository.getBoxBalances(box.id);
        const todaysMovements = await prisma.movement.findMany({
          where: { box_id: box.id, created_at: { gte: today } },
          include: { transaction: true }
        });
        return {
            name: box.name,
            closingBalance: balance,
            movementsToday: todaysMovements.length
        };
      })
    );

    const checks = await prisma.check.findMany({ where: { status: 'IN_PORTFOLIO' } });
    const checksBalanceARS = checks.filter((c: any) => c.currency === 'ARS').reduce((acc: number, c: any) => acc + Number(c.amount), 0);
    const checksBalanceUSD = checks.filter((c: any) => c.currency === 'USD').reduce((acc: number, c: any) => acc + Number(c.amount), 0);

    const recentTransactions = await prisma.transaction.findMany({
      take: 5,
      orderBy: { created_at: 'desc' },
      include: { movements: { include: { box: true } } }
    });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const periodTransactions = await prisma.transaction.findMany({
      where: { operation_date: { gte: thirtyDaysAgo } },
      include: { movements: true }
    });

    const chartMap: Record<string, { date: string, Ingresos: number, Egresos: number }> = {};
    for (let i = 29; i >= 0; i--) {
       const d = new Date();
       d.setDate(d.getDate() - i);
       const dateStr = d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
       chartMap[dateStr] = { date: dateStr, Ingresos: 0, Egresos: 0 };
    }
    periodTransactions.forEach((tx: any) => {
       const dateStr = new Date(tx.operation_date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
       if (!chartMap[dateStr]) return;
       const amount = tx.movements.find((m: any) => m.currency === 'ARS')?.amount || 0;
       if (tx.type === 'INCOME') chartMap[dateStr].Ingresos += Number(amount);
       else if (tx.type === 'OUTCOME') chartMap[dateStr].Egresos += Number(amount);
    });
    const chartData = Object.values(chartMap);

    res.json({
      date: new Date().toISOString(),
      treasuryStatus: closeout,
      metrics: {
          checksInPortfolio: checks.length,
          checksBalanceARS,
          checksBalanceUSD
      },
      recentTransactions,
      chartData
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ── Saldo acumulado de cajas propias hasta una fecha ──────────────────────
export const getAgencyBalance = async (req: Request, res: Response) => {
  try {
    const { date } = req.query as Record<string, string>;
    const to = date
      ? new Date(`${date}T23:59:59.999-03:00`)
      : new Date();

    const agencyBoxes = await prisma.box.findMany({
      where: { is_active: true, client_id: null },
      select: { id: true },
    });

    let ARS = 0, USD = 0;
    for (const box of agencyBoxes) {
      const movements = await prisma.movement.findMany({
        where: {
          box_id: box.id,
          transaction: { operation_date: { lte: to } },
        },
        select: { amount: true, type: true, currency: true },
      });
      for (const mov of movements) {
        const sign = mov.type === 'DEBIT' ? 1 : -1;
        if (mov.currency === 'ARS') ARS += sign * Number(mov.amount);
        else if (mov.currency === 'USD') USD += sign * Number(mov.amount);
      }
    }

    res.json({ ARS, USD });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

// ── Resultado Diario (P&L) ─────────────────────────────────────────────────
// Calcula ingresos, gastos y ganancia neta del día (o período) del libro completo.
// Ingresos: transacciones tipo INCOME + comisiones de compra de cheques (CHECK_TRADE/COMMISSION con caja DEBIT)
// Gastos:   transacciones tipo OUTCOME + comisiones de venta de cheques (CHECK_TRADE/COMMISSION con caja CREDIT)
export const getDailyPL = async (req: Request, res: Response) => {
  try {
    const { date, startDate, endDate } = req.query as Record<string, string>;

    let from: Date, to: Date;
    if (startDate && endDate) {
      from = new Date(startDate);
      to   = new Date(endDate);
      to.setHours(23, 59, 59, 999); // cubrir todo el día final
    } else {
      const d = date ? new Date(date) : new Date();
      from = new Date(d); from.setHours(0, 0, 0, 0);
      to   = new Date(d); to.setHours(23, 59, 59, 999);
    }

    // Todas las transacciones del período — incluir todos los movimientos
    const txs = await prisma.transaction.findMany({
      where: { operation_date: { gte: from, lte: to } },
      include: {
        movements: true,  // todos: caja + cliente + cheque (para detectar BUY/SELL)
        user: { select: { name: true } },
      },
      orderBy: { operation_date: 'asc' },
    });

    let totalIncome = 0;
    let totalExpense = 0;

    const incomeLines: any[] = [];
    const expenseLines: any[] = [];

    // Categorías que NO son P&L operativo (movimientos de balance, no de resultado)
    const NON_PL_INCOME   = new Set(['CAPITAL_CONTRIBUTION', 'PARTNER_WITHDRAWAL', 'CLIENT_FUNDING', 'CHECK_DEPOSIT']);
    // Solo estas categorías constituyen un GASTO real (costos operativos)
    const PL_EXPENSE_CATS = new Set(['OPERATING_EXPENSE', 'SALARY', 'COMMISSION', 'INTEREST_INCOME', 'OTHER']);

    for (const tx of txs) {
      const allMovs    = tx.movements as any[];
      const boxMovs    = allMovs.filter(m => m.box_id);
      const arsDebit   = boxMovs.filter(m => m.type === 'DEBIT'  && m.currency === 'ARS').reduce((s, m) => s + Number(m.amount), 0);
      const arsCredit  = boxMovs.filter(m => m.type === 'CREDIT' && m.currency === 'ARS').reduce((s, m) => s + Number(m.amount), 0);

      // ¿El egreso tiene un movimiento de cliente? → es cancelación de deuda (AP), NO gasto P&L
      const hasClientMov = allMovs.some(m => m.client_id);

      // INCOME: excluir fondeos de capital y cobros de deuda (AR)
      if (tx.type === 'INCOME' && arsDebit > 0 && !NON_PL_INCOME.has((tx as any).category)) {
        totalIncome += arsDebit;
        incomeLines.push({ id: tx.id, type: tx.type, category: tx.category, description: tx.description, amount: arsDebit, date: tx.operation_date, user: (tx as any).user?.name });
      }

      // OUTCOME: solo contar como gasto P&L si:
      //   1. Es una categoría de costo real (OPERATING_EXPENSE, SALARY, etc.)
      //   2. Y NO está ligado a un cliente (si tiene client_id es pago de deuda AP, no gasto)
      if (tx.type === 'OUTCOME' && arsCredit > 0 && PL_EXPENSE_CATS.has((tx as any).category) && !hasClientMov) {
        totalExpense += arsCredit;
        expenseLines.push({ id: tx.id, type: tx.type, category: tx.category, description: tx.description, amount: arsCredit, date: tx.operation_date, user: (tx as any).user?.name });
      }

      // CHECK_TRADE: comisión en campo `commission` (sin movimiento de caja)
      // BUY  → movimiento de cheque tipo CREDIT (cheque sale del vendedor) → ingreso
      // SELL → movimiento de cheque tipo DEBIT  (cheque entra al comprador) → gasto
      if (tx.type === 'CHECK_TRADE' && Number((tx as any).commission) > 0) {
        const checkMov   = allMovs.find(m => m.check_id);
        const commAmount = Number((tx as any).commission);
        const isBuy      = !checkMov || checkMov.type === 'CREDIT';
        if (isBuy) {
          totalIncome += commAmount;
          incomeLines.push({ id: tx.id, type: 'COMMISSION_INCOME', category: 'COMMISSION', description: tx.description, amount: commAmount, date: tx.operation_date, user: (tx as any).user?.name });
        } else {
          totalExpense += commAmount;
          expenseLines.push({ id: tx.id, type: 'COMMISSION_EXPENSE', category: 'COMMISSION', description: tx.description, amount: commAmount, date: tx.operation_date, user: (tx as any).user?.name });
        }
      }
    }

    const netResult = totalIncome - totalExpense;

    res.json({
      period: { from: from.toISOString(), to: to.toISOString() },
      totalIncome,
      totalExpense,
      netResult,
      incomeLines,
      expenseLines,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
