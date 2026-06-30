import { Router } from 'express';
import { processFxTrade } from '../controllers/fx.controller';
import { verifyToken } from '../middlewares/auth.middleware';

const router = Router();

router.use(verifyToken);

router.post('/', processFxTrade);

export default router;
