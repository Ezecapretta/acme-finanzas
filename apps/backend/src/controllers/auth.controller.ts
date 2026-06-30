import { Request, Response } from 'express';
import { prisma } from '../db/prisma';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret';

const hashPassword = (password: string) => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    if (user.password_hash !== hashPassword(password)) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role, email: user.email },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, role: true, email: true, is_active: true, created_at: true },
      orderBy: { name: 'asc' }
    });
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Nombre, email y contraseña son obligatorios.' });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Ya existe un usuario con ese email.' });

    const user = await prisma.user.create({
      data: { name, email, password_hash: hashPassword(password), role: role || 'OPERATOR' },
      select: { id: true, name: true, role: true, email: true, is_active: true, created_at: true }
    });
    res.status(201).json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, role, password } = req.body;
    const updateData: any = {};
    if (name) updateData.name = name;
    if (role) updateData.role = role;
    if (password) updateData.password_hash = hashPassword(password);

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, role: true, email: true, is_active: true }
    });
    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const toggleUserStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

    const updated = await prisma.user.update({
      where: { id },
      data: { is_active: !user.is_active },
      select: { id: true, name: true, role: true, email: true, is_active: true }
    });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
