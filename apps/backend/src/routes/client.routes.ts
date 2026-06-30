import { Router } from 'express';
import { getClients, createClient, getClientById, exportClientPDF, updateClient } from '../controllers/client.controller';

const router = Router();

router.get('/', getClients);
router.get('/:id', getClientById);
router.get('/:id/export-pdf', exportClientPDF);
router.post('/', createClient);
router.put('/:id', updateClient);

export default router;
