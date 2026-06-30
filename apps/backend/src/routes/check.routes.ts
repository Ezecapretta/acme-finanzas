import { Router } from 'express';
import { getChecks, createCheck, updateCheck, updateCheckStatus, voidCheck, bulkIncomeChecks } from '../controllers/check.controller';

const router = Router();

router.get('/', getChecks);
router.post('/', createCheck);
router.post('/bulk-income', bulkIncomeChecks);
router.put('/:id', updateCheck);
router.patch('/:id/status', updateCheckStatus);
router.patch('/:id/void', voidCheck);

export default router;
