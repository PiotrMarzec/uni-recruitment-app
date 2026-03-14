import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  stages,
  registrations,
  users,
  slots,
  destinations,
  recruitments,
  assignmentResults,
  stageEnrollments,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { eq, and, asc, desc, gt, lt, or, isNotNull } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: recruitmentId } = await params;
  const stageId = req.nextUrl.searchParams.get("stageId");

  const [recruitment] = await db
    .select({ maxDestinationChoices: recruitments.maxDestinationChoices, name: recruitments.name })
    .from(recruitments)
    .where(eq(recruitments.id, recruitmentId))
    .limit(1);

  if (!recruitment) {
    return NextResponse.json({ error: "Recruitment not found" }, { status: 404 });
  }

  const allDestinations = await db
    .select({ id: destinations.id, name: destinations.name })
    .from(destinations)
    .where(eq(destinations.recruitmentId, recruitmentId));

  const destMap = Object.fromEntries(allDestinations.map((d) => [d.id, d.name]));

  const rows = await db
    .select({
      registrationId: registrations.id,
      slotId: slots.id,
      slotNumber: slots.number,
      slotCreatedAt: slots.createdAt,
      studentName: users.fullName,
      enrollmentId: registrations.enrollmentId,
      level: registrations.level,
      spokenLanguages: registrations.spokenLanguages,
      destinationPreferences: registrations.destinationPreferences,
      averageResult: registrations.averageResult,
      additionalActivities: registrations.additionalActivities,
      recommendationLetters: registrations.recommendationLetters,
      notes: registrations.notes,
      updatedAt: registrations.updatedAt,
      registrationCompleted: registrations.registrationCompleted,
    })
    .from(slots)
    .leftJoin(registrations, eq(registrations.slotId, slots.id))
    .leftJoin(users, eq(registrations.studentId, users.id))
    .where(
      and(
        eq(slots.recruitmentId, recruitmentId),
        or(isNotNull(registrations.id), eq(slots.status, "registration_started"))
      )
    )
    .orderBy(asc(slots.number));

  const assignmentMap = new Map<string, string | null>();
  let hasAssignments = false;
  let hasNextSupplementary = false;
  let stageInfo: { type: string; order: number } | null = null;

  if (stageId) {
    const [stage] = await db
      .select({ type: stages.type, order: stages.order })
      .from(stages)
      .where(eq(stages.id, stageId))
      .limit(1);

    // Determine where to look up assignments. Stages that don't have their own
    // assignment results yet should pre-populate from previous stages so admins
    // see the current placements.
    let assignmentLookupStageId = stageId;
    const cancelledRegistrationIds = new Set<string>();
    let isPrePopulated = false;

    if (stage && stage.order > 0) {
      // Helper: apply supplementary cancellation filter
      async function applyCancelledFilter(supplementaryStageId: string) {
        const suppEnrollments = await db
          .select({
            registrationId: stageEnrollments.registrationId,
            cancelled: stageEnrollments.cancelled,
          })
          .from(stageEnrollments)
          .where(eq(stageEnrollments.stageId, supplementaryStageId));
        for (const e of suppEnrollments) {
          if (e.cancelled) cancelledRegistrationIds.add(e.registrationId);
        }
      }

      // Helper: find the most recent supplementary stage in the chain before a
      // given order, and use the admin stage before it as the assignment source.
      async function traceBackThroughSupplementary(beforeOrder: number): Promise<boolean> {
        const [suppStage] = await db
          .select({ id: stages.id, order: stages.order })
          .from(stages)
          .where(
            and(
              eq(stages.recruitmentId, recruitmentId),
              eq(stages.type, "supplementary"),
              lt(stages.order, beforeOrder)
            )
          )
          .orderBy(desc(stages.order))
          .limit(1);
        if (!suppStage) return false;

        const [prevAdmin] = await db
          .select({ id: stages.id })
          .from(stages)
          .where(
            and(
              eq(stages.recruitmentId, recruitmentId),
              eq(stages.type, "admin"),
              eq(stages.status, "completed"),
              lt(stages.order, suppStage.order)
            )
          )
          .orderBy(desc(stages.order))
          .limit(1);
        if (!prevAdmin) return false;

        assignmentLookupStageId = prevAdmin.id;
        await applyCancelledFilter(suppStage.id);
        return true;
      }

      if (stage.type === "supplementary") {
        // Supplementary stages: show assignments from the admin stage before it
        const [prevAdminStage] = await db
          .select({ id: stages.id })
          .from(stages)
          .where(
            and(
              eq(stages.recruitmentId, recruitmentId),
              eq(stages.type, "admin"),
              eq(stages.status, "completed"),
              lt(stages.order, stage.order)
            )
          )
          .orderBy(desc(stages.order))
          .limit(1);
        if (prevAdminStage) {
          assignmentLookupStageId = prevAdminStage.id;
        }

        // Find students who cancelled during this supplementary stage
        await applyCancelledFilter(stageId);
      } else {
        // Admin or verification stages: check if we have our own results first
        const [existingResult] = await db
          .select({ id: assignmentResults.id })
          .from(assignmentResults)
          .where(eq(assignmentResults.stageId, stageId))
          .limit(1);

        if (!existingResult) {
          // No results on this stage yet — try to pre-populate from previous stages.

          if (stage.type === "verification") {
            // Verification: look at the preceding admin stage first
            const [prevAdminStage] = await db
              .select({ id: stages.id, order: stages.order })
              .from(stages)
              .where(
                and(
                  eq(stages.recruitmentId, recruitmentId),
                  eq(stages.type, "admin"),
                  eq(stages.status, "completed"),
                  eq(stages.order, stage.order - 1)
                )
              )
              .limit(1);

            if (prevAdminStage) {
              // Check if the preceding admin stage has approved results
              const [adminResult] = await db
                .select({ id: assignmentResults.id })
                .from(assignmentResults)
                .where(
                  and(
                    eq(assignmentResults.stageId, prevAdminStage.id),
                    eq(assignmentResults.approved, true)
                  )
                )
                .limit(1);

              if (adminResult) {
                assignmentLookupStageId = prevAdminStage.id;
                isPrePopulated = true;
              } else {
                // Admin stage has no results — trace back through supplementary chain
                isPrePopulated = await traceBackThroughSupplementary(prevAdminStage.order);
              }
            }
          }

          if (stage.type === "admin") {
            // Admin stage after supplementary: trace back through the supplementary
            const [prevSuppStage] = await db
              .select({ id: stages.id })
              .from(stages)
              .where(
                and(
                  eq(stages.recruitmentId, recruitmentId),
                  eq(stages.type, "supplementary"),
                  eq(stages.order, stage.order - 1)
                )
              )
              .limit(1);

            if (prevSuppStage) {
              isPrePopulated = await traceBackThroughSupplementary(stage.order);
            }
          }
        }
      }
    }

    // When showing results from the current stage, include unapproved results
    // (the algorithm creates results with approved=false until the admin approves).
    // When pre-populating from a previous stage, only show approved results.
    const lookingAtOwnResults = assignmentLookupStageId === stageId;
    const existingAssignments = await db
      .select({
        registrationId: assignmentResults.registrationId,
        destinationId: assignmentResults.destinationId,
      })
      .from(assignmentResults)
      .where(
        lookingAtOwnResults
          ? eq(assignmentResults.stageId, assignmentLookupStageId)
          : and(
              eq(assignmentResults.stageId, assignmentLookupStageId),
              eq(assignmentResults.approved, true)
            )
      );

    for (const a of existingAssignments) {
      // Skip cancelled students — they forfeited their assignment by re-registering
      if (cancelledRegistrationIds.has(a.registrationId)) continue;
      assignmentMap.set(a.registrationId, a.destinationId ?? null);
    }
    hasAssignments = isPrePopulated
      ? assignmentMap.size > 0
      : existingAssignments.length > 0;

    if (stage) {
      stageInfo = { type: stage.type, order: stage.order };
      const [nextSupplementary] = await db
        .select({ id: stages.id })
        .from(stages)
        .where(
          and(
            eq(stages.recruitmentId, recruitmentId),
            eq(stages.type, "supplementary"),
            eq(stages.status, "pending"),
            gt(stages.order, stage.order)
          )
        )
        .limit(1);
      hasNextSupplementary = !!nextSupplementary;
    }
  }

  function mapRow(row: typeof rows[number]) {
    const prefIds: string[] = JSON.parse(row.destinationPreferences || "[]");
    const langs: string[] = JSON.parse(row.spokenLanguages || "[]");
    const avgResult = row.averageResult !== null ? parseFloat(row.averageResult) : null;
    const score =
      (avgResult ?? 0) * 3 +
      (row.additionalActivities ?? 0) +
      (row.recommendationLetters ?? 0);
    // Pre-OTP rows have no registrationId — use slotId as placeholder key
    const registrationId = row.registrationId ?? row.slotId;
    const assignedDestId = stageId ? (assignmentMap.get(registrationId) ?? null) : null;

    return {
      registrationId,
      slotId: row.slotId,
      slotNumber: row.slotNumber,
      studentName: row.studentName,
      enrollmentId: row.enrollmentId,
      level: row.level,
      spokenLanguages: langs,
      destinationPreferences: prefIds,
      destinationNames: prefIds.map((pid) => destMap[pid] ?? pid),
      averageResult: avgResult,
      additionalActivities: row.additionalActivities,
      recommendationLetters: row.recommendationLetters,
      notes: row.notes ?? null,
      registrationCompleted: row.registrationCompleted ?? false,
      updatedAt: row.updatedAt ?? row.slotCreatedAt,
      score,
      assignedDestinationId: assignedDestId,
      assignedDestinationName: assignedDestId ? (destMap[assignedDestId] ?? null) : null,
    };
  }

  return NextResponse.json({
    registrations: rows.map(mapRow),
    destinations: allDestinations,
    maxDestinationChoices: recruitment.maxDestinationChoices ?? 3,
    recruitmentName: recruitment.name ?? null,
    hasAssignments,
    hasNextSupplementary,
    stage: stageInfo,
  });
}
