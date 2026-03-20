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
import { eq, and, count, desc, inArray, or, isNull } from "drizzle-orm";

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
    .select({ id: stages.id, order: stages.order })
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
  // Initial admin stage is order 1; supplementary admin stages are order > 2
  const isInitialAdminActive = isAdminStageActive && (activeAdminStage?.order ?? 0) <= 1;

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
  const prevStatus = slot.status;
  if ((isInitialActive || isSupplementaryActive) && (slot.status === "open" || slot.status === "registered")) {
    await db
      .update(slots)
      .set({ status: "registration_started" })
      .where(and(eq(slots.id, slotId), eq(slots.status, slot.status)));

    slot.status = "registration_started";

    // Broadcast counter update only for genuinely new registrations (open → started).
    // Re-edit views (registered → started) don't change the counter because
    // registrationCompleted is still true — the student hasn't started editing yet
    // (they'll go through OTP first, which is where registrationCompleted is reset).
    if (prevStatus === "open") {
      const [openCount] = await db
        .select({ count: count() })
        .from(slots)
        .where(and(eq(slots.recruitmentId, slot.recruitmentId), eq(slots.status, "open")));

      const [startedCount] = await db
        .select({ count: count() })
        .from(slots)
        .leftJoin(registrations, eq(registrations.slotId, slots.id))
        .where(
          and(
            eq(slots.recruitmentId, slot.recruitmentId),
            eq(slots.status, "registration_started"),
            or(
              eq(registrations.registrationCompleted, false),
              isNull(registrations.registrationCompleted)
            )
          )
        );

      const broadcastStageId = initialStage?.id ?? supplementaryStage?.id;
      if (broadcastStageId) {
        broadcastSlotStatusUpdate({
          type: "slot_status_update",
          stageId: broadcastStageId,
          openSlotsCount: openCount?.count ?? 0,
          startedSlotsCount: startedCount?.count ?? 0,
          startedSlot: {
            slotId: slot.id,
            slotNumber: slot.number,
            createdAt: slot.createdAt.toISOString(),
            teacherManagementLink: getTeacherPath(slot.id),
          },
        });
      }
    }
  }

  // Get existing registration if any
  let registration = null;
  let student = null;
  let currentAssignment: { destinationId: string; destinationName: string } | null = null;
  let assignmentCancelled = false;

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
      // Hide scores only during initial admin stage. Supplementary admin stages
      // show scores from the previous verification stage.
      const hideScores = isInitialAdminActive && !isVerificationStageActive;
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
      // If the student re-registered during a supplementary stage (cancelled: true),
      // they lose their assignment and should see no destination.
      {
        // Check if the student cancelled (re-registered) in the most recent supplementary stage.
        // This applies during supplementary stage itself AND during the subsequent admin stage.
        let studentCancelledInSupplementary = false;

        // During an active supplementary stage, check its enrollment
        if (isSupplementaryActive && supplementaryStage) {
          const [suppEnrollment] = await db
            .select({ cancelled: stageEnrollments.cancelled })
            .from(stageEnrollments)
            .where(
              and(
                eq(stageEnrollments.stageId, supplementaryStage.id),
                eq(stageEnrollments.registrationId, regResult[0].id)
              )
            )
            .limit(1);
          studentCancelledInSupplementary = suppEnrollment?.cancelled === true;
        }

        // During an active admin stage (supplementary admin), check the preceding
        // supplementary stage for cancellation
        if (isAdminStageActive && !isInitialAdminActive) {
          const [prevSuppStage] = await db
            .select({ id: stages.id })
            .from(stages)
            .where(
              and(
                eq(stages.recruitmentId, slot.recruitmentId),
                eq(stages.type, "supplementary"),
                eq(stages.status, "completed")
              )
            )
            .orderBy(desc(stages.order))
            .limit(1);

          if (prevSuppStage) {
            const [suppEnrollment] = await db
              .select({ cancelled: stageEnrollments.cancelled })
              .from(stageEnrollments)
              .where(
                and(
                  eq(stageEnrollments.stageId, prevSuppStage.id),
                  eq(stageEnrollments.registrationId, regResult[0].id)
                )
              )
              .limit(1);
            studentCancelledInSupplementary = suppEnrollment?.cancelled === true;
          }
        }

        assignmentCancelled = studentCancelledInSupplementary;

        if (!studentCancelledInSupplementary) {
          // During an active verification stage, check its enrollments first.
          // The algorithm may have been run on the verification stage itself
          // (e.g. supplementary verification after a supplementary admin stage
          // that was completed without running the algorithm).
          if (activeVerificationStage) {
            const [verEnrollment] = await db
              .select({ assignedDestinationId: stageEnrollments.assignedDestinationId })
              .from(stageEnrollments)
              .where(
                and(
                  eq(stageEnrollments.stageId, activeVerificationStage.id),
                  eq(stageEnrollments.registrationId, regResult[0].id)
                )
              )
              .limit(1);

            if (verEnrollment?.assignedDestinationId) {
              const [dest] = await db
                .select({ name: destinations.name })
                .from(destinations)
                .where(eq(destinations.id, verEnrollment.assignedDestinationId))
                .limit(1);

              currentAssignment = {
                destinationId: verEnrollment.assignedDestinationId,
                destinationName: dest?.name ?? verEnrollment.assignedDestinationId,
              };
            }
          }

          // Fall back to the most recent completed admin/verification stage.
          // Every completed stage has its own assignment results (propagated at
          // completion time if the algorithm wasn't run directly on that stage).
          if (!currentAssignment) {
            const [completedStage] = await db
              .select({ id: stages.id })
              .from(stages)
              .where(
                and(
                  eq(stages.recruitmentId, slot.recruitmentId),
                  or(eq(stages.type, "admin"), eq(stages.type, "verification")),
                  eq(stages.status, "completed")
                )
              )
              .orderBy(desc(stages.order))
              .limit(1);

            if (completedStage) {
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
      startDate: recruitment.startDate,
      endDate: recruitment.endDate,
    },
    allStages,
    initialStage: initialStage
      ? { id: initialStage.id, status: initialStage.status, endDate: initialStage.endDate }
      : null,
    isInitialActive,
    isSupplementaryActive,
    isVerificationStageActive,
    isAdminStageActive,
    currentAssignment,
    assignmentCancelled,
    registration,
    student,
    destinationNames,
  });
}
