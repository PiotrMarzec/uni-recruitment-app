import { sendEmail, EMAIL_FROM } from "./client";
import { logAuditEvent, ACTIONS } from "@/lib/audit";

interface EmailResult {
  success: boolean;
  error?: string;
}

export async function sendOtpEmail(
  email: string,
  code: string,
  otpId: string
): Promise<EmailResult> {
  try {
    await sendEmail({
      from: EMAIL_FROM,
      to: email,
      subject: "Your login code",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2>Your one-time login code</h2>
          <p>Use the code below to log in. It expires in 10 minutes.</p>
          <div style="background: #f4f4f5; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; font-family: monospace;">${code}</span>
          </div>
          <p style="color: #71717a; font-size: 14px;">If you didn't request this code, you can safely ignore this email.</p>
        </div>
      `,
    });

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
    console.error("Failed to send OTP email:", err);
    return { success: false, error: String(err) };
  }
}

const LEVEL_LABELS: Record<string, string> = {
  bachelor_1: "Bachelor (1st year)",
  bachelor_2: "Bachelor (2nd year)",
  bachelor_3: "Bachelor (3rd year)",
  master_1: "Master (1st year)",
  master_2: "Master (2nd year)",
  master_3: "Master (3rd year)",
};

export async function sendRegistrationCompletedEmail(params: {
  email: string;
  fullName: string;
  recruitmentName: string;
  level: string | null;
  spokenLanguages: string[];
  destinationPreferences: string[];
  enrollmentId: string;
  registrationLink: string;
}): Promise<EmailResult> {
  const levelLabel = (params.level && LEVEL_LABELS[params.level]) || params.level || "—";
  try {
    await sendEmail({
      from: EMAIL_FROM,
      to: params.email,
      subject: `Registration complete — ${params.recruitmentName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <h2>Registration Complete</h2>
          <p>Dear ${params.fullName},</p>
          <p>Your registration for <strong>${params.recruitmentName}</strong> has been completed successfully.</p>
          <h3>Your Registration Summary</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #71717a;">Enrollment ID</td><td>${params.enrollmentId}</td></tr>
            <tr><td style="padding: 8px 0; color: #71717a;">Study Level</td><td>${levelLabel}</td></tr>
            <tr><td style="padding: 8px 0; color: #71717a;">Spoken Languages</td><td>${params.spokenLanguages.join(", ")}</td></tr>
            <tr><td style="padding: 8px 0; color: #71717a;">Destination Preferences</td><td>${params.destinationPreferences.map((d, i) => `${i + 1}. ${d}`).join("<br>")}</td></tr>
          </table>
          <div style="margin: 32px 0;">
            <a href="${params.registrationLink}" style="background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">Update My Registration</a>
            <p style="margin-top: 8px; font-size: 13px; color: #71717a;">Or copy this link: <a href="${params.registrationLink}" style="color: #3b82f6;">${params.registrationLink}</a></p>
          </div>
          <p style="color: #71717a; font-size: 14px; margin-top: 32px;">You can update your information until the initial registration stage closes.</p>
        </div>
      `,
    });
    return { success: true };
  } catch (err) {
    console.error("Failed to send registration completed email:", err);
    return { success: false, error: String(err) };
  }
}

export async function sendInitialStageClosedEmail(params: {
  email: string;
  fullName: string;
  recruitmentName: string;
  adminStageEndDate: Date | null;
}): Promise<EmailResult> {
  const endDateStr = params.adminStageEndDate
    ? params.adminStageEndDate.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "to be announced";

  try {
    await sendEmail({
      from: EMAIL_FROM,
      to: params.email,
      subject: `Registration period closed — ${params.recruitmentName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <h2>Registration Period Closed</h2>
          <p>Dear ${params.fullName},</p>
          <p>The initial registration period for <strong>${params.recruitmentName}</strong> has closed. Your registration is confirmed and has been forwarded for review.</p>
          <p>The administrative review stage is expected to conclude by <strong>${endDateStr}</strong>. You will receive an email when your destination assignment is finalized.</p>
          <p style="color: #71717a; font-size: 14px;">Thank you for participating in the recruitment process.</p>
        </div>
      `,
    });
    return { success: true };
  } catch (err) {
    console.error("Failed to send initial stage closed email:", err);
    return { success: false, error: String(err) };
  }
}

export async function sendAssignmentApprovedEmail(params: {
  email: string;
  fullName: string;
  recruitmentName: string;
  destinationName: string;
  destinationDescription: string;
}): Promise<EmailResult> {
  try {
    await sendEmail({
      from: EMAIL_FROM,
      to: params.email,
      subject: `Destination assignment — ${params.recruitmentName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <h2>Your Destination Assignment</h2>
          <p>Dear ${params.fullName},</p>
          <p>We are pleased to inform you that you have been assigned to the following destination for <strong>${params.recruitmentName}</strong>:</p>
          <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px 24px; margin: 24px 0; border-radius: 4px;">
            <h3 style="margin: 0 0 8px 0;">${params.destinationName}</h3>
            <p style="margin: 0; color: #374151;">${params.destinationDescription}</p>
          </div>
          <p style="color: #71717a; font-size: 14px;">Congratulations! Further details about your trip will be communicated separately.</p>
        </div>
      `,
    });
    return { success: true };
  } catch (err) {
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
}): Promise<EmailResult> {
  const supplementarySection = params.supplementaryStage
    ? (() => {
        const startStr = params.supplementaryStage.startDate.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
        const endStr = params.supplementaryStage.endDate.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
        return `
          <p>A <strong>supplementary stage</strong> has been scheduled for <strong>${params.recruitmentName}</strong>, running from <strong>${startStr}</strong> to <strong>${endStr}</strong>. You will have another opportunity to apply and be assigned to a destination during this period.</p>
          ${params.registrationLink ? `<div style="margin: 24px 0;"><a href="${params.registrationLink}" style="background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">Apply in Supplementary Stage</a><p style="margin-top: 8px; font-size: 13px; color: #71717a;">Or copy this link: <a href="${params.registrationLink}" style="color: #3b82f6;">${params.registrationLink}</a></p></div>` : ""}
        `;
      })()
    : `<p style="color: #71717a; font-size: 14px;">We will notify you if a supplementary stage becomes available.</p>`;

  try {
    await sendEmail({
      from: EMAIL_FROM,
      to: params.email,
      subject: `Assignment result — ${params.recruitmentName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <h2>Assignment Result</h2>
          <p>Dear ${params.fullName},</p>
          <p>Unfortunately, we were unable to assign you to any of your selected destinations for <strong>${params.recruitmentName}</strong> in this round. This may be due to high competition for your preferred destinations.</p>
          ${supplementarySection}
        </div>
      `,
    });
    return { success: true };
  } catch (err) {
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

    return { success: true };
  } catch (err) {
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
}): Promise<EmailResult> {
  const endDateStr = params.stageEndDate.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const assignedSection = params.currentDestination
    ? `
      <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px 24px; margin: 24px 0; border-radius: 4px;">
        <p style="margin: 0 0 4px 0; font-weight: bold;">Your current assignment: ${params.currentDestination}</p>
        <p style="margin: 0; color: #374151;">Your place is guaranteed — you do not need to take any action.</p>
      </div>
      <p>If you would like to change your destination preferences, you can re-apply using your registration link below.</p>
      <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
        <p style="margin: 0; color: #991b1b; font-weight: bold;">Warning: Re-applying will immediately cancel your current assignment to ${params.currentDestination}. There is no guarantee you will be assigned to your new preferences.</p>
      </div>
    `
    : `<p>You were not assigned to a destination in the previous round. You can use this supplementary stage to apply again.</p>`;

  try {
    await sendEmail({
      from: EMAIL_FROM,
      to: params.email,
      subject: `Supplementary stage open — ${params.recruitmentName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <h2>Supplementary Stage Now Open</h2>
          <p>Dear ${params.fullName},</p>
          <p>A supplementary registration stage has opened for <strong>${params.recruitmentName}</strong>.</p>
          ${assignedSection}
          <div style="margin: 24px 0;">
            <a href="${params.registrationLink}" style="background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">Open My Registration</a>
            <p style="margin-top: 8px; font-size: 13px; color: #71717a;">Or copy this link: <a href="${params.registrationLink}" style="color: #3b82f6;">${params.registrationLink}</a></p>
          </div>
          <p style="color: #71717a; font-size: 14px;">This stage closes on <strong>${endDateStr}</strong>. After that, assignments will be finalized.</p>
        </div>
      `,
    });
    return { success: true };
  } catch (err) {
    console.error("Failed to send supplementary stage email:", err);
    return { success: false, error: String(err) };
  }
}
