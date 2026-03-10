import { Resend } from "resend";
import nodemailer from "nodemailer";
import { db } from "@/db";
import { emailQueue } from "@/db/schema";

export const EMAIL_FROM = process.env.EMAIL_FROM || "noreply@example.com";

export interface SendEmailOptions {
  from: string;
  to: string;
  subject: string;
  html: string;
}

/**
 * Send a single email directly (used internally by the email worker).
 * Not for general use — call sendEmail() instead.
 */
export async function sendEmailDirect(opts: SendEmailOptions): Promise<void> {
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
    const { error } = await resend.emails.send(opts);
    if (error) throw new Error(`Resend error: ${error.message}`);
  }
}

/**
 * Queue an email for delivery (Resend mode) or send immediately (SMTP mode).
 * All application code should call this function.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  if (process.env.SMTP_HOST) {
    // In SMTP/dev mode send immediately — no rate-limit concerns.
    console.log(`[email] sending via SMTP (${process.env.SMTP_HOST}:${process.env.SMTP_PORT ?? 1025}) to ${opts.to}`);
    await sendEmailDirect(opts);
  } else {
    // In Resend/production mode, persist to queue; worker dispatches at ≤1 req/s.
    console.log(`[email] queuing for Resend delivery to ${opts.to}`);
    await db.insert(emailQueue).values({
      from: opts.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
  }
}
