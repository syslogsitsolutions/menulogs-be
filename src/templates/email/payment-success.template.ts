/**
 * Payment Successful Email Template
 */

export function getPaymentSuccessTemplate(
  userName: string,
  planName: string,
  amount: string,
  currency: string,
  paymentId: string,
  dashboardLink: string
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px;">
        <h1 style="color: #1a472a;">Payment Successful! ✅</h1>
        <p>Thank you, ${userName}!</p>
        <p>Your payment for ${planName} has been processed successfully.</p>
        <p><strong>Amount:</strong> ${amount} ${currency}</p>
        <p><strong>Payment ID:</strong> ${paymentId}</p>
        <a href="${dashboardLink}" style="display: inline-block; padding: 12px 24px; background: #1a472a; color: white; text-decoration: none; border-radius: 6px;">View Dashboard</a>
      </div>
    </body>
    </html>
  `;
}

