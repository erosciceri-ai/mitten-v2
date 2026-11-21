import { Router, type Response } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { accountKey, limitConcurrent, limitRequests, rejectBody } from '../middleware/httpSecurity.js';
import { createAudioPackage } from '../services/audioPackage.js';

const router = Router();
const exportZip = limitConcurrent(2);
router.get('/package', authMiddleware, limitRequests(5, 60_000, accountKey), rejectBody, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await exportZip(() => createAudioPackage(req.user!.userId));
  if (!result.ok) {
    res.status(409).json({ message: 'Faltan archivos MP3 para preparar la microSD.', status: 409, missingTracks: result.missingTracks });
    return;
  }
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="mitten-microsd.zip"');
  res.send(result.archive);
}));
export default router;
