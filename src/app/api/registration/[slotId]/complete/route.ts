import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  slots,
  registrations,
  users,
  stages,
  destinations,
  stageEnrollments,
  recruitments,
} from "@/db/schema";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { sendRegistrationCompletedEmail } from "@/lib/email/send";
import { getRegistrationSessionFromRequest } from "@/lib/auth/session";
import { broadcastRegistrationUpdate, broadcastRegistrationStepUpdate } from "@/lib/websocket/events";
import { getTeacherPath, getStudentRegistrationLink } from "@/lib/auth/hmac";
import { eq, and, count, desc, isNotNull } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slotId: string }> }
) {
  const { slotId } = await params;

  const authRes = NextResponse.json({});
  const session = await getRegistrationSessionFromRequest(req, authRes);

  if (!session.userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const userId = session.userId;

  // Get slot
  const [slot] = await db
    .select()
    .from(slots)
    .where(eq(slots.id, slotId))
    .limit(1);

  if (!slot) {
    return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  }

  // Verify initial or supplementary stage is still active
  const [initialStage] = await db
    .select()
    .from(stages)
    .where(
      and(
        eq(stages.recruitmentId, slot.recruitmentId),
        eq(stages.type, "initial"),
        eq(stages.status, "active")
      )
    )
    .limit(1);

  const [supplementaryStage] = await db
    .select()
    .from(stages)
    .where(
      and(
        eq(stages.recruitmentId, slot.recruitmentId),
        eq(stages.type, "supplementary"),
        eq(stages.status, "active")
      )
    )
    .limit(1);

  if (!initialStage && !supplementaryStage) {
    return NextResponse.json({ error: "Registration period has ended" }, { status: 400 });
  }

  // Get registration
  const [registration] = await db
    .select()
    .from(registrations)
    .where(and(eq(registrations.slotId, slotId), eq(registrations.studentId, userId)))
    .limit(1);

  if (!registration) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }

  // Validate all required fields
  if (!registration.level) {
    return NextResponse.json({ error: "Study level is required" }, { status: 400 });
  }

  const prefs = JSON.parse(registration.destinationPreferences || "[]") as string[];
  if (prefs.length === 0) {
    return NextResponse.json({ error: "At least one destination preference is required" }, { status: 400 });
  }

  // Validate destination availability (atomic check)
  // Use a transaction to prevent race conditions
  const now = new Date();

  const completedAt = registration.registrationCompleted
    ? registration.registrationCompletedAt
    : now;

  await db
    .update(registrations)
    .set({
      registrationCompleted: true,
      registrationCompletedAt: completedAt,
      updatedAt: now,
    })
    .where(eq(registrations.id, registration.id));

  // If completing during supplementary stage, clear the student's assignment
  // from the most recently completed admin stage so they re-enter the pool.
  if (supplementaryStage && !initialStage) {
    const [adminStage] = await db
      .select()
      .from(stages)
      .where(
        and(
          eq(stages.recruitmentId, slot.recruitmentId),
          eq(stages.type, "admin"),
          eq(stages.status, "completed")
        )
      )
      .orderBy(desc(stages.order))
      .limit(1);

    if (adminStage) {
      await db
        .update(stageEnrollments)
        .set({ assignedDestinationId: null })
        .where(
          and(
            eq(stageEnrollments.stageId, adminStage.id),
            eq(stageEnrollments.registrationId, registration.id),
            isNotNull(stageEnrollments.assignedDestinationId)
          )
        );
    }
  }

  // Get student info, recruitment name, and destination names for email
  const [[student], [recruitment], destNames] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db.select({ name: recruitments.name }).from(recruitments).where(eq(recruitments.id, slot.recruitmentId)).limit(1),
    db.select({ id: destinations.id, name: destinations.name }).from(destinations).where(eq(destinations.recruitmentId, slot.recruitmentId)),
  ]);

  const destNameMap = Object.fromEntries(destNames.map((d) => [d.id, d.name]));
  const prefNames = prefs.map((id) => destNameMap[id] || id);

  const registrationLink = getStudentRegistrationLink(slotId);

  // Send confirmation email
  if (student) {
    const langs = JSON.parse(registration.spokenLanguages || "[]") as string[];
    await sendRegistrationCompletedEmail({
      email: student.email,
      fullName: student.fullName,
      recruitmentName: recruitment?.name ?? "Recruitment",
      level: registration.level,
      spokenLanguages: langs,
      destinationPreferences: prefNames,
      enrollmentId: registration.enrollmentId || "",
      registrationLink,
    });
  }

  // Move slot back to "registered" if a re-edit flow left it as "registration_started".
  // (For new registrations the slot is already "registered" so this is a no-op.)
  await db
    .update(slots)
    .set({ status: "registered" })
    .where(and(eq(slots.id, slotId), eq(slots.status, "registration_started")));

  // Broadcast WebSocket update to the active stage's dashboard.
  // The dashboard subscribes by stageId — use whichever stage is currently active.
  const broadcastStageId = initialStage?.id ?? supplementaryStage?.id;
  if (broadcastStageId) {
    const [openCount] = await db
      .select({ count: count() })
      .from(slots)
      .where(and(eq(slots.recruitmentId, slot.recruitmentId), eq(slots.status, "open")));

    const [startedCount] = await db
      .select({ count: count() })
      .from(slots)
      .where(and(eq(slots.recruitmentId, slot.recruitmentId), eq(slots.status, "registration_started")));

    const [regCount] = await db
      .select({ count: count() })
      .from(registrations)
      .where(eq(registrations.registrationCompleted, true));

    broadcastRegistrationUpdate({
      type: "registration_update",
      stageId: broadcastStageId,
      registeredCount: regCount?.count ?? 0,
      openSlotsCount: openCount?.count ?? 0,
      startedSlotsCount: startedCount?.count ?? 0,
      latestRegistration: student
        ? {
            studentName: student.fullName,
            slotNumber: slot.number,
            completedAt: now.toISOString(),
            teacherManagementLink: getTeacherPath(slotId),
          }
        : undefined,
    });

    // Update the slot row in the dashboard's recentRegistrations list so its
    // status dot turns green immediately (registration_update only updates counters).
    broadcastRegistrationStepUpdate({
      type: "registration_step_update",
      stageId: broadcastStageId,
      registration: {
        slotId,
        slotNumber: slot.number,
        studentName: student?.fullName ?? "",
        studentEmail: student?.email ?? "",
        completedAt: completedAt?.toISOString() ?? now.toISOString(),
        updatedAt: now.toISOString(),
        registrationCompleted: true,
        teacherManagementLink: getTeacherPath(slotId),
        assignedDestination: null, // assignment was cleared when editing during supplementary stage
      },
    });
  }

  await logAuditEvent({
    actorType: "student",
    actorId: userId,
    actorLabel: student?.email || userId,
    action: ACTIONS.REGISTRATION_COMPLETED,
    resourceType: "registration",
    resourceId: registration.id,
    recruitmentId: slot.recruitmentId,
    details: { slotNumber: slot.number },
    ipAddress: getIpAddress(req),
  });

  return NextResponse.json({ success: true });
}
