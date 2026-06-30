import { Router } from 'express';
import { login, getUsers, createUser, updateUser, toggleUserStatus } from '../controllers/auth.controller';
import { verifyToken, requireAdmin } from '../middlewares/auth.middleware';

const router = Router();

router.post('/login', login);
router.get('/users', verifyToken, requireAdmin, getUsers);
router.post('/users', verifyToken, requireAdmin, createUser);
router.put('/users/:id', verifyToken, requireAdmin, updateUser);
router.put('/users/:id/toggle-status', verifyToken, requireAdmin, toggleUserStatus);

export default router;
