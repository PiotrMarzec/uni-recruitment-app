import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  slots,
  recruitments,
  stages,
  registrations,
  users,
  destinations,
  stageEnrollments,
} from "@/db/schema";
import { broadcastSlotStatusUpdate } from "@/lib/websocket/events";
import { getTeacherPath } from "@/lib/auth/hmac";
import { eq, and, count, desc } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slotId: string }> }
) {
  const { slotId } = await params;

  // Get slot with recruitment info
  const [slot] = await db
    .select({
      id: slots.id,
      number: slots.number,
      status: slots.status,
      studentId: slots.studentId,
      recruitmentId: slots.recruitmentId,
      createdAt: slots.createdAt,
    })
    .from(slots)
    .where(eq(slots.id, slotId))
    .limit(1);

  if (!slot) {
    return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  }

  // Get recruitment
  const [recruitment] = await db
    .select()
    .from(recruitments)
    .where(eq(recruitments.id, slot.recruitmentId))
    .limit(1);

  if (!recruitment) {
    return NextResponse.json({ error: "Recruitment not found" }, { status: 404 });
  }

  // Find active initial stage
  const [initialStage] = await db
    .select()
    .from(stages)
    .where(
      and(
        eq(stages.recruitmentId, slot.recruitmentId),
        eq(stages.type, "initial")
      )
    )
    .limit(1);

  const isInitialActive = initialStage?.status === "active";

  // Find active supplementary stage
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

  const isSupplementaryActive = !!supplementaryStage;

  // Mark slot as registration_started when the link is opened.
  // Handles both first-time opens ("open") and re-edits of completed registrations ("registered").
  if ((isInitialActive || isSupplementaryActive) && (slot.status === "open" || slot.status === "registered")) {
    await db
      .update(slots)
      .set({ status: "registration_started" })
      .where(and(eq(slots.id, slotId), eq(slots.status, slot.status)));

    slot.status = "registration_started";

    // Broadcast updated counts to admin dashboard
    const counts = await db
      .select({ status: slots.status, n: count() })
      .from(slots)
      .where(eq(slots.recruitmentId, slot.recruitmentId))
      .groupBy(slots.status);

    const byStatus = Object.fromEntries(counts.map((r) => [r.status, Number(r.n)]));

    // Broadcast to whichever stage is active — the dashboard subscribes by stageId.
    const broadcastStageId = initialStage?.id ?? supplementaryStage?.id;
    if (broadcastStageId) {
      broadcastSlotStatusUpdate({
        type: "slot_status_update",
        stageId: broadcastStageId,
        openSlotsCount: byStatus["open"] ?? 0,
        startedSlotsCount: byStatus["registration_started"] ?? 0,
        startedSlot: {
          slotId: slot.id,
          slotNumber: slot.number,
          createdAt: slot.createdAt.toISOString(),
          teacherManagementLink: getTeacherPath(slot.id),
        },
      });
    }
  }

  // Get existing registration if any
  let registration = null;
  let student = null;
  let currentAssignment: { destinationId: string; destinationName: string } | null = null;

  // Fetch existing registration when the slot has an assigned student.
  // Use studentId rather than slot status because the status may have just been
  // changed to "registration_started" above for re-edit flows.
  if (slot.studentId) {
    const regResult = await db
      .select()
      .from(registrations)
      .where(eq(registrations.slotId, slotId))
      .limit(1);

    if (regResult.length > 0) {
      registration = {
        ...regResult[0],
        spokenLanguages: JSON.parse(regResult[0].spokenLanguages || "[]"),
        destinationPreferences: JSON.parse(regResult[0].destinationPreferences || "[]"),
      };

      const [studentResult] = await db
        .select()
        .from(users)
        .where(eq(users.id, slot.studentId))
        .limit(1);
      student = studentResult;

      // If supplementary stage is active, look up the student's current assignment
      // from the most recently completed admin stage.
      if (isSupplementaryActive) {
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
          const [enrollment] = await db
            .select({ assignedDestinationId: stageEnrollments.assignedDestinationId })
            .from(stageEnrollments)
            .where(
              and(
                eq(stageEnrollments.stageId, adminStage.id),
                eq(stageEnrollments.registrationId, regResult[0].id),
                eq(stageEnrollments.cancelled, false)
              )
            )
            .limit(1);

          if (enrollment?.assignedDestinationId) {
            const [dest] = await db
              .select({ name: destinations.name })
              .from(destinations)
              .where(eq(destinations.id, enrollment.assignedDestinationId))
              .limit(1);

            currentAssignment = {
              destinationId: enrollment.assignedDestinationId,
              destinationName: dest?.name ?? enrollment.assignedDestinationId,
            };
          }
        }
      }
    }
  }

  return NextResponse.json({
    slot,
    recruitment: {
      id: recruitment.id,
      name: recruitment.name,
      description: recruitment.description,
      maxDestinationChoices: recruitment.maxDestinationChoices,
    },
    initialStage: initialStage
      ? { id: initialStage.id, status: initialStage.status, endDate: initialStage.endDate }
      : null,
    isInitialActive,
    isSupplementaryActive,
    currentAssignment,
    registration,
    student,
  });
}
