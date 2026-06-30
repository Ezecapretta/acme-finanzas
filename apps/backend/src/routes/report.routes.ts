import { Router } from 'express';
import { getDailyClosing, getBalanceSheet, getDailyPL, getAgencyBalance } from '../controllers/report.controller';

const router = Router();

router.get('/daily-closing', getDailyClosing);
router.get('/balance-sheet', getBalanceSheet);
router.get('/daily-pl', getDailyPL);
router.get('/agency-balance', getAgencyBalance);

export default router;
