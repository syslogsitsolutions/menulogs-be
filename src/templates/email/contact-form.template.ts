/**
 * Contact Form Email Template
 */
export function getContactFormTemplate(
  name: string,
  email: string,
  company: string | null,
  phone: string | null,
  plan: string | null,
  message: string
): string {
  const planDisplay = plan ? plan.charAt(0) + plan.slice(1).toLowerCase() : 'General Inquiry';
  
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
              
              <!-- Header -->
              <tr>
                <td align="center" style="padding: 40px 40px 30px 40px; background: linear-gradient(135deg, #1a472a 0%, #2d5a3d 100%);">
                  <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #ffffff; line-height: 1.2;">
                    New Contact Form Submission
                  </h1>
                </td>
              </tr>
              
              <!-- Main Content -->
              <tr>
                <td style="padding: 40px 40px 30px 40px;">
                  <!-- Info Section -->
                  <div style="background-color: #f9fafb; border-left: 4px solid #1a472a; padding: 20px; margin-bottom: 30px; border-radius: 4px;">
                    <h2 style="margin: 0 0 15px 0; font-size: 18px; font-weight: 600; color: #1a472a;">
                      Contact Information
                    </h2>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding: 8px 0; font-size: 14px; color: #374151;">
                          <strong style="color: #1a472a;">Name:</strong> ${name}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; font-size: 14px; color: #374151;">
                          <strong style="color: #1a472a;">Email:</strong> <a href="mailto:${email}" style="color: #1a472a; text-decoration: none;">${email}</a>
                        </td>
                      </tr>
                      ${company ? `
                      <tr>
                        <td style="padding: 8px 0; font-size: 14px; color: #374151;">
                          <strong style="color: #1a472a;">Company:</strong> ${company}
                        </td>
                      </tr>
                      ` : ''}
                      ${phone ? `
                      <tr>
                        <td style="padding: 8px 0; font-size: 14px; color: #374151;">
                          <strong style="color: #1a472a;">Phone:</strong> <a href="tel:${phone}" style="color: #1a472a; text-decoration: none;">${phone}</a>
                        </td>
                      </tr>
                      ` : ''}
                      <tr>
                        <td style="padding: 8px 0; font-size: 14px; color: #374151;">
                          <strong style="color: #1a472a;">Plan Interest:</strong> ${planDisplay}
                        </td>
                      </tr>
                    </table>
                  </div>
                  
                  <!-- Message Section -->
                  <div style="margin-top: 30px;">
                    <h2 style="margin: 0 0 15px 0; font-size: 18px; font-weight: 600; color: #1a472a;">
                      Message
                    </h2>
                    <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px;">
                      <p style="margin: 0; font-size: 15px; color: #4b5563; line-height: 1.7; white-space: pre-wrap;">
                        ${message}
                      </p>
                    </div>
                  </div>
                  
                  <!-- Action Section -->
                  <div style="margin-top: 30px; padding-top: 30px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 15px 0; font-size: 14px; color: #6b7280;">
                      <strong>Quick Actions:</strong>
                    </p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td>
                          <a href="mailto:${email}" style="display: inline-block; padding: 10px 20px; background-color: #1a472a; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px; margin-right: 10px;">
                            Reply to ${name}
                          </a>
                        </td>
                      </tr>
                    </table>
                  </div>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="padding: 30px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
                  <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">
                    This email was sent from the MenuLogs contact form.<br />
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

