/**
 * QR Code Utility Functions
 * Generate QR codes for location public URLs
 */

import QRCode from 'qrcode';

export interface QRCodeOptions {
  size?: number;
  margin?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

const DEFAULT_OPTIONS: Required<QRCodeOptions> = {
  size: 300,
  margin: 4,
  errorCorrectionLevel: 'M',
};

/**
 * Generate public URL for a location
 * @param slug - Location slug
 * @returns Full public URL
 */
export const generatePublicUrl = (slug: string): string => {
  const baseUrl = process.env.PUBLIC_URL_BASE || process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${baseUrl}/${slug}`;
};

/**
 * Generate QR code as PNG buffer
 * @param url - URL to encode in QR code
 * @param options - QR code options
 * @returns PNG buffer
 */
export const generateQRCodePNG = async (
  url: string,
  options: QRCodeOptions = {}
): Promise<Buffer> => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  return QRCode.toBuffer(url, {
    type: 'png',
    width: opts.size,
    margin: opts.margin,
    errorCorrectionLevel: opts.errorCorrectionLevel,
  });
};

/**
 * Generate QR code as data URL (base64)
 * @param url - URL to encode in QR code
 * @param options - QR code options
 * @returns Data URL string
 */
export const generateQRCodeDataURL = async (
  url: string,
  options: QRCodeOptions = {}
): Promise<string> => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  return QRCode.toDataURL(url, {
    width: opts.size,
    margin: opts.margin,
    errorCorrectionLevel: opts.errorCorrectionLevel,
  });
};

/**
 * Generate QR code as SVG string
 * @param url - URL to encode in QR code
 * @param options - QR code options
 * @returns SVG string
 */
export const generateQRCodeSVG = async (
  url: string,
  options: QRCodeOptions = {}
): Promise<string> => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  return QRCode.toString(url, {
    type: 'svg',
    width: opts.size,
    margin: opts.margin,
    errorCorrectionLevel: opts.errorCorrectionLevel,
  });
};

