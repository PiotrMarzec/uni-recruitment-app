import { sendEmail, EMAIL_FROM } from "./client";
import { logAuditEvent, ACTIONS } from "@/lib/audit";
import { getEmailT, getDateLocale } from "./translations";
import { logger } from "@/lib/logger";

interface EmailResult {
  success: boolean;
  error?: string;
}

export async function sendOtpEmail(
  email: string,
  code: string,
  otpId: string,
  locale = "en"
): Promise<EmailResult> {
  const t = getEmailT(locale);
  try {
    await sendEmail({
      from: EMAIL_FROM,
      to: email,
      subject: t("otp.subject"),
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2>${t("otp.title")}</h2>
          <p>${t("otp.body")}</p>
          <div style="background: #f4f4f5; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; font-family: monospace;">${code}</span>
          </div>
          <p style="color: #71717a; font-size: 14px;">${t("otp.ignore")}</p>
        </div>
      `,
    });

    logger.info("email.sent", { template: "otp", recipient: email, otpId });
    await logAuditEvent({
      actorType: "system",
      actorLabel: "System",
      action: ACTIONS.EMAIL_SENT,
      resourceType: "otp",
      resourceId: otpId,
      details: { template: "otp", recipient: email },
    });

    return { success: true };
  } catch (err) {
    logger.error("email.send_failed", { template: "otp", recipient: email, error: String(err) });
    console.error("Failed to send OTP email:", err);
    return { success: false, error: String(err) };
  }
}

export async function sendRegistrationCompletedEmail(params: {
  email: string;
  fullName: string;
  recruitmentName: string;
  level: string | null;
  spokenLanguages: string[];
  destinationPreferences: string[];
  enrollmentId: string;
  registrationLink: string;
  locale?: string;
}): Promise<EmailResult> {
  const locale = params.locale ?? "en";
  const t = getEmailT(locale);
  const levelLabel =
    params.level
      ? t(`levelLabels.${params.level}`, undefined) || params.level
      : "—";

  try {
    await sendEmail({
      from: EMAIL_FROM,
      to: params.email,
      subject: t("registrationCompleted.subject", { recruitmentName: params.recruitmentName }),
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <h2>${t("registrationCompleted.title")}</h2>
          <p>${t("registrationCompleted.greeting", { fullName: params.fullName })}</p>
          <p>${t("registrationCompleted.body", { recruitmentName: `<strong>${params.recruitmentName}</strong>` })}</p>
          <h3>${t("registrationCompleted.summaryTitle")}</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #71717a;">${t("registrationCompleted.enrollmentId")}</td><td>${params.enrollmentId}</td></tr>
            <tr><td style="padding: 8px 0; color: #71717a;">${t("registrationCompleted.studyLevel")}</td><td>${levelLabel}</td></tr>
            <tr><td style="padding: 8px 0; color: #71717a;">${t("registrationCompleted.spokenLanguages")}</td><td>${params.spokenLanguages.join(", ")}</td></tr>
            <tr><td style="padding: 8px 0; color: #71717a;">${t("registrationCompleted.destinationPreferences")}</td><td>${params.destinationPreferences.map((d, i) => `${i + 1}. ${d}`).join("<br>")}</td></tr>
          </table>
          <div style="margin: 32px 0;">
            <a href="${params.registrationLink}" style="background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">${t("registrationCompleted.updateButton")}</a>
            <p style="margin-top: 8px; font-size: 13px; color: #71717a;">${t("registrationCompleted.copyLink")} <a href="${params.registrationLink}" style="color: #3b82f6;">${params.registrationLink}</a></p>
          </div>
          <p style="color: #71717a; font-size: 14px; margin-top: 32px;">${t("registrationCompleted.updateNote")}</p>
        </div>
      `,
    });
    logger.info("email.sent", { template: "registrationCompleted", recipient: params.email, recruitmentName: params.recruitmentName });
    await logAuditEvent({
      actorType: "system",
      actorLabel: "System",
      action: ACTIONS.EMAIL_SENT,
      resourceType: "email",
      resourceId: crypto.randomUUID(),
      details: { template: "registrationCompleted", recipient: params.email, recruitmentName: params.recruitmentName },
    });
    return { success: true };
  } catch (err) {
    logger.error("email.send_failed", { template: "registrationCompleted", recipient: params.email, error: String(err) });
    console.error("Failed to send registration completed email:", err);
    return { success: false, error: String(err) };
  }
}

export async function sendInitialStageClosedEmail(params: {
  email: string;
  fullName: string;
  recruitmentName: string;
  adminStageEndDate: Date | null;
  locale?: string;
}): Promise<EmailResult> {
  const locale = params.locale ?? "en";
  const t = getEmailT(locale);
  const dateLocale = getDateLocale(locale);

  const endDateStr = params.adminStageEndDate
    ? params.adminStageEndDate.toLocaleDateString(dateLocale, {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : t("initialStageClosed.toBeAnnounced");

  try {
    await sendEmail({
      from: EMAIL_FROM,
      to: params.email,
      subject: t("initialStageClosed.subject", { recruitmentName: params.recruitmentName }),
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <h2>${t("initialStageClosed.title")}</h2>
          <p>${t("initialStageClosed.greeting", { fullName: params.fullName })}</p>
          <p>${t("initialStageClosed.body", { recruitmentName: `<strong>${params.recruitmentName}</strong>` })}</p>
          <p>${t("initialStageClosed.reviewNote", { date: `<strong>${endDateStr}</strong>` })}</p>
          <p style="color: #71717a; font-size: 14px;">${t("initialStageClosed.thanks")}</p>
        </div>
      `,
    });
    logger.info("email.sent", { template: "initialStageClosed", recipient: params.email, recruitmentName: params.recruitmentName });
    await logAuditEvent({
      actorType: "system",
      actorLabel: "System",
      action: ACTIONS.EMAIL_SENT,
      resourceType: "email",
      resourceId: crypto.randomUUID(),
      details: { template: "initialStageClosed", recipient: params.email, recruitmentName: params.recruitmentName },
    });
    return { success: true };
  } catch (err) {
    logger.error("email.send_failed", { template: "initialStageClosed", recipient: params.email, error: String(err) });
    console.error("Failed to send initial stage closed email:", err);
    return { success: false, error: String(err) };
  }
}

export async function sendSupplementaryStageClosedEmail(params: {
  email: string;
  fullName: string;
  recruitmentName: string;
  adminStageEndDate: Date | null;
  locale?: string;
}): Promise<EmailResult> {
  const locale = params.locale ?? "en";
  const t = getEmailT(locale);
  const dateLocale = getDateLocale(locale);

  const endDateStr = params.adminStageEndDate
    ? params.adminStageEndDate.toLocaleDateString(dateLocale, {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : t("supplementaryStageClosed.toBeAnnounced");

  try {
    await sendEmail({
      from: EMAIL_FROM,
      to: params.email,
      subject: t("supplementaryStageClosed.subject", { recruitmentName: params.recruitmentName }),
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <h2>${t("supplementaryStageClosed.title")}</h2>
          <p>${t("supplementaryStageClosed.greeting", { fullName: params.fullName })}</p>
          <p>${t("supplementaryStageClosed.body", { recruitmentName: `<strong>${params.recruitmentName}</strong>` })}</p>
          <p>${t("supplementaryStageClosed.reviewNote", { date: `<strong>${endDateStr}</strong>` })}</p>
          <p style="color: #71717a; font-size: 14px;">${t("supplementaryStageClosed.thanks")}</p>
        </div>
      `,
    });
    logger.info("email.sent", { template: "supplementaryStageClosed", recipient: params.email, recruitmentName: params.recruitmentName });
    await logAuditEvent({
      actorType: "system",
      actorLabel: "System",
      action: ACTIONS.EMAIL_SENT,
      resourceType: "email",
      resourceId: crypto.randomUUID(),
      details: { template: "supplementaryStageClosed", recipient: params.email, recruitmentName: params.recruitmentName },
    });
    return { success: true };
  } catch (err) {
    logger.error("email.send_failed", { template: "supplementaryStageClosed", recipient: params.email, error: String(err) });
    console.error("Failed to send supplementary stage closed email:", err);
    return { success: false, error: String(err) };
  }
}

export async function sendAssignmentApprovedEmail(params: {
  email: string;
  fullName: string;
  recruitmentName: string;
  destinationName: string;
  destinationDescription: string;
  supplementaryStage?: { startDate: Date; endDate: Date };
  locale?: string;
}): Promise<EmailResult> {
  const locale = params.locale ?? "en";
  const t = getEmailT(locale);
  const dateLocale = getDateLocale(locale);

  const supplementarySection = params.supplementaryStage
    ? (() => {
        const startStr = params.supplementaryStage!.startDate.toLocaleDateString(dateLocale, {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
        const endStr = params.supplementaryStage!.endDate.toLocaleDateString(dateLocale, {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
        return `<p style="color: #374151;">${t("assignmentApproved.supplementaryInfo", { recruitmentName: `<strong>${params.recruitmentName}</strong>`, startDate: `<strong>${startStr}</strong>`, endDate: `<strong>${endStr}</strong>` })}</p>`;
      })()
    : "";

  try {
    await sendEmail({
      from: EMAIL_FROM,
      to: params.email,
      subject: t("assignmentApproved.subject", { recruitmentName: params.recruitmentName }),
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <h2>${t("assignmentApproved.title")}</h2>
          <p>${t("assignmentApproved.greeting", { fullName: params.fullName })}</p>
          <p>${t("assignmentApproved.body", { recruitmentName: `<strong>${params.recruitmentName}</strong>` })}</p>
          <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px 24px; margin: 24px 0; border-radius: 4px;">
            <h3 style="margin: 0 0 8px 0;">${params.destinationName}</h3>
            <p style="margin: 0; color: #374151;">${params.destinationDescription}</p>
          </div>
          <p style="color: #71717a; font-size: 14px;">${t("assignmentApproved.congratulations")}</p>
          ${supplementarySection}
        </div>
      `,
    });
    logger.info("email.sent", { template: "assignmentApproved", recipient: params.email, recruitmentName: params.recruitmentName, destinationName: params.destinationName });
    await logAuditEvent({
      actorType: "system",
      actorLabel: "System",
      action: ACTIONS.EMAIL_SENT,
      resourceType: "email",
      resourceId: crypto.randomUUID(),
      details: { template: "assignmentApproved", recipient: params.email, recruitmentName: params.recruitmentName, destinationName: params.destinationName },
    });
    return { success: true };
  } catch (err) {
    logger.error("email.send_failed", { template: "assignmentApproved", recipient: params.email, error: String(err) });
    console.error("Failed to send assignment approved email:", err);
    return { success: false, error: String(err) };
  }
}

export async function sendAssignmentUnassignedEmail(params: {
  email: string;
  fullName: string;
  recruitmentName: string;
  supplementaryStage?: { startDate: Date; endDate: Date };
  registrationLink?: string;
  locale?: string;
}): Promise<EmailResult> {
  const locale = params.locale ?? "en";
  const t = getEmailT(locale);
  const dateLocale = getDateLocale(locale);

  const supplementarySection = params.supplementaryStage
    ? (() => {
        const startStr = params.supplementaryStage!.startDate.toLocaleDateString(dateLocale, {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
        const endStr = params.supplementaryStage!.endDate.toLocaleDateString(dateLocale, {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
        return `
          <p>${t("assignmentUnassigned.supplementaryInfo", { recruitmentName: `<strong>${params.recruitmentName}</strong>`, startDate: `<strong>${startStr}</strong>`, endDate: `<strong>${endStr}</strong>` })}</p>
          ${params.registrationLink ? `<div style="margin: 24px 0;"><a href="${params.registrationLink}" style="background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">${t("assignmentUnassigned.applyButton")}</a><p style="margin-top: 8px; font-size: 13px; color: #71717a;">${t("assignmentUnassigned.copyLink")} <a href="${params.registrationLink}" style="color: #3b82f6;">${params.registrationLink}</a></p></div>` : ""}
        `;
      })()
    : `<p style="color: #71717a; font-size: 14px;">${t("assignmentUnassigned.noSupplementary")}</p>`;

  try {
    await sendEmail({
      from: EMAIL_FROM,
      to: params.email,
      subject: t("assignmentUnassigned.subject", { recruitmentName: params.recruitmentName }),
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <h2>${t("assignmentUnassigned.title")}</h2>
          <p>${t("assignmentUnassigned.greeting", { fullName: params.fullName })}</p>
          <p>${t("assignmentUnassigned.body", { recruitmentName: `<strong>${params.recruitmentName}</strong>` })}</p>
          ${supplementarySection}
        </div>
      `,
    });
    logger.info("email.sent", { template: "assignmentUnassigned", recipient: params.email, recruitmentName: params.recruitmentName });
    await logAuditEvent({
      actorType: "system",
      actorLabel: "System",
      action: ACTIONS.EMAIL_SENT,
      resourceType: "email",
      resourceId: crypto.randomUUID(),
      details: { template: "assignmentUnassigned", recipient: params.email, recruitmentName: params.recruitmentName },
    });
    return { success: true };
  } catch (err) {
    logger.error("email.send_failed", { template: "assignmentUnassigned", recipient: params.email, error: String(err) });
    console.error("Failed to send unassigned email:", err);
    return { success: false, error: String(err) };
  }
}

export async function sendAdminInviteEmail(params: {
  email: string;
  fullName: string;
  invitedByName: string;
  adminUrl: string;
}): Promise<EmailResult> {
  try {
    await sendEmail({
      from: EMAIL_FROM,
      to: params.email,
      subject: "You've been invited to the admin panel",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2>Admin Panel Invitation</h2>
          <p>Dear ${params.fullName},</p>
          <p>${params.invitedByName} has granted you admin access to the University Recruitment platform.</p>
          <div style="margin: 32px 0;">
            <a href="${params.adminUrl}" style="background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">Access Admin Panel</a>
          </div>
          <p style="color: #71717a; font-size: 14px;">You can log in using this email address. A one-time code will be sent to you when you sign in.</p>
        </div>
      `,
    });
    logger.info("email.sent", { template: "adminInvite", recipient: params.email, invitedByName: params.invitedByName });
    await logAuditEvent({
      actorType: "system",
      actorLabel: "System",
      action: ACTIONS.EMAIL_SENT,
      resourceType: "email",
      resourceId: crypto.randomUUID(),
      details: { template: "adminInvite", recipient: params.email, invitedByName: params.invitedByName },
    });
    return { success: true };
  } catch (err) {
    logger.error("email.send_failed", { template: "adminInvite", recipient: params.email, error: String(err) });
    console.error("Failed to send admin invite email:", err);
    return { success: false, error: String(err) };
  }
}

export async function sendSupplementaryStageEmail(params: {
  email: string;
  fullName: string;
  recruitmentName: string;
  currentDestination: string | null;
  registrationLink: string;
  stageEndDate: Date;
  locale?: string;
}): Promise<EmailResult> {
  const locale = params.locale ?? "en";
  const t = getEmailT(locale);
  const dateLocale = getDateLocale(locale);

  const endDateStr = params.stageEndDate.toLocaleDateString(dateLocale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const assignedSection = params.currentDestination
    ? `
      <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px 24px; margin: 24px 0; border-radius: 4px;">
        <p style="margin: 0 0 4px 0; font-weight: bold;">${t("supplementaryStage.currentAssignment", { destination: params.currentDestination })}</p>
        <p style="margin: 0; color: #374151;">${t("supplementaryStage.guaranteed")}</p>
      </div>
      <p>${t("supplementaryStage.changeNote")}</p>
      <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
        <p style="margin: 0; color: #991b1b; font-weight: bold;">${t("supplementaryStage.warning", { destination: params.currentDestination })}</p>
      </div>
    `
    : `<p>${t("supplementaryStage.noAssignment")}</p>`;

  try {
    await sendEmail({
      from: EMAIL_FROM,
      to: params.email,
      subject: t("supplementaryStage.subject", { recruitmentName: params.recruitmentName }),
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <h2>${t("supplementaryStage.title")}</h2>
          <p>${t("supplementaryStage.greeting", { fullName: params.fullName })}</p>
          <p>${t("supplementaryStage.body", { recruitmentName: `<strong>${params.recruitmentName}</strong>` })}</p>
          ${assignedSection}
          <div style="margin: 24px 0;">
            <a href="${params.registrationLink}" style="background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">${t("supplementaryStage.openButton")}</a>
            <p style="margin-top: 8px; font-size: 13px; color: #71717a;">${t("supplementaryStage.copyLink")} <a href="${params.registrationLink}" style="color: #3b82f6;">${params.registrationLink}</a></p>
          </div>
          <p style="color: #71717a; font-size: 14px;">${t("supplementaryStage.closesNote", { date: `<strong>${endDateStr}</strong>` })}</p>
        </div>
      `,
    });
    logger.info("email.sent", { template: "supplementaryStage", recipient: params.email, recruitmentName: params.recruitmentName });
    await logAuditEvent({
      actorType: "system",
      actorLabel: "System",
      action: ACTIONS.EMAIL_SENT,
      resourceType: "email",
      resourceId: crypto.randomUUID(),
      details: { template: "supplementaryStage", recipient: params.email, recruitmentName: params.recruitmentName },
    });
    return { success: true };
  } catch (err) {
    logger.error("email.send_failed", { template: "supplementaryStage", recipient: params.email, error: String(err) });
    console.error("Failed to send supplementary stage email:", err);
    return { success: false, error: String(err) };
  }
}
