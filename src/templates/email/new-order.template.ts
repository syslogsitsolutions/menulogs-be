/**
 * New Order Notification Email Template
 */

export function getNewOrderTemplate(
  businessName: string,
  locationName: string,
  orderNumber: string,
  customerName: string,
  orderTotal: string,
  currency: string,
  orderLink: string
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px;">
        <h1 style="color: #1a472a;">New Order Received! 🎉</h1>
        <p>Hello ${businessName},</p>
        <p>You have received a new order at ${locationName}!</p>
        <p><strong>Order Number:</strong> #${orderNumber}</p>
        <p><strong>Customer:</strong> ${customerName}</p>
        <p><strong>Total:</strong> ${orderTotal} ${currency}</p>
        <a href="${orderLink}" style="display: inline-block; padding: 12px 24px; background: #1a472a; color: white; text-decoration: none; border-radius: 6px;">View Order Details</a>
      </div>
    </body>
    </html>
  `;
}

