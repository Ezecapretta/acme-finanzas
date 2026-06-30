import { Router } from 'express';
import { getBoxes, createBox, updateBox, deleteBox } from '../controllers/box.controller';

const router = Router();

router.get('/', getBoxes);
router.post('/', createBox);
router.put('/:id', updateBox);
router.delete('/:id', deleteBox);

export default router;
