/**
 * Payment Failed Email Template
 */

export function getPaymentFailedTemplate(
  userName: string,
  planName: string,
  failureReason: string,
  paymentLink: string
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px;">
        <h1 style="color: #dc2626;">Payment Failed</h1>
        <p>Hello ${userName},</p>
        <p>We were unable to process your payment for ${planName}.</p>
        <p><strong>Reason:</strong> ${failureReason}</p>
        <a href="${paymentLink}" style="display: inline-block; padding: 12px 24px; background: #1a472a; color: white; text-decoration: none; border-radius: 6px;">Update Payment Method</a>
      </div>
    </body>
    </html>
  `;
}

