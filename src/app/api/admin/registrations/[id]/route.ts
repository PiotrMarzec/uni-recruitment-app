import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { registrations, users, slots, stages, destinations, assignmentResults } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { broadcastApplicationRowUpdate } from "@/lib/websocket/events";
import { STUDENT_LEVELS, StudentLevel } from "@/db/schema/registrations";
import { z } from "zod";
import { eq, and } from "drizzle-orm";

const updateSchema = z.object({
  fullName: z.string().min(1).max(255).optional(),
  enrollmentId: z.string().regex(/^[1-9]\d{5}$/).optional(),
  level: z.enum([...STUDENT_LEVELS] as [StudentLevel, ...StudentLevel[]]).optional(),
  spokenLanguages: z.array(z.string()).optional(),
  destinationPreferences: z.array(z.string().uuid()).optional(),
  averageResult: z.number().min(0).max(6).nullable().optional(),
  additionalActivities: z.number().int().min(0).max(4).nullable().optional(),
  recommendationLetters: z.number().int().min(0).max(10).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [existingReg] = await db
    .select()
    .from(registrations)
    .where(eq(registrations.id, id))
    .limit(1);

  if (!existingReg) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }

  const [slot] = await db
    .select()
    .from(slots)
    .where(eq(slots.id, existingReg.slotId))
    .limit(1);

  const body = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (data.fullName !== undefined) {
    after.fullName = data.fullName;
    if (existingReg.studentId) {
      await db
        .update(users)
        .set({ fullName: data.fullName })
        .where(eq(users.id, existingReg.studentId));
    }
  }

  if (data.enrollmentId !== undefined) {
    before.enrollmentId = existingReg.enrollmentId;
    updates.enrollmentId = data.enrollmentId;
    after.enrollmentId = data.enrollmentId;
  }

  if (data.level !== undefined) {
    before.level = existingReg.level;
    updates.level = data.level;
    after.level = data.level;
  }

  if (data.spokenLanguages !== undefined) {
    before.spokenLanguages = JSON.parse(existingReg.spokenLanguages || "[]");
    updates.spokenLanguages = JSON.stringify(data.spokenLanguages);
    after.spokenLanguages = data.spokenLanguages;
  }

  if (data.destinationPreferences !== undefined) {
    before.destinationPreferences = JSON.parse(existingReg.destinationPreferences || "[]");
    updates.destinationPreferences = JSON.stringify(data.destinationPreferences);
    after.destinationPreferences = data.destinationPreferences;
  }

  if (data.averageResult !== undefined) {
    before.averageResult = existingReg.averageResult;
    updates.averageResult = data.averageResult !== null ? String(data.averageResult) : null;
    after.averageResult = data.averageResult;
  }

  if (data.additionalActivities !== undefined) {
    before.additionalActivities = existingReg.additionalActivities;
    updates.additionalActivities = data.additionalActivities;
    after.additionalActivities = data.additionalActivities;
  }

  if (data.recommendationLetters !== undefined) {
    before.recommendationLetters = existingReg.recommendationLetters;
    updates.recommendationLetters = data.recommendationLetters;
    after.recommendationLetters = data.recommendationLetters;
  }

  if (data.notes !== undefined) {
    before.notes = existingReg.notes;
    updates.notes = data.notes;
    after.notes = data.notes;
  }

  await db.update(registrations).set(updates).where(eq(registrations.id, id));

  await logAuditEvent({
    actorType: "admin",
    actorId: admin.userId,
    actorLabel: admin.email,
    action: ACTIONS.REGISTRATION_ADMIN_EDITED,
    resourceType: "registration",
    resourceId: id,
    recruitmentId: slot?.recruitmentId,
    details: { before, after },
    ipAddress: getIpAddress(req),
  });

  // Broadcast the full updated row to all admin clients watching this stage's applications grid
  if (slot?.recruitmentId) {
    // Resolve final field values (merge updates onto existing data)
    const [updatedUser] = await db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, existingReg.studentId!))
      .limit(1);

    const finalAvgResult =
      data.averageResult !== undefined
        ? data.averageResult
        : existingReg.averageResult !== null
        ? parseFloat(existingReg.averageResult)
        : null;
    const finalActivities =
      data.additionalActivities !== undefined
        ? data.additionalActivities
        : existingReg.additionalActivities;
    const finalLetters =
      data.recommendationLetters !== undefined
        ? data.recommendationLetters
        : existingReg.recommendationLetters;
    const finalPrefs: string[] =
      data.destinationPreferences ?? JSON.parse(existingReg.destinationPreferences || "[]");
    const finalLangs: string[] =
      data.spokenLanguages ?? JSON.parse(existingReg.spokenLanguages || "[]");
    const score = (finalAvgResult ?? 0) * 3 + (finalActivities ?? 0) + (finalLetters ?? 0);

    // Build destination name map for the recruitment
    const allDestinations = await db
      .select({ id: destinations.id, name: destinations.name })
      .from(destinations)
      .where(eq(destinations.recruitmentId, slot.recruitmentId));
    const destMap = Object.fromEntries(allDestinations.map((d) => [d.id, d.name]));

    // Find active admin stages and broadcast the updated row to each
    const activeAdminStages = await db
      .select({ id: stages.id })
      .from(stages)
      .where(
        and(
          eq(stages.recruitmentId, slot.recruitmentId),
          eq(stages.type, "admin"),
          eq(stages.status, "active")
        )
      );

    for (const stage of activeAdminStages) {
      const [assignment] = await db
        .select({ destinationId: assignmentResults.destinationId })
        .from(assignmentResults)
        .where(
          and(
            eq(assignmentResults.stageId, stage.id),
            eq(assignmentResults.registrationId, id)
          )
        )
        .limit(1);

      const assignedDestId = assignment?.destinationId ?? null;

      broadcastApplicationRowUpdate({
        type: "application_row_update",
        stageId: stage.id,
        application: {
          registrationId: id,
          slotNumber: slot.number,
          studentName: updatedUser?.fullName ?? "",
          enrollmentId: (data.enrollmentId ?? existingReg.enrollmentId) || null,
          level: (data.level ?? existingReg.level) as string | null,
          spokenLanguages: finalLangs,
          destinationPreferences: finalPrefs,
          destinationNames: finalPrefs.map((pid) => destMap[pid] ?? pid),
          averageResult: finalAvgResult,
          additionalActivities: finalActivities,
          recommendationLetters: finalLetters,
          notes: data.notes !== undefined ? data.notes : existingReg.notes,
          score,
          assignedDestinationId: assignedDestId,
          assignedDestinationName: assignedDestId ? (destMap[assignedDestId] ?? null) : null,
          registrationCompleted: existingReg.registrationCompleted,
        },
      });
    }
  }

  return NextResponse.json({ success: true });
}
