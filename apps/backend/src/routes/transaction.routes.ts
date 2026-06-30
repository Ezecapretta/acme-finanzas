import { Router } from 'express';
import { getTransactions, createTransfer, createIncome, createOutcome, createCheckTrade, createCheckReturn, createCheckSettle, createGastoVirtual, createOpeningBalance, createClientAdjustment, revertTransaction } from '../controllers/transaction.controller';

const router = Router();

router.get('/', getTransactions);
router.post('/transfer', createTransfer);
router.post('/income', createIncome);
router.post('/outcome', createOutcome);
router.post('/check-trade', createCheckTrade);
router.post('/check-return', createCheckReturn);
router.post('/check-settle', createCheckSettle);
router.post('/gasto-virtual', createGastoVirtual);
router.post('/opening-balance', createOpeningBalance);
router.post('/client-adjustment', createClientAdjustment);
router.post('/:id/revert', revertTransaction);

export default router;
