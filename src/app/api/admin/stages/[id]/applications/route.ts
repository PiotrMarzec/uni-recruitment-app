import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stages, registrations, users, slots, destinations, recruitments } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { eq, and } from "drizzle-orm";
import { asc } from "drizzle-orm";

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
    .select({ maxDestinationChoices: recruitments.maxDestinationChoices })
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

  function mapRow(row: (typeof completedRows)[number]) {
    const prefIds: string[] = JSON.parse(row.destinationPreferences || "[]");
    const langs: string[] = JSON.parse(row.spokenLanguages || "[]");
    const avgResult = row.averageResult !== null ? parseFloat(row.averageResult) : null;
    const score =
      (avgResult ?? 0) * 3 +
      (row.additionalActivities ?? 0) +
      (row.recommendationLetters ?? 0);

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
      score,
    };
  }

  return NextResponse.json({
    stage,
    applications: completedRows.map(mapRow),
    incompleteApplications: incompleteRows.map(mapRow),
    destinations: allDestinations,
    maxDestinationChoices: recruitment?.maxDestinationChoices ?? 3,
  });
}
