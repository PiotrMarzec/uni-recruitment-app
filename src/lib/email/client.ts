import { Resend } from "resend";
import nodemailer from "nodemailer";

export const EMAIL_FROM = process.env.EMAIL_FROM || "noreply@example.com";

interface SendEmailOptions {
  from: string;
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  if (process.env.SMTP_HOST) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: false,
      ignoreTLS: true,
    });
    await transporter.sendMail(opts);
  } else {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send(opts);
  }
}
