import { Router } from 'express';
import { healthController } from '../controllers/healthController';

const router = Router();

router.get('/health', (req, res, next) => healthController.check(req, res, next));

export default router;