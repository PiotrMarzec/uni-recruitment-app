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
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { eq, and, asc, gt, or, isNotNull } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: recruitmentId } = await params;
  const stageId = req.nextUrl.searchParams.get("stageId");

  const [recruitment] = await db
    .select({ maxDestinationChoices: recruitments.maxDestinationChoices })
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
    const existingAssignments = await db
      .select({
        registrationId: assignmentResults.registrationId,
        destinationId: assignmentResults.destinationId,
      })
      .from(assignmentResults)
      .where(eq(assignmentResults.stageId, stageId));

    for (const a of existingAssignments) {
      assignmentMap.set(a.registrationId, a.destinationId ?? null);
    }
    hasAssignments = existingAssignments.length > 0;

    const [stage] = await db
      .select({ type: stages.type, order: stages.order })
      .from(stages)
      .where(eq(stages.id, stageId))
      .limit(1);

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
    hasAssignments,
    hasNextSupplementary,
    stage: stageInfo,
  });
}
