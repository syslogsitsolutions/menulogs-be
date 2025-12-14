import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import {
  generatePublicUrl,
  generateQRCodePNG,
  generateQRCodeDataURL,
  generateQRCodeSVG,
} from '../utils/qrcode.util';

export class QRCodeController {
  // GET /api/v1/qrcode/locations/:locationId/info
  async getInfo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { locationId } = req.params;
      const userId = req.user!.userId;

      // Verify ownership and get location
      const location = await prisma.location.findFirst({
        where: {
          id: locationId,
          business: { ownerId: userId },
        },
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
        },
      });

      if (!location) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      if (!location.isActive) {
        res.status(400).json({ error: 'Cannot generate QR code for inactive location' });
        return;
      }

      const publicUrl = generatePublicUrl(location.slug);

      res.json({
        url: publicUrl,
        location: {
          id: location.id,
          name: location.name,
          slug: location.slug,
          isActive: location.isActive,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/qrcode/locations/:locationId
  async generate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { locationId } = req.params;
      const { format = 'png', size, margin } = req.query;
      const userId = req.user!.userId;

      // Verify ownership and get location
      const location = await prisma.location.findFirst({
        where: {
          id: locationId,
          business: { ownerId: userId },
        },
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
        },
      });

      if (!location) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      if (!location.isActive) {
        res.status(400).json({ error: 'Cannot generate QR code for inactive location' });
        return;
      }

      const publicUrl = generatePublicUrl(location.slug);
      const options = {
        size: size ? parseInt(size as string, 10) : undefined,
        margin: margin ? parseInt(margin as string, 10) : undefined,
      };

      switch (format) {
        case 'data-url':
          const dataUrl = await generateQRCodeDataURL(publicUrl, options);
          res.json({
            dataUrl,
            url: publicUrl,
            location: {
              id: location.id,
              name: location.name,
              slug: location.slug,
            },
          });
          break;

        case 'svg':
          const svg = await generateQRCodeSVG(publicUrl, options);
          res.setHeader('Content-Type', 'image/svg+xml');
          res.send(svg);
          break;

        case 'png':
        default:
          const pngBuffer = await generateQRCodePNG(publicUrl, options);
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Content-Disposition', `inline; filename="qrcode-${location.slug}.png"`);
          res.send(pngBuffer);
          break;
      }
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/qrcode/locations/:locationId/download
  async download(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { locationId } = req.params;
      const { size } = req.query;
      const userId = req.user!.userId;

      // Verify ownership and get location
      const location = await prisma.location.findFirst({
        where: {
          id: locationId,
          business: { ownerId: userId },
        },
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
        },
      });

      if (!location) {
        res.status(404).json({ error: 'Location not found' });
        return;
      }

      if (!location.isActive) {
        res.status(400).json({ error: 'Cannot generate QR code for inactive location' });
        return;
      }

      const publicUrl = generatePublicUrl(location.slug);
      const options = {
        size: size ? parseInt(size as string, 10) : 500, // Default 500 for download
      };

      const pngBuffer = await generateQRCodePNG(publicUrl, options);

      res.setHeader('Content-Type', 'image/png');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="qrcode-${location.slug}.png"`
      );
      res.send(pngBuffer);
    } catch (error) {
      next(error);
    }
  }
}

export default new QRCodeController();

