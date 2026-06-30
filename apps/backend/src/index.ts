import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';

import { prisma } from './db/prisma';
import clientRoutes from './routes/client.routes';
import boxRoutes from './routes/box.routes';
import checkRoutes from './routes/check.routes';
import transactionRoutes from './routes/transaction.routes';
import authRoutes from './routes/auth.routes';
import reportRoutes from './routes/report.routes';
import fxRoutes from './routes/fx.routes';
import { verifyToken } from './middlewares/auth.middleware';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

const hashPassword = (p: string) => crypto.createHash('sha256').update(p).digest('hex');

// Datos del admin inicial (configurables por env; defaults de demo).
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@acme.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Admin';

async function ensureAdminUser() {
  const exists = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!exists) {
    await prisma.user.create({
      data: {
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        password_hash: hashPassword(ADMIN_PASSWORD),
        role: 'ADMIN',
      },
    });
    console.log(`[Bootstrap] Admin ${ADMIN_EMAIL} creado.`);
  }
}

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/clients', verifyToken, clientRoutes);
app.use('/api/boxes', verifyToken, boxRoutes);
app.use('/api/checks', verifyToken, checkRoutes);
app.use('/api/transactions', verifyToken, transactionRoutes);
app.use('/api/reports', verifyToken, reportRoutes);
app.use('/api/fx', verifyToken, fxRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

ensureAdminUser()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[Backend] Server running on port ${PORT}`);
    });
  })
  .catch(console.error);
