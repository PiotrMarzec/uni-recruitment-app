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
import { eq, and, asc, desc, gt, lt, or, inArray } from "drizzle-orm";

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
      guaranteed: assignmentResults.guaranteed,
    })
    .from(assignmentResults)
    .where(eq(assignmentResults.stageId, id));

  const assignmentMap = new Map(
    existingAssignments.map((a) => [a.registrationId, a.destinationId ?? null])
  );

  // Compute the set of registrations whose assignment is "guaranteed" from a
  // previous stage.  Rule: any approved assignment from the most recent completed
  // admin stage before this one carries over — UNLESS the student cancelled /
  // re-registered during a supplementary stage that sits between that admin stage
  // and the current stage.
  const guaranteedSet = new Set<string>();
  // Also collect their destination IDs for pre-population when algorithm hasn't run yet.
  const guaranteedDestMap = new Map<string, string | null>();

  if (stage.order > 0) {
    // Find the most recent completed admin or verification stage before this one.
    // Verification stages can also produce approved assignments.
    const [prevAdminStage] = await db
      .select()
      .from(stages)
      .where(
        and(
          eq(stages.recruitmentId, stage.recruitmentId),
          or(eq(stages.type, "admin"), eq(stages.type, "verification")),
          eq(stages.status, "completed"),
          lt(stages.order, stage.order)
        )
      )
      .orderBy(desc(stages.order))
      .limit(1);

    if (prevAdminStage) {
      // Check if there is a supplementary stage between the previous admin stage
      // and the current stage — students who cancelled there lose their guarantee.
      const [suppBetween] = await db
        .select()
        .from(stages)
        .where(
          and(
            eq(stages.recruitmentId, stage.recruitmentId),
            eq(stages.type, "supplementary"),
            gt(stages.order, prevAdminStage.order),
            lt(stages.order, stage.order)
          )
        )
        .orderBy(desc(stages.order))
        .limit(1);

      let cancelledIds: Set<string> | null = null; // null = no supplementary, no exclusions
      if (suppBetween) {
        const suppEnrollments = await db
          .select({ registrationId: stageEnrollments.registrationId, cancelled: stageEnrollments.cancelled })
          .from(stageEnrollments)
          .where(eq(stageEnrollments.stageId, suppBetween.id));

        // If supplementary enrollments exist, exclude cancelled students
        if (suppEnrollments.length > 0) {
          cancelledIds = new Set(
            suppEnrollments.filter((e) => e.cancelled).map((e) => e.registrationId)
          );
        }
      }

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
        if (cancelledIds && cancelledIds.has(r.registrationId)) continue;
        guaranteedSet.add(r.registrationId);
        guaranteedDestMap.set(r.registrationId, r.destinationId ?? null);
      }
    }
  }

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

    // Pre-populate guaranteed destinations into the assignment map
    for (const [regId, destId] of guaranteedDestMap) {
      assignmentMap.set(regId, destId);
    }
  }

  // Override assignment map for guaranteed students: their locked destination
  // takes priority over any stale algorithm result from the current stage.
  if (existingAssignments.length > 0) {
    for (const [regId, destId] of guaranteedDestMap) {
      if (destId) assignmentMap.set(regId, destId);
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
      assignmentGuaranteed: guaranteedSet.has(row.registrationId),
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
