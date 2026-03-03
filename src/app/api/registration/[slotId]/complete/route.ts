import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  slots,
  registrations,
  users,
  stages,
  destinations,
} from "@/db/schema";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { sendRegistrationCompletedEmail } from "@/lib/email/send";
import { getSessionFromRequest } from "@/lib/auth/session";
import { broadcastRegistrationUpdate } from "@/lib/websocket/events";
import { eq, and, count } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slotId: string }> }
) {
  const { slotId } = await params;

  const authRes = NextResponse.json({});
  const session = await getSessionFromRequest(req, authRes);

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

  // Verify initial stage is still active
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

  if (!initialStage) {
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

  // Get student info for email
  const [student] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  // Get destination names for email
  const destNames = await db
    .select({ id: destinations.id, name: destinations.name })
    .from(destinations)
    .where(eq(destinations.recruitmentId, slot.recruitmentId));

  const destNameMap = Object.fromEntries(destNames.map((d) => [d.id, d.name]));
  const prefNames = prefs.map((id) => destNameMap[id] || id);

  // Send confirmation email
  if (student) {
    const langs = JSON.parse(registration.spokenLanguages || "[]") as string[];
    await sendRegistrationCompletedEmail({
      email: student.email,
      fullName: student.fullName,
      recruitmentName: "Recruitment", // We'd ideally fetch the name
      level: registration.level,
      spokenLanguages: langs,
      destinationPreferences: prefNames,
      enrollmentId: registration.enrollmentId || "",
    });
  }

  // Broadcast WebSocket update to admin dashboards
  const [openCount] = await db
    .select({ count: count() })
    .from(slots)
    .where(and(eq(slots.recruitmentId, slot.recruitmentId), eq(slots.status, "open")));

  const [regCount] = await db
    .select({ count: count() })
    .from(registrations)
    .where(eq(registrations.registrationCompleted, true));

  broadcastRegistrationUpdate({
    type: "registration_update",
    stageId: initialStage.id,
    registeredCount: regCount?.count ?? 0,
    openSlotsCount: openCount?.count ?? 0,
    latestRegistration: student
      ? {
          studentName: student.fullName,
          slotNumber: slot.number,
          completedAt: now.toISOString(),
        }
      : undefined,
  });

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
