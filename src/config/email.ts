import dotenv from 'dotenv';

dotenv.config();

export interface EmailConfig {
  provider: 'zeptomail' | 'smtp';
  from: string;
  fromName: string;
  replyTo: string;
  // ZeptoMail config
  zeptomail?: {
    apiToken: string; // Send Mail Token from ZeptoMail dashboard
    bounceAddress?: string;
  };
  // SMTP config
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
  };
}

const getEmailConfig = (): EmailConfig => {
  const provider = (process.env.EMAIL_PROVIDER || 'zeptomail') as 'zeptomail' | 'smtp';

  const config: EmailConfig = {
    provider,
    from: process.env.EMAIL_FROM || 'noreply@menulogs.com',
    fromName: process.env.EMAIL_FROM_NAME || 'MenuLogs',
    replyTo: process.env.EMAIL_REPLY_TO || 'support@menulogs.com',
  };

  if (provider === 'zeptomail') {
    const apiToken = process.env.ZEPTOMAIL_API_TOKEN;

    if (!apiToken) {
      throw new Error(
        'ZeptoMail API token is required. Set ZEPTOMAIL_API_TOKEN in your .env file. Get it from ZeptoMail dashboard → Mail Agents → SMTP & API Info → API tab.'
      );
    }

    config.zeptomail = {
      apiToken,
      bounceAddress: process.env.ZEPTOMAIL_BOUNCE_ADDRESS,
    };
  } else if (provider === 'smtp') {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const password = process.env.SMTP_PASS;

    if (!host || !port || !user || !password) {
      throw new Error(
        'SMTP configuration is incomplete. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in your .env file.'
      );
    }

    config.smtp = {
      host,
      port: parseInt(port, 10),
      secure: process.env.SMTP_SECURE === 'true',
      user,
      password,
    };
  }

  return config;
};

export default getEmailConfig();

