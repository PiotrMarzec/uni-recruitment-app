import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  stages,
  stageEnrollments,
  registrations,
  users,
  slots,
  destinations,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { getTeacherPath } from "@/lib/auth/hmac";
import { eq, and, desc } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [stage] = await db
    .select()
    .from(stages)
    .where(eq(stages.id, id))
    .limit(1);

  if (!stage) {
    return NextResponse.json({ error: "Stage not found" }, { status: 404 });
  }

  // Count total and open slots for this recruitment
  const allSlots = await db
    .select({ status: slots.status })
    .from(slots)
    .where(eq(slots.recruitmentId, stage.recruitmentId));

  const totalSlots = allSlots.length;
  const openSlots = allSlots.filter((s) => s.status === "open").length;
  const startedSlots = allSlots.filter((s) => s.status === "registration_started").length;
  const registeredSlots = allSlots.filter((s) => s.status === "registered").length;

  // Find the most recently completed admin stage to look up assignments.
  const [adminStage] = await db
    .select()
    .from(stages)
    .where(
      and(
        eq(stages.recruitmentId, stage.recruitmentId),
        eq(stages.type, "admin"),
        eq(stages.status, "completed")
      )
    )
    .orderBy(desc(stages.order))
    .limit(1);

  // Get recent registrations (all active, newest update first).
  const recentRegistrationsRaw = await db
    .select({
      registrationId: registrations.id,
      slotId: slots.id,
      slotNumber: slots.number,
      studentName: users.fullName,
      studentEmail: users.email,
      completedAt: registrations.registrationCompletedAt,
      updatedAt: registrations.updatedAt,
      registrationCompleted: registrations.registrationCompleted,
    })
    .from(registrations)
    .innerJoin(users, eq(registrations.studentId, users.id))
    .innerJoin(slots, eq(registrations.slotId, slots.id))
    .where(eq(slots.recruitmentId, stage.recruitmentId))
    .orderBy(desc(registrations.updatedAt))
    .limit(50);

  // Build a map of registrationId → assigned destination name from the most recently
  // completed admin stage. Fetched separately to avoid row duplication from joins.
  const assignmentMap = new Map<string, string | null>();
  if (adminStage && recentRegistrationsRaw.length > 0) {
    const regIds = recentRegistrationsRaw.map((r) => r.registrationId);
    const enrollments = await db
      .select({
        registrationId: stageEnrollments.registrationId,
        destinationName: destinations.name,
      })
      .from(stageEnrollments)
      .innerJoin(destinations, eq(destinations.id, stageEnrollments.assignedDestinationId))
      .where(
        and(
          eq(stageEnrollments.stageId, adminStage.id),
          eq(stageEnrollments.cancelled, false)
        )
      );

    for (const e of enrollments) {
      if (regIds.includes(e.registrationId)) {
        assignmentMap.set(e.registrationId, e.destinationName);
      }
    }
  }

  const recentRegistrations = recentRegistrationsRaw.map(({ registrationId, ...r }) => ({
    ...r,
    assignedDestination: assignmentMap.get(registrationId) ?? null,
    teacherManagementLink: getTeacherPath(r.slotId),
  }));

  return NextResponse.json({
    stage,
    stats: {
      totalSlots,
      openSlots,
      startedSlots,
      registeredSlots,
    },
    recentRegistrations,
  });
}
