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
import { eq, and, asc, desc, gt, lt, inArray } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
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

  const [recruitment] = await db
    .select({ maxDestinationChoices: recruitments.maxDestinationChoices, name: recruitments.name })
    .from(recruitments)
    .where(eq(recruitments.id, stage.recruitmentId))
    .limit(1);

  const allDestinations = await db
    .select({ id: destinations.id, name: destinations.name })
    .from(destinations)
    .where(eq(destinations.recruitmentId, stage.recruitmentId));

  const destMap = Object.fromEntries(allDestinations.map((d) => [d.id, d.name]));

  const selectFields = {
    registrationId: registrations.id,
    slotId: slots.id,
    slotNumber: slots.number,
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
  };

  const [completedRows, incompleteRows] = await Promise.all([
    db
      .select(selectFields)
      .from(registrations)
      .innerJoin(users, eq(registrations.studentId, users.id))
      .innerJoin(slots, eq(registrations.slotId, slots.id))
      .where(
        and(
          eq(slots.recruitmentId, stage.recruitmentId),
          eq(registrations.registrationCompleted, true)
        )
      )
      .orderBy(asc(slots.number)),
    db
      .select(selectFields)
      .from(registrations)
      .innerJoin(users, eq(registrations.studentId, users.id))
      .innerJoin(slots, eq(registrations.slotId, slots.id))
      .where(
        and(
          eq(slots.recruitmentId, stage.recruitmentId),
          eq(registrations.registrationCompleted, false)
        )
      )
      .orderBy(asc(slots.number)),
  ]);

  // Fetch current assignment results for this stage (keyed by registrationId)
  const existingAssignments = await db
    .select({
      registrationId: assignmentResults.registrationId,
      destinationId: assignmentResults.destinationId,
    })
    .from(assignmentResults)
    .where(eq(assignmentResults.stageId, id));

  const assignmentMap = new Map(
    existingAssignments.map((a) => [a.registrationId, a.destinationId ?? null])
  );

  // For stages that haven't run the algorithm yet, pre-populate the Approved column
  // with assignments from the previous stage so admins see current placements.
  if (existingAssignments.length === 0 && stage.order > 0) {
    // For verification stages: show approved assignments from the preceding admin stage
    if (stage.type === "verification") {
      const [prevAdminStage] = await db
        .select()
        .from(stages)
        .where(
          and(
            eq(stages.recruitmentId, stage.recruitmentId),
            eq(stages.type, "admin"),
            eq(stages.status, "completed"),
            eq(stages.order, stage.order - 1)
          )
        )
        .limit(1);

      if (prevAdminStage) {
        const prevApproved = await db
          .select({
            registrationId: assignmentResults.registrationId,
            destinationId: assignmentResults.destinationId,
          })
          .from(assignmentResults)
          .where(
            and(
              eq(assignmentResults.stageId, prevAdminStage.id),
              eq(assignmentResults.approved, true)
            )
          );

        for (const r of prevApproved) {
          assignmentMap.set(r.registrationId, r.destinationId ?? null);
        }
      }
    }

    // For supplementary admin stages: show guaranteed destinations from before the supplementary
    if (stage.order > 1) {
      const [prevSupplementaryStage] = await db
        .select()
        .from(stages)
        .where(
          and(
            eq(stages.recruitmentId, stage.recruitmentId),
            eq(stages.type, "supplementary"),
            eq(stages.order, stage.order - 1)
          )
        )
        .limit(1);

      if (prevSupplementaryStage) {
        // Find the most recently completed admin stage before the supplementary.
        // Assignment results are always created on admin stages (the algorithm runs there).
        const [prevApprovedStage] = await db
          .select()
          .from(stages)
          .where(
            and(
              eq(stages.recruitmentId, stage.recruitmentId),
              eq(stages.type, "admin"),
              eq(stages.status, "completed"),
              lt(stages.order, prevSupplementaryStage.order)
            )
          )
          .orderBy(desc(stages.order))
          .limit(1);

        if (prevApprovedStage) {
          const allSuppEnrollments = await db
            .select({ registrationId: stageEnrollments.registrationId, cancelled: stageEnrollments.cancelled })
            .from(stageEnrollments)
            .where(eq(stageEnrollments.stageId, prevSupplementaryStage.id));

          // If no supplementary enrollments exist (enrollment creation was missed), treat
          // all students as non-cancelled so their guaranteed destinations are visible.
          const guaranteedIds = allSuppEnrollments.length === 0
            ? null // null = fetch for all students
            : allSuppEnrollments.filter((e) => !e.cancelled).map((e) => e.registrationId);

          if (guaranteedIds === null || guaranteedIds.length > 0) {
            const prevApproved = await db
              .select({
                registrationId: assignmentResults.registrationId,
                destinationId: assignmentResults.destinationId,
              })
              .from(assignmentResults)
              .where(
                guaranteedIds !== null
                  ? and(
                      eq(assignmentResults.stageId, prevApprovedStage.id),
                      eq(assignmentResults.approved, true),
                      inArray(assignmentResults.registrationId, guaranteedIds)
                    )
                  : and(
                      eq(assignmentResults.stageId, prevApprovedStage.id),
                      eq(assignmentResults.approved, true)
                    )
              );

            for (const r of prevApproved) {
              assignmentMap.set(r.registrationId, r.destinationId ?? null);
            }
          }
        }
      }
    }
  }

  function mapRow(row: (typeof completedRows)[number]) {
    const prefIds: string[] = JSON.parse(row.destinationPreferences || "[]");
    const langs: string[] = JSON.parse(row.spokenLanguages || "[]");
    const avgResult = row.averageResult !== null ? parseFloat(row.averageResult) : null;
    const score =
      (avgResult ?? 0) * 3 +
      (row.additionalActivities ?? 0) +
      (row.recommendationLetters ?? 0);

    const assignedDestId = assignmentMap.get(row.registrationId) ?? null;

    return {
      registrationId: row.registrationId,
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
      updatedAt: row.updatedAt,
      score,
      assignedDestinationId: assignedDestId,
      assignedDestinationName: assignedDestId ? (destMap[assignedDestId] ?? null) : null,
    };
  }

  // Check whether a supplementary stage is planned after this admin stage
  const [nextSupplementary] = await db
    .select({ id: stages.id })
    .from(stages)
    .where(
      and(
        eq(stages.recruitmentId, stage.recruitmentId),
        eq(stages.type, "supplementary"),
        eq(stages.status, "pending"),
        gt(stages.order, stage.order)
      )
    )
    .limit(1);

  return NextResponse.json({
    stage,
    applications: completedRows.map(mapRow),
    incompleteApplications: incompleteRows.map(mapRow),
    destinations: allDestinations,
    maxDestinationChoices: recruitment?.maxDestinationChoices ?? 3,
    recruitmentName: recruitment?.name ?? null,
    hasAssignments: existingAssignments.length > 0,
    hasNextSupplementary: !!nextSupplementary,
  });
}
