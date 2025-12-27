/**
 * Password Reset Email Template
 */
export function getPasswordResetTemplate(userName: string, resetLink: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f7fa; line-height: 1.6;">
      <!-- Main Container -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f5f7fa; padding: 40px 20px;">
        <tr>
          <td align="center">
            <!-- Email Content Container -->
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07); overflow: hidden;">
              
              <!-- Header with Logo -->
              <tr>
                <td align="center" style="padding: 40px 40px 30px 40px; background: linear-gradient(135deg, #ee6620 0%, #d45a1c 100%);">
                  <img src="https://menulogs-uploads-prod.s3.ap-south-1.amazonaws.com/app-assets/logos/logo-black.png" alt="MenuLogs Logo" width="120" height="auto" style="display: block; max-width: 120px; height: auto; border: 0; background-color: #ffffff; padding: 12px; border-radius: 8px;" />
                </td>
              </tr>
              
              <!-- Main Content -->
              <tr>
                <td style="padding: 40px 40px 30px 40px;">
                  <!-- Heading -->
                  <h1 style="margin: 0 0 20px 0; font-size: 28px; font-weight: 700; color: #ee6620; line-height: 1.2;">
                    Reset Your Password
                  </h1>
                  
                  <!-- Greeting -->
                  <p style="margin: 0 0 20px 0; font-size: 16px; color: #374151;">
                    Hello <strong style="color: #ee6620;">${userName}</strong>,
                  </p>
                  
                  <!-- Message -->
                  <p style="margin: 0 0 30px 0; font-size: 16px; color: #4b5563; line-height: 1.7;">
                    We received a request to reset your password. Click the button below to create a new password. If you didn't request this, you can safely ignore this email.
                  </p>
                  
                  <!-- CTA Button -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" style="padding: 10px 0 30px 0;">
                        <a href="${resetLink}" style="display: inline-block; padding: 14px 32px; background-color: #ee6620; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; text-align: center;">
                          Reset Password
                        </a>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- Security Notice -->
                  <div style="background-color: #fff5f0; border-left: 4px solid #ee6620; padding: 16px 20px; margin: 30px 0; border-radius: 4px;">
                    <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
                      <strong style="color: #ee6620;">Security notice:</strong> This password reset link will expire in <strong>1 hour</strong> for your security.
                    </p>
                    <p style="margin: 8px 0 0 0; font-size: 13px; color: #9ca3af; line-height: 1.5;">
                      If the button doesn't work, copy and paste this link into your browser: <span style="word-break: break-all; color: #6b7280;">${resetLink}</span>
                    </p>
                  </div>
                  
                  <!-- Additional Info -->
                  <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
                    If you didn't request a password reset, please ignore this email or contact support if you have concerns about your account security.
                  </p>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="padding: 30px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
                  <p style="margin: 0 0 10px 0; font-size: 14px; color: #6b7280; text-align: center;">
                    Need help? Contact our support team.
                  </p>
                  <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">
                    © ${new Date().getFullYear()} MenuLogs. All rights reserved.
                  </p>
                </td>
              </tr>
              
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

