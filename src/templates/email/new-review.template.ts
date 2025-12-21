/**
 * New Review Notification Email Template
 */

export function getNewReviewTemplate(
  businessName: string,
  locationName: string,
  customerName: string,
  rating: number,
  reviewText: string,
  reviewLink: string
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px;">
        <h1 style="color: #1a472a;">New Review Received! ⭐</h1>
        <p>Hello ${businessName},</p>
        <p>You have received a new review for ${locationName}!</p>
        <p><strong>Customer:</strong> ${customerName}</p>
        <p><strong>Rating:</strong> ${rating}/5 ⭐</p>
        <p><strong>Review:</strong> "${reviewText}"</p>
        <a href="${reviewLink}" style="display: inline-block; padding: 12px 24px; background: #1a472a; color: white; text-decoration: none; border-radius: 6px;">View All Reviews</a>
      </div>
    </body>
    </html>
  `;
}

