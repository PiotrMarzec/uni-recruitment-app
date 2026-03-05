import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { NextRequest } from "next/server";

export type ActorType = "admin" | "student" | "teacher" | "system";

export interface AuditEventParams {
  actorType: ActorType;
  actorId?: string;
  actorLabel: string;
  action: string;
  resourceType: string;
  resourceId: string;
  recruitmentId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export async function logAuditEvent(params: AuditEventParams): Promise<void> {
  try {
    await db.insert(auditLog).values({
      actorType: params.actorType,
      actorId: params.actorId ?? null,
      actorLabel: params.actorLabel,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      recruitmentId: params.recruitmentId ?? null,
      details: params.details ?? {},
      ipAddress: params.ipAddress ?? null,
    });
  } catch (err) {
    // Audit log failures should not break the main flow
    console.error("Audit log write failed:", err);
  }
}

export function getIpAddress(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

// Action constants
export const ACTIONS = {
  // Recruitment
  RECRUITMENT_CREATED: "recruitment.created",
  RECRUITMENT_UPDATED: "recruitment.updated",
  // Stage
  STAGE_CREATED: "stage.created",
  STAGE_UPDATED: "stage.updated",
  STAGE_COMPLETED: "stage.completed",
  STAGE_TRANSITIONED: "stage.transitioned",
  // Slot
  SLOT_ADDED: "slot.added",
  SLOT_REMOVED: "slot.removed",
  // Destination
  DESTINATION_CREATED: "destination.created",
  DESTINATION_UPDATED: "destination.updated",
  DESTINATION_REMOVED: "destination.removed",
  // Assignment
  ASSIGNMENT_COMPUTED: "assignment.computed",
  ASSIGNMENT_APPROVED: "assignment.approved",
  ASSIGNMENT_CANCELLED: "assignment.cancelled",
  // Supplementary
  SUPPLEMENTARY_STAGE_STARTED: "supplementary_stage.started",
  PREFERENCES_UPDATED: "preferences.updated",
  // Registration
  REGISTRATION_STEP_COMPLETED: "registration.step_completed",
  REGISTRATION_COMPLETED: "registration.completed",
  REGISTRATION_UPDATED: "registration.updated",
  REGISTRATION_TEACHER_EDITED: "registration.teacher_edited",
  TEACHER_SCORES_ENTERED: "teacher.scores_entered",
  // PDF
  BULK_PDF_GENERATED: "bulk_pdf.generated",
  // OTP
  OTP_ISSUED: "otp.issued",
  OTP_VERIFIED: "otp.verified",
  OTP_EXPIRED: "otp.expired",
  // Admin
  ADMIN_INVITED: "admin.invited",
  REGISTRATION_ADMIN_EDITED: "registration.admin_edited",
  // Email
  EMAIL_SENT: "email.sent",
} as const;
