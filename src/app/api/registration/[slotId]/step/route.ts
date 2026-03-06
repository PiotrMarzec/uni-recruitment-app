import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  slots,
  registrations,
  users,
  stages,
} from "@/db/schema";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { issueOtp, verifyOtp } from "@/lib/auth/otp";
import { sendOtpEmail } from "@/lib/email/send";
import { broadcastRegistrationStepUpdate } from "@/lib/websocket/events";
import { getTeacherPath } from "@/lib/auth/hmac";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { getRegistrationSessionFromRequest } from "@/lib/auth/session";

const step1Schema = z.object({
  step: z.literal(1),
  email: z.string().email(),
  emailConsent: z.boolean(),
  privacyConsent: z.boolean(),
});

const step2Schema = z.object({
  step: z.literal(2),
  code: z.string().length(6),
  email: z.string().email(),
});

const step3Schema = z.object({
  step: z.literal(3),
  fullName: z.string().min(1).max(255),
  enrollmentId: z.string().regex(/^[1-9]\d{5}$/, "Must be 6 digits not starting with 0"),
});

const step4Schema = z.object({
  step: z.literal(4),
  level: z.enum(["bachelor", "master"]),
});

const step5Schema = z.object({
  step: z.literal(5),
  spokenLanguages: z.array(z.string()).min(1),
});

const step6Schema = z.object({
  step: z.literal(6),
  destinationPreferences: z.array(z.string().uuid()),
});

const stepSchema = z.discriminatedUnion("step", [
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  step5Schema,
  step6Schema,
]);

async function getActiveRegistrationStage(recruitmentId: string) {
  // Check initial stage first
  const [initialStage] = await db
    .select()
    .from(stages)
    .where(
      and(
        eq(stages.recruitmentId, recruitmentId),
        eq(stages.type, "initial"),
        eq(stages.status, "active")
      )
    )
    .limit(1);
  if (initialStage) return { stage: initialStage, isInitial: true };

  // Fall back to supplementary stage
  const [suppStage] = await db
    .select()
    .from(stages)
    .where(
      and(
        eq(stages.recruitmentId, recruitmentId),
        eq(stages.type, "supplementary"),
        eq(stages.status, "active")
      )
    )
    .limit(1);
  if (suppStage) return { stage: suppStage, isInitial: false };

  return null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slotId: string }> }
) {
  const { slotId } = await params;

  // Get slot info
  const [slot] = await db
    .select()
    .from(slots)
    .where(eq(slots.id, slotId))
    .limit(1);

  if (!slot) {
    return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  }

  // Verify initial or supplementary stage is active
  const activeStageInfo = await getActiveRegistrationStage(slot.recruitmentId);
  if (!activeStageInfo) {
    return NextResponse.json(
      { error: "Registration is not currently open" },
      { status: 400 }
    );
  }
  const initialStage = activeStageInfo.isInitial ? activeStageInfo.stage : null;

  const body = await req.json().catch(() => ({}));
  const parsed = stepSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;

  if (data.step === 1) {
    // Check privacy consent
    if (!data.privacyConsent) {
      return NextResponse.json({ error: "Privacy consent is required" }, { status: 400 });
    }

    // Send OTP
    const { code, id: otpId } = await issueOtp(data.email);
    await sendOtpEmail(data.email, code, otpId);

    // Store email/consent in session temporarily
    const res = NextResponse.json({ success: true });
    const session = await getRegistrationSessionFromRequest(req, res);
    session.pendingEmail = data.email;
    session.emailConsent = data.emailConsent;
    session.privacyConsent = data.privacyConsent;
    session.pendingSlotId = slotId;
    await session.save();

    return res;
  }

  if (data.step === 2) {
    // Verify OTP
    const isValid = await verifyOtp(data.email, data.code);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
    }

    // Find or create user
    let user = await db
      .select()
      .from(users)
      .where(eq(users.email, data.email.toLowerCase()))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!user) {
      const [created] = await db
        .insert(users)
        .values({
          email: data.email.toLowerCase(),
          fullName: data.email.split("@")[0],
        })
        .returning();
      user = created;
    }

    // Get consent from session
    const tempRes = NextResponse.json({ success: true });
    const session = await getRegistrationSessionFromRequest(req, tempRes);
    const emailConsent = session.emailConsent ?? false;
    const privacyConsent = session.privacyConsent ?? false;

    // Check if slot is already taken by another user
    if (slot.status === "registered" && slot.studentId !== user.id) {
      return NextResponse.json({ error: "This slot is already taken" }, { status: 409 });
    }

    // Create or update registration
    const existingReg = await db
      .select()
      .from(registrations)
      .where(eq(registrations.slotId, slotId))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!existingReg) {
      await db.insert(registrations).values({
        slotId,
        studentId: user.id,
        emailConsent,
        privacyConsent,
      });

      // Mark slot as registered
      await db
        .update(slots)
        .set({ status: "registered", studentId: user.id })
        .where(eq(slots.id, slotId));
    }

    // Set student session
    const res = NextResponse.json({ success: true, userId: user.id });
    const finalSession = await getRegistrationSessionFromRequest(req, res);
    finalSession.userId = user.id;
    finalSession.email = user.email;
    finalSession.name = user.fullName;
    await finalSession.save();

    await logAuditEvent({
      actorType: "student",
      actorId: user.id,
      actorLabel: user.email,
      action: ACTIONS.REGISTRATION_STEP_COMPLETED,
      resourceType: "registration",
      resourceId: slotId,
      details: { step: 2 },
      ipAddress: getIpAddress(req),
    });

    broadcastRegistrationStepUpdate({
      type: "registration_step_update",
      stageId: activeStageInfo.stage.id,
      registration: {
        slotId,
        slotNumber: slot.number,
        studentName: user.fullName,
        studentEmail: user.email,
        completedAt: existingReg?.registrationCompletedAt?.toISOString() ?? null,
        updatedAt: new Date().toISOString(),
        registrationCompleted: false,
        teacherManagementLink: getTeacherPath(slotId),
        assignedDestination: null,
      },
    });

    return res;
  }

  // For steps 3+, user must be authenticated via session
  const authRes = NextResponse.json({});
  const session = await getRegistrationSessionFromRequest(req, authRes);

  if (!session.userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const userId = session.userId;

  // Get existing registration
  const existingReg = await db
    .select()
    .from(registrations)
    .where(eq(registrations.slotId, slotId))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!existingReg || existingReg.studentId !== userId) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (data.step === 3) {
    updates.fullName = (data as { fullName: string }).fullName;
    updates.enrollmentId = (data as { enrollmentId: string }).enrollmentId;

    // Update user's full name
    await db
      .update(users)
      .set({ fullName: (data as { fullName: string }).fullName })
      .where(eq(users.id, userId));
  }

  if (data.step === 4) {
    updates.level = (data as { level: string }).level;
  }

  if (data.step === 5) {
    updates.spokenLanguages = JSON.stringify((data as { spokenLanguages: string[] }).spokenLanguages);
  }

  if (data.step === 6) {
    updates.destinationPreferences = JSON.stringify(
      (data as { destinationPreferences: string[] }).destinationPreferences
    );
  }

  await db
    .update(registrations)
    .set(updates)
    .where(eq(registrations.id, existingReg.id));

  await logAuditEvent({
    actorType: "student",
    actorId: userId,
    actorLabel: session.email ?? userId,
    action: ACTIONS.REGISTRATION_STEP_COMPLETED,
    resourceType: "registration",
    resourceId: existingReg.id,
    details: { step: data.step },
    ipAddress: getIpAddress(req),
  });

  const [updatedUser] = await db
    .select({ fullName: users.fullName, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const now = new Date().toISOString();
  broadcastRegistrationStepUpdate({
    type: "registration_step_update",
    stageId: activeStageInfo.stage.id,
    registration: {
      slotId,
      slotNumber: slot.number,
      studentName: updatedUser?.fullName ?? "",
      studentEmail: updatedUser?.email ?? "",
      completedAt: existingReg.registrationCompletedAt?.toISOString() ?? null,
      updatedAt: now,
      registrationCompleted: false, // always false while student is actively editing
      teacherManagementLink: getTeacherPath(slotId),
      assignedDestination: null,
    },
  });

  const res = NextResponse.json({ success: true });
  return res;
}
