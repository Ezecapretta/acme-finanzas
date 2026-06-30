import { Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { TransactionRepository } from '../repositories/transaction.repository';
import { parseArgDate } from '../utils/dates';

export const getTransactions = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, category, type, user_id, paginate, page = '1', limit = '50' } = req.query;
    const where: any = {};
    if (startDate && endDate) {
      where.operation_date = { gte: new Date(startDate as string), lte: new Date(endDate as string) };
    }
    if (category) where.category = category;
    if (type) where.type = type;
    if (user_id) where.created_by = user_id;

    if (paginate === 'true') {
      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const skip = (pageNum - 1) * limitNum;

      const [txs, total] = await Promise.all([
        prisma.transaction.findMany({
          where,
          include: {
            movements: { include: { box: true, client: true, check: true } },
            user: { select: { id: true, name: true } }
          },
          orderBy: { created_at: 'desc' },
          skip,
          take: limitNum
        }),
        prisma.transaction.count({ where })
      ]);

      return res.json({
        data: txs,
        meta: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    }

    // Retro-compatibilidad para requests sin paginación (Array puro)
    const txs = await prisma.transaction.findMany({
      where,
      include: {
        movements: {
          include: { box: true, client: true, check: true }
        },
        user: { select: { id: true, name: true } }
      },
      orderBy: { created_at: 'desc' }
    });
    res.json(txs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createTransfer = async (req: Request, res: Response) => {
  const { fromBoxId, toBoxId, amount, currency, description, userId, confirm } = req.body;
  if (!userId) return res.status(400).json({ error: 'Operador no identificado. Sesión inválida.' });
  if (!fromBoxId || !toBoxId || !amount || !currency || !description) return res.status(400).json({ error: 'Faltan campos requeridos.' });
  if (Number(amount) <= 0) return res.status(400).json({ error: 'El importe debe ser mayor a cero.' });

  // ── Overdraft check ──────────────────────────────────────────────────────
  if (!confirm) {
    const bal = await TransactionRepository.getBoxBalances(fromBoxId);
    const current = currency === 'USD' ? bal.USD : bal.ARS;
    const projected = current - Number(amount);
    if (projected < 0) {
      const box = await prisma.box.findUnique({ where: { id: fromBoxId }, select: { name: true } });
      return res.status(409).json({
        requiresConfirmation: true,
        overdrafts: [{ boxName: box?.name ?? 'Caja origen', clientName: null, currency, currentBalance: current, projectedBalance: projected }],
      });
    }
  }

  try {
    const result = await TransactionRepository.transferFunds({
      fromBoxId,
      toBoxId,
      amount: Number(amount),
      currency,
      description,
      userId,
      confirm: confirm === true,
    });
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const createIncome = async (req: Request, res: Response) => {
  const { boxId, clientId, checkId, amount, currency, description, userId, category, operationDate } = req.body;
  const opDate = operationDate ? new Date(operationDate + 'T12:00:00') : undefined;
  if (!userId) return res.status(400).json({ error: 'Operador no identificado. Sesión inválida.' });
  if (!amount || !currency || !description) return res.status(400).json({ error: 'Faltan campos requeridos: amount, currency, description.' });
  if (Number(amount) <= 0) return res.status(400).json({ error: 'El importe debe ser mayor a cero.' });

  // CHECK_DEPOSIT: carga administrativa del cheque (Nuevo Ingreso).
  // El cheque queda en PENDING_PURCHASE — NO es cartera propia todavía.
  // La obligación financiera con el cliente se genera recién en la operación de Compra.
  if (category === 'CHECK_DEPOSIT') {
    try {
      const result = await prisma.$transaction(async (tx: any) => {
        if (checkId) {
          const existing = await tx.check.findUnique({ where: { id: checkId } });
          if (!existing) throw new Error('Cheque no encontrado.');
          if (existing.status !== 'PENDING_PURCHASE') {
            throw new Error('El cheque ya fue procesado y no puede re-ingresarse.');
          }
        }
        const transaction = await tx.transaction.create({
          data: { type: 'CHECK_TRADE', category: 'CHECK_DEPOSIT', description, created_by: userId, ...(opDate && { operation_date: opDate }) },
        });
        // Registro administrativo del cheque (solo trazabilidad, sin movimiento financiero)
        await tx.movement.create({
          data: {
            transaction_id: transaction.id,
            box_id:    null,
            client_id: clientId || null,
            check_id:  checkId  || null,
            type:      'DEBIT',
            amount:    Number(amount),
            currency,
          },
        });
        return transaction;
      });
      return res.status(201).json(result);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }

  // Ingreso de efectivo normal
  if (!boxId) return res.status(400).json({ error: 'Se requiere boxId para ingresos de efectivo.' });
  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const transaction = await tx.transaction.create({
        data: { type: 'INCOME', category: category || 'OTHER', description, created_by: userId, ...(opDate && { operation_date: opDate }) }
      });
      // Movimiento de caja: entra efectivo
      await tx.movement.create({
        data: {
          transaction_id: transaction.id,
          box_id: boxId,
          client_id: clientId || null,
          check_id: null,
          type: 'DEBIT',
          amount: Number(amount),
          currency
        }
      });
      // Si el ingreso está vinculado a un cliente, crear contrapartida contable (box_id=null)
      // SOLO si el cliente tiene una obligación pendiente (AP) en esa moneda.
      // Esto evita crear falsos PASIVOS cuando el ingreso es solo efectivo sin deuda previa.
      if (clientId) {
        const pendingMovs = await tx.movement.findMany({
          where: { client_id: clientId, box_id: null, check_id: null, currency },
          select: { type: true, amount: true },
        });
        const pendingAP = pendingMovs.reduce((net: number, m: any) => {
          return net + (m.type === 'DEBIT' ? Number(m.amount) : -Number(m.amount));
        }, 0);
        // Solo hay AP real si el neto es positivo (agencia le debe al cliente)
        if (pendingAP > 0.01) {
          const cancelAmount = Math.min(Number(amount), pendingAP);
          await tx.movement.create({
            data: {
              transaction_id: transaction.id,
              box_id:    null,
              client_id: clientId,
              check_id:  null,
              type:      'CREDIT', // Cancela el AP pendiente
              amount:    cancelAmount,
              currency,
            }
          });
        } else if (pendingAP < -0.01) {
          // AR pendiente: el cliente nos debe plata (e.g. comprador de cheques pagando en efectivo)
          // Crear DEBIT null-box para cancelar el AR
          const pendingAR = Math.abs(pendingAP);
          const cancelAmount = Math.min(Number(amount), pendingAR);
          await tx.movement.create({
            data: {
              transaction_id: transaction.id,
              box_id:    null,
              client_id: clientId,
              check_id:  null,
              type:      'DEBIT', // Cancela el AR pendiente
              amount:    cancelAmount,
              currency,
            }
          });
        }
      }
      return transaction;
    });
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const createCheckTrade = async (req: Request, res: Response) => {
  const { checkIds, sellerClientId, buyerClientId, description, userId, commissionAmount, agencyBoxId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Operador no identificado.' });
  if (!Array.isArray(checkIds) || checkIds.length === 0) return res.status(400).json({ error: 'Se requiere al menos un cheque.' });

  // Inferir tipo de operación:
  // BUY  → la agencia compra del cliente (sellerClientId set, buyerClientId null)
  // SELL → la agencia vende al cliente/tercero (buyerClientId set, sellerClientId null)
  // TRANSFER → ambos seteados (cliente a cliente, comisión de agencia)
  const isBuy      = !!sellerClientId && !buyerClientId;
  const isSell     = !!buyerClientId  && !sellerClientId;
  const isTransfer = !!sellerClientId && !!buyerClientId;

  const targetStatus = (isBuy || isTransfer) && !buyerClientId ? 'IN_PORTFOLIO' : 'DELIVERED';
  const comm = commissionAmount && Number(commissionAmount) > 0 ? Number(commissionAmount) : 0;

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const transaction = await tx.transaction.create({
        data: {
          type:        'CHECK_TRADE',
          category:    comm > 0 ? 'COMMISSION' : 'OTHER',
          description: description || (isBuy ? 'Compra de Cheques' : isSell ? 'Venta de Cheques' : 'C/V Cheques'),
          created_by:  userId,
          ...(comm > 0 ? { commission: comm } : {}),
        },
      });

      let sellerTotalARS = 0;
      let buyerTotalARS  = 0;

      for (const checkId of checkIds) {
        const check = await tx.check.findUnique({ where: { id: checkId } });
        if (!check) continue;

        // Validar estado correcto para cada tipo de operación
        if (isBuy && check.status !== 'PENDING_PURCHASE') {
          throw new Error(`El cheque ${check.check_number} no está en estado Pendiente de Compra.`);
        }
        if ((isSell || isTransfer) && check.status !== 'IN_PORTFOLIO') {
          throw new Error(`El cheque ${check.check_number} no está en cartera para ser vendido.`);
        }

        await tx.check.update({
          where: { id: checkId },
          data: {
            status:                isBuy ? 'IN_PORTFOLIO' : 'DELIVERED',
            destination_client_id: buyerClientId || null,
            ...(isBuy ? { source_client_id: check.source_client_id } : {}),
          },
        });

        const checkAmount = Number(check.amount);

        // ── BUY: cheque sale del lado del vendedor ──────────────────────────
        if (sellerClientId) {
          await tx.movement.create({
            data: {
              transaction_id: transaction.id,
              box_id:    null,
              client_id: sellerClientId,
              check_id:  checkId,
              type:      'CREDIT',   // cheque sale de la cuenta del vendedor
              amount:    checkAmount,
              currency:  check.currency,
            },
          });
          if (check.currency === 'ARS') sellerTotalARS += checkAmount;
        }

        // ── SELL/TRANSFER: cheque entra al lado del comprador ──────────────
        if (buyerClientId) {
          await tx.movement.create({
            data: {
              transaction_id: transaction.id,
              box_id:    null,
              client_id: buyerClientId,
              check_id:  checkId,
              type:      'DEBIT',    // cheque entra a la cuenta del comprador
              amount:    checkAmount,
              currency:  check.currency,
            },
          });
          if (check.currency === 'ARS') buyerTotalARS += checkAmount;
        }
      }

      // ── AP al vendedor ────────────────────────────────────────────────────────
      // Se registran DOS movimientos para mostrar el desglose en el libro del cliente:
      //   1. DEBIT nominal (valor bruto de los cheques — lo que acordamos pagar)
      //   2. CREDIT comisión (descuento aplicado — solo en BUY con comisión)
      // El neto resultante sigue siendo sellerTotalARS − comm.
      if (sellerClientId && sellerTotalARS > 0) {
        // Movimiento 1: AP nominal
        await tx.movement.create({
          data: {
            transaction_id: transaction.id,
            box_id:    null,
            client_id: sellerClientId,
            check_id:  null,
            type:      'DEBIT',    // AP: agencia le debe al vendedor el nominal
            amount:    sellerTotalARS,
            currency:  'ARS',
          },
        });
        // Movimiento 2: descuento de comisión (solo BUY con comisión > 0)
        if (isBuy && comm > 0) {
          await tx.movement.create({
            data: {
              transaction_id: transaction.id,
              box_id:    null,
              client_id: sellerClientId,
              check_id:  null,
              type:      'CREDIT',   // Comisión descontada del AP
              amount:    comm,
              currency:  'ARS',
            },
          });
        }
      }

      // ── SELL: AR del comprador — desglose nominal + comisión ──────────────
      // Se crean DOS movimientos para mostrar el detalle en el libro del comprador:
      //   1. CREDIT nominal (valor bruto del cheque — lo que el comprador recibe)
      //   2. DEBIT comisión (descuento/comisión cobrada — reduce el AR neto)
      // El neto resultante es buyerTotalARS − comm.
      if (buyerClientId && buyerTotalARS > 0) {
        // Movimiento 1: AR nominal
        await tx.movement.create({
          data: {
            transaction_id: transaction.id,
            box_id:    null,
            client_id: buyerClientId,
            check_id:  null,
            type:      'CREDIT',   // AR: comprador le debe a la agencia el nominal
            amount:    buyerTotalARS,
            currency:  'ARS',
          },
        });
        // Movimiento 2: descuento de comisión (solo SELL con comisión > 0)
        if (isSell && comm > 0) {
          await tx.movement.create({
            data: {
              transaction_id: transaction.id,
              box_id:    null,
              client_id: buyerClientId,
              check_id:  null,
              type:      'DEBIT',    // Comisión descontada del AR
              amount:    comm,
              currency:  'ARS',
            },
          });
        }
      }

      // ── Comisión ────────────────────────────────────────────────────────────
      // La comisión queda registrada en el campo `commission` de la transacción
      // para reportes (P&L / Comisiones Varias), pero NO genera movimiento en caja.
      // El ingreso físico de la comisión se registra manualmente como Nuevo Ingreso.

      return transaction;
    });
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const createCheckSettle = async (req: Request, res: Response) => {
  const { checkId, ownerClientId, userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Operador no identificado.' });
  if (!checkId || !ownerClientId) return res.status(400).json({ error: 'Se requiere checkId y ownerClientId.' });

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const check = await tx.check.findUnique({ where: { id: checkId } });
      if (!check) throw new Error('Cheque no encontrado.');
      if (check.destination_client_id !== ownerClientId) throw new Error('El cheque no pertenece al cliente indicado.');
      if (check.status !== 'DELIVERED') throw new Error('Solo se pueden acreditar cheques entregados (DELIVERED).');

      const transaction = await tx.transaction.create({
        data: {
          type: 'CHECK_TRADE',
          category: 'OTHER',
          description: `Acreditación de cheque — ${check.bank_name} N° ${check.check_number}`,
          created_by: userId,
        },
      });

      // Comprador: cheque sale de su cuenta → cancela el DEBIT(check) de la compraventa
      await tx.movement.create({
        data: {
          transaction_id: transaction.id,
          box_id:    null,
          client_id: ownerClientId,
          check_id:  checkId,
          type:      'CREDIT',
          amount:    Number(check.amount),
          currency:  check.currency,
        },
      });

      if (check.currency === 'ARS') {
        // Comprador: cancela su deuda ARS con la agencia → cancela el CREDIT(ARS) de la compraventa
        await tx.movement.create({
          data: {
            transaction_id: transaction.id,
            box_id:    null,
            client_id: ownerClientId,
            check_id:  null,
            type:      'DEBIT',
            amount:    Number(check.amount),
            currency:  'ARS',
          },
        });
        // El pago al depositante original (source_client) se gestiona por separado
        // como un egreso de caja cuando la agencia le pague en efectivo.
      }

      await tx.check.update({
        where: { id: checkId },
        data: { status: 'DEPOSITED', destination_client_id: null, source_client_id: null },
      });

      return transaction;
    });
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const createCheckReturn = async (req: Request, res: Response) => {
  const { checkId, ownerClientId, rejectionFee, rejectionFeeDescription, userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Operador no identificado.' });
  if (!checkId || !ownerClientId) return res.status(400).json({ error: 'Se requiere checkId y ownerClientId.' });

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const check = await tx.check.findUnique({ where: { id: checkId } });
      if (!check) throw new Error('Cheque no encontrado.');
      if (check.destination_client_id !== ownerClientId) throw new Error('El cheque no pertenece al cliente indicado.');
      if (check.status !== 'DELIVERED') throw new Error('Solo se pueden rechazar cheques entregados (DELIVERED).');

      const description = rejectionFeeDescription || `Rechazo de cheque — ${check.bank_name} N° ${check.check_number}`;
      const transaction = await tx.transaction.create({
        data: { type: 'CHECK_TRADE', category: 'OTHER', description, created_by: userId },
      });

      // 1. Comprador devuelve el cheque → cancela DEBIT(check) de la venta
      await tx.movement.create({
        data: {
          transaction_id: transaction.id,
          box_id:    null,
          client_id: ownerClientId,
          check_id:  checkId,
          type:      'CREDIT',
          amount:    Number(check.amount),
          currency:  check.currency,
        },
      });

      if (check.currency === 'ARS') {
        // 2. Cancela AR del comprador → cancela CREDIT(ARS) de la venta
        await tx.movement.create({
          data: {
            transaction_id: transaction.id,
            box_id:    null,
            client_id: ownerClientId,
            check_id:  null,
            type:      'DEBIT',
            amount:    Number(check.amount),
            currency:  'ARS',
          },
        });

        // 3. Neteo automático con cliente emisor original (source_client):
        //    Cancelar el AP que la agencia tenía con él desde la Compra.
        //    Buscamos el importe neto pagado al cliente en la operación de BUY.
        if (check.source_client_id) {
          const buyMovement = await tx.movement.findFirst({
            where: {
              check_id:  checkId,
              client_id: check.source_client_id,
              type:      'CREDIT',   // cheque saliendo del vendedor original = operación BUY
            },
            include: { transaction: true },
          });

          if (buyMovement) {
            // Recuperar el AP (DEBIT ARS sin check_id) de esa misma transacción de compra
            const apMovement = await tx.movement.findFirst({
              where: {
                transaction_id: buyMovement.transaction_id,
                client_id:      check.source_client_id,
                check_id:       null,
                currency:       'ARS',
                type:           'DEBIT',
              },
            });

            const netAmount = apMovement ? Number(apMovement.amount) : Number(check.amount);

            // CREDIT(ARS, source_client, netAmount) → cancela la AP de la compra
            await tx.movement.create({
              data: {
                transaction_id: transaction.id,
                box_id:    null,
                client_id: check.source_client_id,
                check_id:  null,
                type:      'CREDIT',   // cancela DEBIT(AP) creado en la compra
                amount:    netAmount,
                currency:  'ARS',
              },
            });
          }
        }

        // 4. Cargo por rechazo al comprador (opcional)
        if (rejectionFee && Number(rejectionFee) > 0) {
          await tx.movement.create({
            data: {
              transaction_id: transaction.id,
              box_id:    null,
              client_id: ownerClientId,
              check_id:  null,
              type:      'CREDIT',   // deuda adicional del comprador por gastos de rechazo
              amount:    Number(rejectionFee),
              currency:  'ARS',
            },
          });
        }
      }

      // 5. Cheque vuelve a cartera propia — listo para gestión posterior
      await tx.check.update({
        where: { id: checkId },
        data: { status: 'IN_PORTFOLIO', destination_client_id: null },
      });

      return transaction;
    });
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const createOutcome = async (req: Request, res: Response) => {
  const { boxId, clientId, checkId, amount, currency, description, userId, category, confirm, operationDate } = req.body;
  const opDate = operationDate ? new Date(operationDate + 'T12:00:00') : undefined;
  if (!userId) return res.status(400).json({ error: 'Operador no identificado. Sesión inválida.' });
  if (!boxId || !amount || !currency || !description) return res.status(400).json({ error: 'Faltan campos requeridos: boxId, amount, currency, description.' });
  if (Number(amount) <= 0) return res.status(400).json({ error: 'El importe debe ser mayor a cero.' });

  // ── Overdraft check ──────────────────────────────────────────────────────
  if (!confirm) {
    const bal = await TransactionRepository.getBoxBalances(boxId);
    const current = currency === 'USD' ? bal.USD : bal.ARS;
    const projected = current - Number(amount);
    if (projected < 0) {
      const box = await prisma.box.findUnique({ where: { id: boxId }, select: { name: true } });
      return res.status(409).json({
        requiresConfirmation: true,
        overdrafts: [{ boxName: box?.name ?? 'Caja', clientName: null, currency, currentBalance: current, projectedBalance: projected }],
      });
    }
  }

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const transaction = await tx.transaction.create({
        data: { type: 'OUTCOME', category: category || 'OTHER', description, created_by: userId, ...(opDate && { operation_date: opDate }) }
      });
      // Movimiento de caja: sale efectivo de la caja
      await tx.movement.create({
        data: {
          transaction_id: transaction.id,
          box_id: boxId,
          client_id: clientId || null,
          check_id: checkId || null,
          type: 'CREDIT', // Egreso resta
          amount: Number(amount),
          currency
        }
      });
      // Si el egreso está vinculado a un cliente, crear contrapartida contable (box_id=null)
      // SOLO si el cliente tiene una obligación pendiente (AP) en esa moneda.
      // Esto evita crear falsos ACTIVOS (AR) cuando el egreso es solo efectivo sin deuda previa.
      if (clientId) {
        const pendingMovs = await tx.movement.findMany({
          where: { client_id: clientId, box_id: null, check_id: null, currency },
          select: { type: true, amount: true },
        });
        const pendingAP = pendingMovs.reduce((net: number, m: any) => {
          return net + (m.type === 'DEBIT' ? Number(m.amount) : -Number(m.amount));
        }, 0);
        // Solo hay AP real si el neto es positivo (agencia le debe al cliente)
        if (pendingAP > 0.01) {
          const cancelAmount = Math.min(Number(amount), pendingAP);
          await tx.movement.create({
            data: {
              transaction_id: transaction.id,
              box_id:    null,
              client_id: clientId,
              check_id:  null,
              type:      'CREDIT', // Cancela el AP pendiente
              amount:    cancelAmount,
              currency,
            }
          });
        }
      }
      return transaction;
    });
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const revertTransaction = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Operador no identificado. Sesión inválida.' });

  try {
    const original = await prisma.transaction.findUnique({
      where: { id },
      include: { movements: { include: { check: true } } },
    });

    if (!original) return res.status(404).json({ error: 'Transacción no encontrada.' });
    if (original.is_reversed) return res.status(400).json({ error: 'La transacción ya fue revertida.' });
    if (original.reversal_of) return res.status(400).json({ error: 'No se puede revertir una reversión.' });

    // Validate no check is in terminal state DEPOSITED
    const checkIds = [...new Set(original.movements.map((m: any) => m.check_id).filter(Boolean))] as string[];
    for (const checkId of checkIds) {
      const check = await prisma.check.findUnique({ where: { id: checkId } });
      if (check?.status === 'DEPOSITED') {
        return res.status(400).json({
          error: `El cheque N° ${check.check_number} ya fue acreditado (DEPOSITED) y no puede revertirse.`,
        });
      }
    }

    const result = await prisma.$transaction(async (tx: any) => {
      // Create reversal transaction
      const reversal = await tx.transaction.create({
        data: {
          type:           original.type,
          category:       original.category,
          description:    `[REVERSO] ${original.description}`,
          operation_date: original.operation_date,
          exchange_rate:  original.exchange_rate ?? undefined,
          commission:     original.commission ?? undefined,
          reversal_of:    original.id,
          created_by:     userId,
        },
      });

      // Mirror every movement with inverted type
      for (const mov of original.movements) {
        await tx.movement.create({
          data: {
            transaction_id: reversal.id,
            box_id:         mov.box_id,
            client_id:      mov.client_id,
            check_id:       mov.check_id,
            type:           mov.type === 'DEBIT' ? 'CREDIT' : 'DEBIT',
            amount:         mov.amount,
            currency:       mov.currency,
          },
        });
      }

      // Revert check statuses
      for (const checkId of checkIds) {
        const check = await tx.check.findUnique({ where: { id: checkId } });
        if (!check) continue;
        if (check.status === 'DELIVERED') {
          await tx.check.update({
            where: { id: checkId },
            data: { status: 'IN_PORTFOLIO', destination_client_id: null },
          });
        } else if (check.status === 'IN_PORTFOLIO') {
          await tx.check.update({
            where: { id: checkId },
            data: { status: 'PENDING_PURCHASE' },
          });
        } else if (check.status === 'PENDING_PURCHASE' && original.category === 'CHECK_DEPOSIT') {
          // Reverting the administrative registration — check was never purchased, mark as REJECTED
          await tx.check.update({
            where: { id: checkId },
            data: { status: 'REJECTED' },
          });
        }
      }

      // Mark original as reversed
      await tx.transaction.update({
        where: { id: original.id },
        data: { is_reversed: true },
      });

      return reversal;
    });

    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// -- Ajuste de Cuenta Corriente (sin movimiento de caja)
export const createClientAdjustment = async (req: Request, res: Response) => {
  const { userId, clientId, amount, currency, direction, description } = req.body;
  if (!userId)    return res.status(400).json({ error: 'Operador no identificado.' });
  if (!clientId)  return res.status(400).json({ error: 'Cliente no especificado.' });
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'El importe debe ser mayor a cero.' });
  if (!currency || !['ARS', 'USD'].includes(currency)) return res.status(400).json({ error: 'Moneda inválida.' });
  if (!direction || !['ACREEDOR', 'DEUDOR'].includes(direction)) return res.status(400).json({ error: 'Dirección inválida.' });

  try {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado.' });

    const result = await prisma.$transaction(async (tx: any) => {
      const transaction = await tx.transaction.create({
        data: {
          type:        direction === 'ACREEDOR' ? 'INCOME' : 'OUTCOME',
          category:    'OTHER',
          description: description || `Ajuste de cuenta – ${client.name}`,
          created_by:  userId,
        },
      });
      // ACREEDOR: le acreditamos al cliente → DEBIT (saldo positivo = AP, la agencia le debe)
      // DEUDOR:   le cargamos al cliente   → CREDIT (saldo negativo = AR, el cliente nos debe)
      await tx.movement.create({
        data: {
          transaction_id: transaction.id,
          box_id:         null,
          client_id:      clientId,
          check_id:       null,
          type:           direction === 'ACREEDOR' ? 'DEBIT' : 'CREDIT',
          amount:         Number(amount),
          currency,
        },
      });
      return transaction;
    });
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// -- Saldo de Apertura
export const createOpeningBalance = async (req: Request, res: Response) => {
  const { userId, description, clientId, boxId, clientBalances, boxBalances } = req.body;
  if (!userId) return res.status(400).json({ error: 'Operador no identificado.' });

  const hasClientBalance = clientId && Array.isArray(clientBalances) && clientBalances.some((b: any) => Number(b.amount) > 0);
  const hasBoxBalance    = boxId    && Array.isArray(boxBalances)    && boxBalances.some((b: any)    => Number(b.amount) > 0);

  if (!hasClientBalance && !hasBoxBalance) {
    return res.status(400).json({ error: 'No hay saldos de apertura para registrar.' });
  }

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const transaction = await tx.transaction.create({
        data: {
          type:        'INCOME',
          category:    'OPENING_BALANCE',
          description: description || 'Saldo de apertura',
          created_by:  userId,
        },
      });

      if (hasClientBalance) {
        for (const b of clientBalances) {
          if (Number(b.amount) <= 0) continue;
          // ACREEDOR: nosotros le debemos al cliente → DEBIT null-box (AP)
          // DEUDOR: el cliente nos debe → CREDIT null-box (AR)
          await tx.movement.create({
            data: {
              transaction_id: transaction.id,
              box_id:         null,
              client_id:      clientId,
              check_id:       null,
              type:           b.direction === 'ACREEDOR' ? 'DEBIT' : 'CREDIT',
              amount:         Number(b.amount),
              currency:       b.currency,
            },
          });
        }
      }

      if (hasBoxBalance) {
        for (const b of boxBalances) {
          if (Number(b.amount) <= 0) continue;
          await tx.movement.create({
            data: {
              transaction_id: transaction.id,
              box_id:         boxId,
              client_id:      null,
              check_id:       null,
              type:           'DEBIT',
              amount:         Number(b.amount),
              currency:       b.currency,
            },
          });
        }
      }

      return transaction;
    });
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// -- Gasto Virtual
export const createGastoVirtual = async (req: Request, res: Response) => {
  const { amount, currency, description, userId, clientId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Sesion invalida.' });
  if (!amount || !currency || !description) return res.status(400).json({ error: 'Faltan campos.' });
  if (Number(amount) <= 0) return res.status(400).json({ error: 'Importe debe ser mayor a cero.' });
  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const transaction = await tx.transaction.create({
        data: { type: 'OUTCOME', category: 'COMMISSION', description, commission: Number(amount), created_by: userId },
      });
      await tx.movement.create({
        data: { transaction_id: transaction.id, box_id: null, client_id: clientId || null, check_id: null, type: 'CREDIT', amount: Number(amount), currency },
      });
      return transaction;
    });
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
