import { Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { TransactionRepository } from '../repositories/transaction.repository';

export const getBoxes = async (req: Request, res: Response) => {
  try {
    const boxes = await prisma.box.findMany({ where: { is_active: true } });
    
    // Obtener saldos dinámicos
    const boxesWithBalances = await Promise.all(
      boxes.map(async (box: any) => {
        const balances = await TransactionRepository.getBoxBalances(box.id);
        return { ...box, balances };
      })
    );
    
    res.json({ boxes: boxesWithBalances });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createBox = async (req: Request, res: Response) => {
  const { name, client_id } = req.body;
  try {
    const box = await prisma.box.create({
      data: { name, client_id: client_id || null }
    });
    res.status(201).json(box);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const updateBox = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name } = req.body;
  try {
    const box = await prisma.box.update({
      where: { id },
      data: { name }
    });
    res.json(box);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const deleteBox = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const box = await prisma.box.update({
      where: { id },
      data: { is_active: false }
    });
    res.json({ message: 'Caja eliminada' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
