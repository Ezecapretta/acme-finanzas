import { prisma } from '../db/prisma';
import { AccountCurrency } from '@acme/shared';

export class TransactionRepository {
  /**
   * Ejecuta una transferencia interna entre dos Cajas bajo cumplimiento estricto ACID.
   * Si cualquiera de los pasos de la transferencia falla, revierte todo (ROLLBACK).
   */
  static async transferFunds(data: {
    fromBoxId: string;
    toBoxId: string;
    amount: number;
    currency: AccountCurrency;
    description: string;
    userId: string;
    confirm?: boolean;
  }) {
    // Usamos el bloque interactivo de transacciones de Prisma (equivale a BEGIN ... COMMIT/ROLLBACK)
    return await prisma.$transaction(async (tx: any) => {
      // 1. Validar que las cajas existan
      const fromBox = await tx.box.findUnique({ where: { id: data.fromBoxId } });
      const toBox = await tx.box.findUnique({ where: { id: data.toBoxId } });

      if (!fromBox || !toBox) {
        throw new Error('Una o ambas cajas no existen.');
      }

      // 2. Verificar saldo disponible en la caja origen (dentro del bloque transaccional)
      const movimientosOrigen = await tx.movement.findMany({
        where: { box_id: data.fromBoxId },
        select: { amount: true, type: true, currency: true }
      });
      let saldoDisponible = 0;
      for (const mov of movimientosOrigen) {
        if (mov.currency === data.currency) {
          if (mov.type === 'DEBIT')  saldoDisponible += Number(mov.amount);
          if (mov.type === 'CREDIT') saldoDisponible -= Number(mov.amount);
        }
      }
      if (saldoDisponible < data.amount && !data.confirm) {
        throw new Error(
          `Saldo insuficiente en "${fromBox.name}". Disponible: ${saldoDisponible.toFixed(2)} ${data.currency}, requerido: ${data.amount.toFixed(2)} ${data.currency}.`
        );
      }

      // 3. Crear transacción cabecera
      const transaction = await tx.transaction.create({
        data: {
          type: 'TRANSFER',
          description: data.description,
          created_by: data.userId,
        },
      });

      const outgoingMovement = await tx.movement.create({
        data: {
          transaction_id: transaction.id,
          box_id: data.fromBoxId,
          type: 'CREDIT', // Egreso
          amount: data.amount,
          currency: data.currency,
        },
      });

      const incomingMovement = await tx.movement.create({
        data: {
          transaction_id: transaction.id,
          box_id: data.toBoxId,
          type: 'DEBIT', // Ingreso
          amount: data.amount,
          currency: data.currency,
        },
      });

      return { transaction, outgoingMovement, incomingMovement };
    });
  }

  /**
   * Ejecuta un asiente doble de FX (Compra/Venta Dólares).
   */
  static async processFxTrade(data: {
    clientId?: string;
    agencyBoxId: string;
    operation: 'BUY' | 'SELL';
    usdAmount: number;
    exchangeRate: number;
    date: Date;
    description: string;
    userId: string;
  }) {
    return await prisma.$transaction(async (tx: any) => {
      const arsAmount = data.usdAmount * data.exchangeRate;

      // Create transaction record
      const transaction = await tx.transaction.create({
        data: {
          type: 'FX_TRADE',
          description: data.description,
          operation_date: data.date,
          created_by: data.userId,
          exchange_rate: data.exchangeRate,
        },
      });

      if (data.operation === 'BUY') {
        if (data.clientId) {
          // BUY con cliente: a crédito — NO afecta caja de agencia.
          // La caja física se actualiza cuando el cliente entrega USD (INCOME) y la agencia paga ARS (OUTCOME).
          const client = await tx.client.findUnique({ where: { id: data.clientId }, include: { box: true } });
          if (!client?.box) throw new Error("Client or Client's Box not found");
          // Caja del cliente (para ficha / libro mayor del cliente)
          await tx.movement.create({ data: { transaction_id: transaction.id, box_id: client.box.id, type: 'CREDIT', amount: data.usdAmount, currency: 'USD', client_id: data.clientId } });
          await tx.movement.create({ data: { transaction_id: transaction.id, box_id: client.box.id, type: 'DEBIT',  amount: arsAmount,       currency: 'ARS', client_id: data.clientId } });
          // Asientos contables null-box (balance sheet + cancelación futura con INCOME/OUTCOME)
          await tx.movement.create({ data: { transaction_id: transaction.id, box_id: null, client_id: data.clientId, type: 'DEBIT',  amount: arsAmount,       currency: 'ARS' } }); // AP: agencia le debe ARS al cliente
          await tx.movement.create({ data: { transaction_id: transaction.id, box_id: null, client_id: data.clientId, type: 'CREDIT', amount: data.usdAmount, currency: 'USD' } }); // AR: cliente le debe USD a la agencia
        } else {
          // BUY ventanilla: al contado — afecta caja de agencia directamente.
          await tx.movement.create({ data: { transaction_id: transaction.id, box_id: data.agencyBoxId, type: 'DEBIT',  amount: data.usdAmount, currency: 'USD' } });
          await tx.movement.create({ data: { transaction_id: transaction.id, box_id: data.agencyBoxId, type: 'CREDIT', amount: arsAmount,       currency: 'ARS' } });
        }
      } else {
        if (data.clientId) {
          // SELL con cliente: a crédito — NO afecta caja de agencia.
          const client = await tx.client.findUnique({ where: { id: data.clientId }, include: { box: true } });
          if (!client?.box) throw new Error("Client or Client's Box not found");
          // Caja del cliente
          await tx.movement.create({ data: { transaction_id: transaction.id, box_id: client.box.id, type: 'DEBIT',  amount: data.usdAmount, currency: 'USD', client_id: data.clientId } });
          await tx.movement.create({ data: { transaction_id: transaction.id, box_id: client.box.id, type: 'CREDIT', amount: arsAmount,       currency: 'ARS', client_id: data.clientId } });
          // Asientos contables null-box
          await tx.movement.create({ data: { transaction_id: transaction.id, box_id: null, client_id: data.clientId, type: 'CREDIT', amount: arsAmount,       currency: 'ARS' } }); // AR: cliente le debe ARS a la agencia
          await tx.movement.create({ data: { transaction_id: transaction.id, box_id: null, client_id: data.clientId, type: 'DEBIT',  amount: data.usdAmount, currency: 'USD' } }); // AP: agencia le debe USD al cliente
        } else {
          // SELL ventanilla: al contado.
          await tx.movement.create({ data: { transaction_id: transaction.id, box_id: data.agencyBoxId, type: 'CREDIT', amount: data.usdAmount, currency: 'USD' } });
          await tx.movement.create({ data: { transaction_id: transaction.id, box_id: data.agencyBoxId, type: 'DEBIT',  amount: arsAmount,       currency: 'ARS' } });
        }
      }

      return transaction;
    });
  }

  /**
   * Obtiene el saldo real de una caja a partir del motor de doble entrada.
   * No consultamos un saldo estático sino la sumatoria matemática garantizada por base de datos.
   */
  static async getBoxBalances(boxId: string) {
    const movements = await prisma.movement.findMany({
      where: { box_id: boxId },
      select: { amount: true, type: true, currency: true }
    });

    let ARS = 0;
    let USD = 0;
    for (const mov of movements) {
      if (mov.currency === 'ARS') {
        if (mov.type === 'DEBIT') ARS += Number(mov.amount);
        if (mov.type === 'CREDIT') ARS -= Number(mov.amount);
      } else if (mov.currency === 'USD') {
        if (mov.type === 'DEBIT') USD += Number(mov.amount);
        if (mov.type === 'CREDIT') USD -= Number(mov.amount);
      }
    }

    return { ARS, USD };
  }
}
