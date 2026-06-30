import { Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { parseArgDate } from '../utils/dates';

export const getChecks = async (req: Request, res: Response) => {
  try {
    const checks = await prisma.check.findMany({
      include: {
        source_client: { select: { id: true, name: true } },
        destination_client: { select: { id: true, name: true } }
      },
      orderBy: { due_date: 'asc' }
    });
    res.json(checks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createCheck = async (req: Request, res: Response) => {
  const { check_number, bank_name, amount, currency, issue_date, due_date, source_client_id, status, destination_client_id } = req.body;
  try {
    const check = await prisma.check.create({
      data: {
        check_number,
        bank_name,
        amount: Number(amount),
        currency,
        issue_date: parseArgDate(issue_date),
        due_date: parseArgDate(due_date),
        source_client_id,
      status: status || 'PENDING_PURCHASE',
        ...(destination_client_id !== undefined ? { destination_client_id } : {})
      }
    });
    res.status(201).json(check);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const updateCheck = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { check_number, bank_name, amount, currency, issue_date, due_date, source_client_id, status } = req.body;
  try {
    const check = await prisma.check.update({
      where: { id },
      data: {
        ...(check_number && { check_number }),
        ...(bank_name    && { bank_name }),
        ...(amount !== undefined && { amount: Number(amount) }),
        ...(currency     && { currency }),
        ...(issue_date   && { issue_date: parseArgDate(issue_date) }),
        ...(due_date     && { due_date: parseArgDate(due_date) }),
        ...(source_client_id !== undefined && { source_client_id: source_client_id || null }),
        ...(status       && { status }),
      },
      include: { source_client: { select: { id: true, name: true } } }
    });
    res.json(check);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// Valid manual transitions (accounting-safe)
const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING_PURCHASE: ['REJECTED'],          // only void before purchase
  IN_PORTFOLIO:     ['REJECTED'],          // only void without sale
  DELIVERED:        ['DEPOSITED'],         // manual settle
  DEPOSITED:        [],                    // terminal
  REJECTED:         [],                    // terminal
};

export const updateCheckStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, destination_client_id } = req.body;
  try {
    const current = await prisma.check.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: 'Cheque no encontrado.' });
    const allowed = VALID_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        error: `Transición inválida: ${current.status} → ${status}. Use los módulos de operación correspondientes.`,
      });
    }
    const check = await prisma.check.update({
      where: { id },
      data: {
        status,
        destination_client_id: destination_client_id === null ? null : destination_client_id || undefined,
      }
    });
    res.json(check);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const voidCheck = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const check = await prisma.check.update({
      where: { id },
      data: { status: 'REJECTED' }
    });
    res.json(check);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

// Registra un lote de cheques + sus transacciones de ingreso en una única transacción DB.
// Si cualquier cheque falla, se hace rollback de todo el lote.
export const bulkIncomeChecks = async (req: Request, res: Response) => {
  const { checks, clientId, boxId, description, userId } = req.body;

  if (!userId) return res.status(400).json({ error: 'Operador no identificado.' });
  if (!description) return res.status(400).json({ error: 'Se requiere descripción.' });
  if (!Array.isArray(checks) || checks.length === 0)
    return res.status(400).json({ error: 'Se requiere al menos un cheque.' });

  const invalid = checks.find(
    (c: any) => !c.check_number || !c.bank_name || !c.amount || !c.due_date
  );
  if (invalid)
    return res.status(400).json({ error: 'Faltan campos en algún cheque (número, banco, importe, vencimiento).' });

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const transaction = await tx.transaction.create({
        data: { type: 'CHECK_TRADE', category: 'CHECK_DEPOSIT', description, created_by: userId },
      });

      const createdChecks = [];
      for (const c of checks) {
        const check = await tx.check.create({
          data: {
            check_number:     c.check_number,
            bank_name:        c.bank_name,
            amount:           Number(c.amount),
            currency:         c.currency || 'ARS',
            issue_date:       parseArgDate(c.issue_date),
            due_date:         parseArgDate(c.due_date),
            source_client_id: clientId || null,
            status:           'PENDING_PURCHASE',
          },
        });
        await tx.movement.create({
          data: {
            transaction_id: transaction.id,
            box_id:    null,
            client_id: clientId || null,
            check_id:  check.id,
            type:      'DEBIT',
            amount:    Number(c.amount),
            currency:  c.currency || 'ARS',
          },
        });
        createdChecks.push(check);
      }

      return { transaction, checks: createdChecks };
    });

    return res.status(201).json(result);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
};
