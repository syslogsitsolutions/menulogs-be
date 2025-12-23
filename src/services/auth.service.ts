import prisma from '../config/database';
import { hashPassword, comparePassword } from '../utils/password.util';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  getTokenExpiryDate,
} from '../utils/jwt.util';
import emailService from './email.service';
import { serializeLocations } from '../utils/serialization.util';
import * as crypto from 'crypto';

export class AuthService {
  // Signup
  async signup(name: string, email: string, password: string) {
    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new Error('Email already registered');
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    // Generate tokens
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = generateRefreshToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Store refresh token
    await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken,
        expiresAt: getTokenExpiryDate(7),
      },
    });

    // Send welcome email (non-blocking)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const dashboardLink = `${frontendUrl}/dashboard`;
    
    emailService.sendWelcomeEmail(user.email, user.name, dashboardLink).catch((error) => {
      console.error('[Email Error] Failed to send welcome email:', error);
      // Don't throw - email failure shouldn't block signup
    });

    return {
      user,
      accessToken,
      refreshToken,
    };
  }

  // Login
  async login(email: string, password: string, userAgent?: string, ipAddress?: string) {
    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Verify password
    const isValid = await comparePassword(password, user.password);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // Generate tokens
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = generateRefreshToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Store refresh token
    await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken,
        userAgent,
        ipAddress,
        expiresAt: getTokenExpiryDate(7),
      },
    });

    // Get user's businesses and locations
    const businesses = await prisma.business.findMany({
      where: { ownerId: user.id },
      include: {
        locations: true,
      },
    });

    // Serialize locations to convert BigInt to strings
    const serializedBusinesses = businesses.map((business) => ({
      ...business,
      locations: serializeLocations(business.locations),
    }));

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      business: serializedBusinesses[0] || null,
      locations: serializedBusinesses[0]?.locations || [],
      accessToken,
      refreshToken,
    };
  }

  // Refresh token
  async refreshAccessToken(refreshToken: string) {
    try {
      // Verify refresh token JWT first
      verifyRefreshToken(refreshToken);

      // Check if session exists in database
      const session = await prisma.session.findUnique({
        where: { refreshToken },
        include: { user: true },
      });

      if (!session) {
        throw new Error('Session not found');
      }

      if (session.expiresAt < new Date()) {
        // Clean up expired session
        await prisma.session.delete({ where: { id: session.id } });
        throw new Error('Refresh token expired');
      }

      // Generate new tokens
      const newAccessToken = generateAccessToken({
        userId: session.user.id,
        email: session.user.email,
        role: session.user.role,
      });

      const newRefreshToken = generateRefreshToken({
        userId: session.user.id,
        email: session.user.email,
        role: session.user.role,
      });

      // Update session with new refresh token
      // Note: updatedAt is automatically handled by Prisma if @updatedAt is in schema
      await prisma.session.update({
        where: { id: session.id },
        data: {
          refreshToken: newRefreshToken,
          expiresAt: getTokenExpiryDate(7),
        },
      });

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } catch (error) {
      // Log error for debugging
      console.error('[Refresh Token Error]', error);
      throw new Error('Invalid or expired refresh token');
    }
  }

  // Logout
  async logout(refreshToken: string) {
    await prisma.session.deleteMany({
      where: { refreshToken },
    });
  }

  // Get current user
  async getCurrentUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const businesses = await prisma.business.findMany({
      where: { ownerId: userId },
      include: {
        locations: true,
      },
    });

    // Serialize locations to convert BigInt to strings
    const serializedBusinesses = businesses.map((business) => ({
      ...business,
      locations: serializeLocations(business.locations),
    }));

    return {
      user,
      business: serializedBusinesses[0] || null,
      locations: serializedBusinesses[0]?.locations || [],
    };
  }

  // Forgot password - generate reset token
  async forgotPassword(email: string): Promise<{ token: string; message: string }> {
    const user = await prisma.user.findUnique({ where: { email } });
    
    // Always return success to prevent email enumeration
    // In production, you would send an email here
    if (!user) {
      return {
        token: '', // Don't return token if user doesn't exist
        message: 'If an account with that email exists, a password reset link has been sent.',
      };
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    
    // Set expiration to 1 hour
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    // Invalidate any existing tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        used: false,
      },
      data: {
        used: true,
      },
    });

    // Create new reset token
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    // Send password reset email
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
    
    emailService.sendPasswordResetEmail(user.email, user.name, resetLink).catch((error) => {
      console.error('[Email Error] Failed to send password reset email:', error);
      // Log error but don't throw - don't reveal if user exists
    });

    // In development, also log the reset link for testing
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Password Reset] Token for ${email}: ${token}`);
      console.log(`[Password Reset] Reset link: ${resetLink}`);
    }

    return {
      token: process.env.NODE_ENV === 'development' ? token : '', // Only return token in development
      message: 'If an account with that email exists, a password reset link has been sent.',
    };
  }

  // Reset password using token
  async resetPassword(token: string, newPassword: string): Promise<void> {
    // Find valid token
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken) {
      throw new Error('Invalid or expired reset token');
    }

    // Check if token is used
    if (resetToken.used) {
      throw new Error('Reset token has already been used');
    }

    // Check if token is expired
    if (resetToken.expiresAt < new Date()) {
      // Mark as used even though expired
      await prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      });
      throw new Error('Reset token has expired');
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update user password
    await prisma.user.update({
      where: { id: resetToken.userId },
      data: { password: hashedPassword },
    });

    // Mark token as used
    await prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { used: true },
    });

    // Invalidate all sessions for security
    await prisma.session.deleteMany({
      where: { userId: resetToken.userId },
    });
  }

  // Change password (for authenticated users)
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const isValid = await comparePassword(currentPassword, user.password);
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    // Invalidate all sessions for security (user will need to login again)
    await prisma.session.deleteMany({
      where: { userId },
    });
  }
}

export default new AuthService();

