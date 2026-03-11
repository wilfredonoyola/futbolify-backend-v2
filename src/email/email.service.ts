// Email Service using AWS SES

import { Injectable, Logger } from '@nestjs/common';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private sesClient: SESClient;
  private readonly fromEmail: string;
  private readonly isProduction: boolean;

  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
    this.fromEmail = process.env.SES_FROM_EMAIL || 'noreply@futbolify.com';

    // Initialize SES client
    this.sesClient = new SESClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    // In development, just log the email
    if (!this.isProduction) {
      this.logger.log(`[DEV] Email to ${options.to}:`);
      this.logger.log(`Subject: ${options.subject}`);
      this.logger.log(`Body: ${options.text || options.html}`);
      return true;
    }

    try {
      const command = new SendEmailCommand({
        Source: this.fromEmail,
        Destination: {
          ToAddresses: [options.to],
        },
        Message: {
          Subject: {
            Data: options.subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: options.html,
              Charset: 'UTF-8',
            },
            ...(options.text && {
              Text: {
                Data: options.text,
                Charset: 'UTF-8',
              },
            }),
          },
        },
      });

      await this.sesClient.send(command);
      this.logger.log(`Email sent to ${options.to}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}:`, error);
      return false;
    }
  }

  // Send verification code for quiniela admin
  async sendQuinielaVerificationCode(
    email: string,
    code: string,
    quinielaName: string,
  ): Promise<boolean> {
    const subject = `Tu código de verificación: ${code}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 32px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">Futbolify</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">Mundial 2026</p>
    </div>

    <!-- Content -->
    <div style="padding: 32px;">
      <h2 style="color: #1f2937; margin: 0 0 16px; font-size: 20px;">
        Verifica tu email
      </h2>

      <p style="color: #6b7280; margin: 0 0 24px; line-height: 1.6;">
        Usa este código para confirmar tu acceso de administrador a la quiniela <strong>"${quinielaName}"</strong>:
      </p>

      <!-- Code Box -->
      <div style="background: #f3f4f6; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
        <span style="font-family: monospace; font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1f2937;">
          ${code}
        </span>
      </div>

      <p style="color: #9ca3af; margin: 0; font-size: 13px; text-align: center;">
        Este código expira en 10 minutos.
      </p>
    </div>

    <!-- Footer -->
    <div style="background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #9ca3af; margin: 0; font-size: 12px;">
        Si no solicitaste este código, puedes ignorar este email.
      </p>
    </div>

  </div>
</body>
</html>
    `.trim();

    const text = `
Tu código de verificación para Futbolify es: ${code}

Usa este código para confirmar tu acceso de administrador a la quiniela "${quinielaName}".

Este código expira en 10 minutos.

Si no solicitaste este código, puedes ignorar este email.
    `.trim();

    return this.sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }

  // Send admin link after email verification
  async sendQuinielaAdminLink(
    email: string,
    adminUrl: string,
    quinielaName: string,
  ): Promise<boolean> {
    const subject = `Acceso de administrador: ${quinielaName}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 32px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">Futbolify</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">Mundial 2026</p>
    </div>

    <!-- Content -->
    <div style="padding: 32px;">
      <h2 style="color: #1f2937; margin: 0 0 16px; font-size: 20px;">
        Tu enlace de administrador
      </h2>

      <p style="color: #6b7280; margin: 0 0 24px; line-height: 1.6;">
        Guarda este enlace para administrar tu quiniela <strong>"${quinielaName}"</strong> desde cualquier dispositivo:
      </p>

      <!-- Link Button -->
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${adminUrl}" style="display: inline-block; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">
          Administrar Quiniela
        </a>
      </div>

      <p style="color: #9ca3af; margin: 0; font-size: 13px; text-align: center;">
        Este enlace es válido por 30 días.
      </p>
    </div>

    <!-- Footer -->
    <div style="background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #9ca3af; margin: 0; font-size: 12px;">
        No compartas este enlace. Quien lo tenga podrá administrar tu quiniela.
      </p>
    </div>

  </div>
</body>
</html>
    `.trim();

    const text = `
Tu enlace de administrador para Futbolify

Quiniela: ${quinielaName}

Usa este enlace para administrar tu quiniela desde cualquier dispositivo:
${adminUrl}

Este enlace es válido por 30 días.

No compartas este enlace. Quien lo tenga podrá administrar tu quiniela.
    `.trim();

    return this.sendEmail({
      to: email,
      subject,
      html,
      text,
    });
  }
}
