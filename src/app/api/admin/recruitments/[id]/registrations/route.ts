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

    // For supplementary stages, look up assignments from the most recently
    // completed admin stage before it (those assignments were approved during
    // the preceding verification stage and should carry over).
    // Students who re-registered (cancelled: true in the supplementary enrollment)
    // lose their assignment and should not be shown as assigned.
    let assignmentLookupStageId = stageId;
    const cancelledRegistrationIds = new Set<string>();
    if (stage && stage.type === "supplementary") {
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

      // Find students who cancelled (re-registered) during this supplementary stage
      const cancelledEnrollments = await db
        .select({ registrationId: stageEnrollments.registrationId })
        .from(stageEnrollments)
        .where(
          and(
            eq(stageEnrollments.stageId, stageId),
            eq(stageEnrollments.cancelled, true)
          )
        );
      for (const e of cancelledEnrollments) {
        cancelledRegistrationIds.add(e.registrationId);
      }
    }

    // For admin stages that follow a supplementary stage and have no assignment
    // results yet, pre-populate from the admin stage before the supplementary.
    // Non-cancelled supplementary enrollments keep their approved assignments.
    let prePopulateFromSupplementary = false;
    if (stage && stage.type === "admin" && stage.order > 1) {
      const [prevSupplementaryStage] = await db
        .select({ id: stages.id, order: stages.order })
        .from(stages)
        .where(
          and(
            eq(stages.recruitmentId, recruitmentId),
            eq(stages.type, "supplementary"),
            eq(stages.order, stage.order - 1)
          )
        )
        .limit(1);

      if (prevSupplementaryStage) {
        // Check if the current stage already has its own assignment results
        const [existingResult] = await db
          .select({ id: assignmentResults.id })
          .from(assignmentResults)
          .where(eq(assignmentResults.stageId, stageId))
          .limit(1);

        if (!existingResult) {
          prePopulateFromSupplementary = true;

          // Find the admin stage before the supplementary
          const [prevAdminStage] = await db
            .select({ id: stages.id })
            .from(stages)
            .where(
              and(
                eq(stages.recruitmentId, recruitmentId),
                eq(stages.type, "admin"),
                eq(stages.status, "completed"),
                lt(stages.order, prevSupplementaryStage.order)
              )
            )
            .orderBy(desc(stages.order))
            .limit(1);
          if (prevAdminStage) {
            assignmentLookupStageId = prevAdminStage.id;
          }

          // Find students who cancelled during the supplementary stage
          const suppEnrollments = await db
            .select({
              registrationId: stageEnrollments.registrationId,
              cancelled: stageEnrollments.cancelled,
            })
            .from(stageEnrollments)
            .where(eq(stageEnrollments.stageId, prevSupplementaryStage.id));

          for (const e of suppEnrollments) {
            if (e.cancelled) {
              cancelledRegistrationIds.add(e.registrationId);
            }
          }
        }
      }
    }

    const existingAssignments = await db
      .select({
        registrationId: assignmentResults.registrationId,
        destinationId: assignmentResults.destinationId,
      })
      .from(assignmentResults)
      .where(
        and(
          eq(assignmentResults.stageId, assignmentLookupStageId),
          eq(assignmentResults.approved, true)
        )
      );

    for (const a of existingAssignments) {
      // Skip cancelled students — they forfeited their assignment by re-registering
      if (cancelledRegistrationIds.has(a.registrationId)) continue;
      assignmentMap.set(a.registrationId, a.destinationId ?? null);
    }
    hasAssignments = prePopulateFromSupplementary
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
