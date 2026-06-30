import { Request, Response } from 'express';
import { TransactionRepository } from '../repositories/transaction.repository';
import { prisma } from '../db/prisma';
import { z } from 'zod';
import { parseArgDate } from '../utils/dates';

const fxTradeSchema = z.object({
  clientId: z.string().uuid().optional(),
  agencyBoxId: z.string().uuid(),
  operation: z.enum(['BUY', 'SELL']),
  usdAmount: z.number().positive(),
  exchangeRate: z.number().positive(),
  date: z.string().optional(),
  description: z.string(),
  confirm: z.boolean().optional(),
});

export const processFxTrade = async (req: Request, res: Response) => {
  try {
    const userId = req.body.userId;
    const data = fxTradeSchema.parse(req.body);
    const confirm = data.confirm === true;

    // ── Overdraft check (skip when caller confirmed) ───────────────────────
    if (!confirm) {
      const arsAmount = data.usdAmount * data.exchangeRate;

      const agencyBox = await prisma.box.findUnique({ where: { id: data.agencyBoxId } });
      if (!agencyBox) {
        return res.status(400).json({ error: 'Caja de agencia no encontrada.' });
      }

      const agencyBal = await TransactionRepository.getBoxBalances(data.agencyBoxId);

      const overdrafts: {
        boxName: string; clientName: string | null; currency: string;
        currentBalance: number; projectedBalance: number;
      }[] = [];

      // Agency-side overdraft
      if (data.operation === 'BUY') {
        if (agencyBal.ARS - arsAmount < 0) {
          overdrafts.push({ boxName: agencyBox.name, clientName: null, currency: 'ARS', currentBalance: agencyBal.ARS, projectedBalance: agencyBal.ARS - arsAmount });
        }
      } else {
        if (agencyBal.USD - data.usdAmount < 0) {
          overdrafts.push({ boxName: agencyBox.name, clientName: null, currency: 'USD', currentBalance: agencyBal.USD, projectedBalance: agencyBal.USD - data.usdAmount });
        }
      }

      // Client-side overdraft (only when there is a registered client)
      if (data.clientId) {
        const client = await prisma.client.findUnique({ where: { id: data.clientId }, include: { box: true } });
        if (!client?.box) {
          return res.status(400).json({ error: 'Cliente o caja de cliente no encontrados.' });
        }

        // Saldo efectivo del cliente — misma lógica que la ficha del frontend.
        // Agrupar por transacción+moneda y preferir el movimiento con box_id.
        // Excluir FX_TRADE (se liquidan en el acto).
        const allClientMovs = await prisma.movement.findMany({
          where: {
            client_id: data.clientId,
            check_id: null,
            transaction: { type: { not: 'FX_TRADE' } },
          },
          select: { amount: true, type: true, currency: true, box_id: true, transaction_id: true },
        });

        const deduplicateByTxCurrency = (movs: typeof allClientMovs) => {
          const byKey = new Map<string, typeof allClientMovs>();
          for (const m of movs) {
            const key = `${m.transaction_id}__${m.currency}`;
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key)!.push(m);
          }
          return [...byKey.values()].flatMap(group => {
            const withBox = group.find(m => m.box_id);
            if (withBox) return [withBox];
            return group;
          });
        };

        const deduped = deduplicateByTxCurrency(allClientMovs);
        let effectiveARS = 0, effectiveUSD = 0;
        for (const m of deduped) {
          const sign = m.type === 'DEBIT' ? 1 : -1;
          if (m.currency === 'ARS') effectiveARS += sign * Number(m.amount);
          else if (m.currency === 'USD') effectiveUSD += sign * Number(m.amount);
        }

        if (data.operation === 'BUY') {
          if (effectiveUSD - data.usdAmount < 0) {
            overdrafts.push({ boxName: client.box.name, clientName: client.name, currency: 'USD', currentBalance: effectiveUSD, projectedBalance: effectiveUSD - data.usdAmount });
          }
        } else {
          if (effectiveARS - arsAmount < 0) {
            overdrafts.push({ boxName: client.box.name, clientName: client.name, currency: 'ARS', currentBalance: effectiveARS, projectedBalance: effectiveARS - arsAmount });
          }
        }
      }

      if (overdrafts.length > 0) {
        return res.status(409).json({ requiresConfirmation: true, overdrafts });
      }
    }

    // Parsear la fecha como mediodía Argentina para evitar que UTC midnight
    // caiga en el día anterior al consultar por franja horaria AR (UTC-3).
    const opDate = data.date ? parseArgDate(data.date) : new Date();
    const transaction = await TransactionRepository.processFxTrade({
      ...data,
      date: opDate,
      userId,
    });

    res.status(201).json({ success: true, transaction });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
