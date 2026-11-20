import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { accountKey, limitRequests, rejectBody } from '../middleware/httpSecurity.js';
import { createPairingCode } from '../ws/deviceAuth.js';

const router = Router();

router.use(authMiddleware, limitRequests(10, 60_000, accountKey));

// Código de un solo uso para vincular el guante a la cuenta desde el portal Wi-Fi del ESP32.
router.post('/pairing', rejectBody, (req: AuthenticatedRequest, res: Response) => {
  res.status(201).json(createPairingCode(req.user!.userId));
});

export default router;
