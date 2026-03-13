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
  assignmentResults,
} from "@/db/schema";
import { broadcastSlotStatusUpdate } from "@/lib/websocket/events";
import { getTeacherPath } from "@/lib/auth/hmac";
import { eq, and, count, desc, inArray } from "drizzle-orm";

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

  // Find active admin stage
  const [activeAdminStage] = await db
    .select({ id: stages.id })
    .from(stages)
    .where(
      and(
        eq(stages.recruitmentId, slot.recruitmentId),
        eq(stages.type, "admin"),
        eq(stages.status, "active")
      )
    )
    .limit(1);

  const isAdminStageActive = !!activeAdminStage;

  // Find active verification stage
  const [activeVerificationStage] = await db
    .select({ id: stages.id, order: stages.order })
    .from(stages)
    .where(
      and(
        eq(stages.recruitmentId, slot.recruitmentId),
        eq(stages.type, "verification"),
        eq(stages.status, "active")
      )
    )
    .limit(1);

  const isVerificationStageActive = !!activeVerificationStage;

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
      // Exclude admin-only fields before returning to the student-facing client.
      // Scoring fields (averageResult, additionalActivities, recommendationLetters) are
      // hidden during active admin stage, but shown during verification and other stages.
      const { notes: _notes, averageResult, additionalActivities, recommendationLetters, ...regPublic } = regResult[0];
      const hideScores = isAdminStageActive && !isVerificationStageActive;
      registration = {
        ...regPublic,
        spokenLanguages: JSON.parse(regResult[0].spokenLanguages || "[]"),
        destinationPreferences: JSON.parse(regResult[0].destinationPreferences || "[]"),
        ...(!hideScores ? {
          averageResult,
          additionalActivities,
          recommendationLetters,
        } : {}),
      };

      const [studentResult] = await db
        .select()
        .from(users)
        .where(eq(users.id, slot.studentId))
        .limit(1);
      student = studentResult;

      // Look up the student's current assignment.
      // Assignments are always created on admin stages (the algorithm runs there).
      // During all post-admin stages (verification, supplementary, etc.), look up
      // the most recently completed admin stage's approved results.
      {
        const [completedStage] = await db
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

        if (completedStage) {
          // For admin stages, check stage enrollments
          const [enrollment] = await db
            .select({ assignedDestinationId: stageEnrollments.assignedDestinationId })
            .from(stageEnrollments)
            .where(
              and(
                eq(stageEnrollments.stageId, completedStage.id),
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
          } else {
            // Also check assignment results for approved assignments
            const [result] = await db
              .select({
                destinationId: assignmentResults.destinationId,
              })
              .from(assignmentResults)
              .where(
                and(
                  eq(assignmentResults.stageId, completedStage.id),
                  eq(assignmentResults.registrationId, regResult[0].id),
                  eq(assignmentResults.approved, true)
                )
              )
              .limit(1);

            if (result?.destinationId) {
              const [dest] = await db
                .select({ name: destinations.name })
                .from(destinations)
                .where(eq(destinations.id, result.destinationId))
                .limit(1);

              currentAssignment = {
                destinationId: result.destinationId,
                destinationName: dest?.name ?? result.destinationId,
              };
            }
          }
        }
      }
    }
  }

  // Get all stages for the recruitment (for the welcome page)
  const allStages = await db
    .select({
      id: stages.id,
      name: stages.name,
      description: stages.description,
      startDate: stages.startDate,
      endDate: stages.endDate,
      type: stages.type,
      status: stages.status,
      order: stages.order,
    })
    .from(stages)
    .where(eq(stages.recruitmentId, slot.recruitmentId))
    .orderBy(stages.order);

  // Resolve destination names for the registration's preferences
  let destinationNames: string[] = [];
  if (registration && registration.destinationPreferences.length > 0) {
    const prefIds = registration.destinationPreferences as string[];
    const destResults = await db
      .select({ id: destinations.id, name: destinations.name })
      .from(destinations)
      .where(inArray(destinations.id, prefIds));
    const destMap = Object.fromEntries(destResults.map((d) => [d.id, d.name]));
    destinationNames = prefIds.map((id) => destMap[id] ?? id);
  }

  return NextResponse.json({
    slot,
    recruitment: {
      id: recruitment.id,
      name: recruitment.name,
      description: recruitment.description,
      maxDestinationChoices: recruitment.maxDestinationChoices,
    },
    allStages,
    initialStage: initialStage
      ? { id: initialStage.id, status: initialStage.status, endDate: initialStage.endDate }
      : null,
    isInitialActive,
    isSupplementaryActive,
    isVerificationStageActive,
    currentAssignment,
    registration,
    student,
    destinationNames,
  });
}
