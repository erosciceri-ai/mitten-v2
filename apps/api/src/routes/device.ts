import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { accountKey, limitRequests, rejectBody } from '../middleware/httpSecurity.js';
import { createPairingCode, listUserDevices, revokeUserDevice } from '../ws/deviceAuth.js';
import { disconnectRevokedDevice, isDeviceOnline } from '../ws/relay.js';

const router = Router();

router.use(authMiddleware);

// Código de un solo uso para vincular el guante a la cuenta desde el portal Wi-Fi del ESP32.
router.post(
  '/pairing',
  limitRequests(10, 60_000, accountKey),
  rejectBody,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(await createPairingCode(req.user!.userId));
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/',
  limitRequests(60, 60_000, accountKey),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const devices = await listUserDevices(userId);
      res.json({
        devices: devices.map(device => ({
          ...device,
          online: device.revokedAt === null && isDeviceOnline(userId, device.id),
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/:id',
  limitRequests(30, 60_000, accountKey),
  rejectBody,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const deviceId = String(req.params.id);
      const outcome = await revokeUserDevice(userId, deviceId);
      if (outcome === 'not_found') {
        return next(new AppError('Device not found', 404));
      }
      disconnectRevokedDevice(userId, deviceId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

export default router;
