import { Router } from 'express';
import qrcodeController from '../controllers/qrcode.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All QR code routes require authentication
router.use(authenticate);

// QR code endpoints
router.get('/locations/:locationId/info', qrcodeController.getInfo.bind(qrcodeController));
router.get('/locations/:locationId', qrcodeController.generate.bind(qrcodeController));
router.get('/locations/:locationId/download', qrcodeController.download.bind(qrcodeController));

export default router;

