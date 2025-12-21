import axios from 'axios';
import nodemailer from 'nodemailer';
import emailConfig from '../config/email';
import { logger } from '../utils/logger.util';
import {
  getPasswordResetTemplate,
  getWelcomeTemplate,
  getVerificationTemplate,
  getPaymentSuccessTemplate,
  getPaymentFailedTemplate,
  getSubscriptionActivatedTemplate,
  getSubscriptionCancelledTemplate,
  getNewOrderTemplate,
  getNewReviewTemplate,
} from '../templates/email';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
  templateId?: string; // For ZeptoMail templates
  templateData?: Record<string, string>; // For ZeptoMail template variables
}

export class EmailService {
  private smtpTransporter: nodemailer.Transporter | null = null;

  constructor() {
    // Initialize SMTP transporter if using SMTP
    if (emailConfig.provider === 'smtp' && emailConfig.smtp) {
      this.smtpTransporter = nodemailer.createTransport({
        host: emailConfig.smtp.host,
        port: emailConfig.smtp.port,
        secure: emailConfig.smtp.secure,
        auth: {
          user: emailConfig.smtp.user,
          pass: emailConfig.smtp.password,
        },
      });
    }
  }

  /**
   * Send email using configured provider (ZeptoMail or SMTP)
   */
  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      if (emailConfig.provider === 'zeptomail') {
        await this.sendViaZeptoMail(options);
      } else if (emailConfig.provider === 'smtp') {
        await this.sendViaSMTP(options);
      } else {
        throw new Error(`Unsupported email provider: ${emailConfig.provider}`);
      }

      logger.info(`Email sent successfully to ${options.to}`, {
        subject: options.subject,
        provider: emailConfig.provider,
      });
    } catch (error) {
      logger.error('Failed to send email', {
        to: options.to,
        subject: options.subject,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Send email via ZeptoMail API
   */
  private async sendViaZeptoMail(options: EmailOptions): Promise<void> {
    if (!emailConfig.zeptomail) {
      throw new Error('ZeptoMail configuration is missing');
    }

    const { apiToken } = emailConfig.zeptomail;

    // ZeptoMail API endpoint
    const apiUrl = 'https://api.zeptomail.com/v1.1/email';

    // Prepare email data
    const emailData: any = {
      from: {
        address: options.from || emailConfig.from,
        name: options.fromName || emailConfig.fromName,
      },
      to: [
        {
          email_address: {
            address: options.to,
          },
        },
      ],
      subject: options.subject,
      htmlbody: options.html,
      textbody: options.text || this.htmlToText(options.html),
    };

    // Add reply-to if specified
    if (options.replyTo || emailConfig.replyTo) {
      emailData.reply_to_address = {
        address: options.replyTo || emailConfig.replyTo,
      };
    }

    // Use template if templateId is provided
    if (options.templateId && options.templateData) {
      emailData.template_id = options.templateId;
      emailData.template_data = options.templateData;
    }

    // Send via ZeptoMail API
    // ZeptoMail uses: Authorization: zoho-enczapikey <send mail token>
    const response = await axios.post(apiUrl, emailData, {
      headers: {
        'Authorization': `zoho-enczapikey ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status !== 200) {
      throw new Error(`ZeptoMail API error: ${response.statusText}`);
    }
  }

  /**
   * Send email via SMTP
   */
  private async sendViaSMTP(options: EmailOptions): Promise<void> {
    if (!this.smtpTransporter) {
      throw new Error('SMTP transporter is not initialized');
    }

    const mailOptions = {
      from: `${options.fromName || emailConfig.fromName} <${options.from || emailConfig.from}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || this.htmlToText(options.html),
      replyTo: options.replyTo || emailConfig.replyTo,
    };

    await this.smtpTransporter.sendMail(mailOptions);
  }

  /**
   * Convert HTML to plain text (simple implementation)
   */
  private htmlToText(html: string): string {
    return html
      .replace(/<style[^>]*>.*?<\/style>/gis, '')
      .replace(/<script[^>]*>.*?<\/script>/gis, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\n\s*\n/g, '\n')
      .trim();
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    to: string,
    userName: string,
    resetLink: string
  ): Promise<void> {
    const html = getPasswordResetTemplate(userName, resetLink);
    const subject = 'Reset Your MenuLogs Password';

    await this.sendEmail({
      to,
      subject,
      html,
    });
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(to: string, userName: string, dashboardLink: string): Promise<void> {
    const html = getWelcomeTemplate(userName, dashboardLink);
    const subject = 'Welcome to MenuLogs! 🎉';

    await this.sendEmail({
      to,
      subject,
      html,
    });
  }

  /**
   * Send email verification email
   */
  async sendVerificationEmail(
    to: string,
    userName: string,
    verificationLink: string
  ): Promise<void> {
    const html = getVerificationTemplate(userName, verificationLink);
    const subject = 'Verify Your Email Address';

    await this.sendEmail({
      to,
      subject,
      html,
    });
  }

  /**
   * Send payment successful email
   */
  async sendPaymentSuccessEmail(
    to: string,
    userName: string,
    planName: string,
    amount: string,
    currency: string,
    paymentId: string,
    _paymentDate: string,
    dashboardLink: string
  ): Promise<void> {
    const html = getPaymentSuccessTemplate(
      userName,
      planName,
      amount,
      currency,
      paymentId,
      dashboardLink
    );
    const subject = 'Payment Successful - Thank You!';

    await this.sendEmail({
      to,
      subject,
      html,
    });
  }

  /**
   * Send payment failed email
   */
  async sendPaymentFailedEmail(
    to: string,
    userName: string,
    planName: string,
    _amount: string,
    _currency: string,
    failureReason: string,
    paymentLink: string
  ): Promise<void> {
    const html = getPaymentFailedTemplate(
      userName,
      planName,
      failureReason,
      paymentLink
    );
    const subject = 'Payment Failed - Action Required';

    await this.sendEmail({
      to,
      subject,
      html,
    });
  }

  /**
   * Send subscription activated email
   */
  async sendSubscriptionActivatedEmail(
    to: string,
    userName: string,
    planName: string,
    billingCycle: string,
    nextBillingDate: string,
    dashboardLink: string
  ): Promise<void> {
    const html = getSubscriptionActivatedTemplate(
      userName,
      planName,
      billingCycle,
      nextBillingDate,
      dashboardLink
    );
    const subject = 'Your Subscription is Now Active! 🎉';

    await this.sendEmail({
      to,
      subject,
      html,
    });
  }

  /**
   * Send subscription cancelled email
   */
  async sendSubscriptionCancelledEmail(
    to: string,
    userName: string,
    planName: string,
    accessUntilDate: string,
    feedbackLink: string
  ): Promise<void> {
    const html = getSubscriptionCancelledTemplate(
      userName,
      planName,
      accessUntilDate,
      feedbackLink
    );
    const subject = 'Subscription Cancelled';

    await this.sendEmail({
      to,
      subject,
      html,
    });
  }

  /**
   * Send new order notification email
   */
  async sendNewOrderEmail(
    to: string,
    businessName: string,
    locationName: string,
    orderNumber: string,
    customerName: string,
    orderTotal: string,
    currency: string,
    _orderTime: string,
    orderLink: string
  ): Promise<void> {
    const html = getNewOrderTemplate(
      businessName,
      locationName,
      orderNumber,
      customerName,
      orderTotal,
      currency,
      orderLink
    );
    const subject = `New Order Received - ${orderNumber}`;

    await this.sendEmail({
      to,
      subject,
      html,
    });
  }

  /**
   * Send new review notification email
   */
  async sendNewReviewEmail(
    to: string,
    businessName: string,
    locationName: string,
    customerName: string,
    rating: number,
    reviewText: string,
    reviewLink: string
  ): Promise<void> {
    const html = getNewReviewTemplate(
      businessName,
      locationName,
      customerName,
      rating,
      reviewText,
      reviewLink
    );
    const subject = `New Review Received - ${locationName}`;

    await this.sendEmail({
      to,
      subject,
      html,
    });
  }
}

export default new EmailService();

