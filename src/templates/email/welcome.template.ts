/**
 * Welcome Email Template
 */
export function getWelcomeTemplate(userName: string, dashboardLink: string): string {
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
                <td align="center" style="padding: 40px 40px 30px 40px; background: linear-gradient(135deg, #1a472a 0%, #2d5a3d 100%);">
                  <img src="https://menulogs-uploads-prod.s3.ap-south-1.amazonaws.com/app-assets/logos/logo-black.png" alt="MenuLogs Logo" width="120" height="auto" style="display: block; max-width: 120px; height: auto; border: 0; background-color: #ffffff; padding: 12px; border-radius: 8px;" />
                </td>
              </tr>
              
              <!-- Main Content -->
              <tr>
                <td style="padding: 40px 40px 30px 40px;">
                  <!-- Welcome Heading -->
                  <h1 style="margin: 0 0 20px 0; font-size: 28px; font-weight: 700; color: #1a472a; line-height: 1.2;">
                    Welcome to MenuLogs! 🎉
                  </h1>
                  
                  <!-- Greeting -->
                  <p style="margin: 0 0 20px 0; font-size: 16px; color: #374151;">
                    Hello <strong style="color: #1a472a;">${userName}</strong>!
                  </p>
                  
                  <!-- Welcome Message -->
                  <p style="margin: 0 0 30px 0; font-size: 16px; color: #4b5563; line-height: 1.7;">
                    Thank you for joining MenuLogs! We're excited to have you on board and help you streamline your restaurant's menu management.
                  </p>
                  
                  <!-- CTA Button -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" style="padding: 10px 0 30px 0;">
                        <a href="${dashboardLink}" style="display: inline-block; padding: 14px 32px; background-color: #1a472a; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; text-align: center; transition: background-color 0.3s;">
                          Go to Dashboard
                        </a>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- Additional Info -->
                  <div style="background-color: #f9fafb; border-left: 4px solid #1a472a; padding: 16px 20px; margin: 30px 0; border-radius: 4px;">
                    <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
                      <strong style="color: #1a472a;">Get started:</strong> Explore your dashboard to manage locations, create menus, track orders, and much more!
                    </p>
                  </div>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="padding: 30px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
                  <p style="margin: 0 0 10px 0; font-size: 14px; color: #6b7280; text-align: center;">
                    Need help? We're here for you!
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

