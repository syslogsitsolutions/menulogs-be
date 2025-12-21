/**
 * Email Verification Template
 */

export function getVerificationTemplate(userName: string, verificationLink: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px;">
        <h1 style="color: #1a472a;">Verify Your Email</h1>
        <p>Hello ${userName},</p>
        <p>Click the button below to verify your email:</p>
        <a href="${verificationLink}" style="display: inline-block; padding: 12px 24px; background: #1a472a; color: white; text-decoration: none; border-radius: 6px;">Verify Email</a>
      </div>
    </body>
    </html>
  `;
}

