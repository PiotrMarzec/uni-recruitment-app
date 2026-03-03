import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stages, stageEnrollments, registrations, slots } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { runAssignmentAlgorithm } from "@/lib/algorithm/assignment";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { eq, and } from "drizzle-orm";

export async function POST(
  req: NextRequest,
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

  if (stage.type !== "admin") {
    return NextResponse.json(
      { error: "Only admin stages can be manually completed" },
      { status: 400 }
    );
  }

  if (stage.status !== "active") {
    return NextResponse.json(
      { error: "Stage is not active" },
      { status: 400 }
    );
  }

  // Enroll all completed registrations that aren't yet enrolled
  const completedRegistrations = await db
    .select({ id: registrations.id })
    .from(registrations)
    .innerJoin(slots, eq(registrations.slotId, slots.id))
    .where(
      and(
        eq(slots.recruitmentId, stage.recruitmentId),
        eq(registrations.registrationCompleted, true)
      )
    );

  for (const reg of completedRegistrations) {
    await db
      .insert(stageEnrollments)
      .values({ stageId: id, registrationId: reg.id })
      .onConflictDoNothing();
  }

  // Run assignment algorithm
  const result = await runAssignmentAlgorithm(id);

  // Mark stage as completed
  await db
    .update(stages)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(stages.id, id));

  await logAuditEvent({
    actorType: "admin",
    actorId: admin.userId,
    actorLabel: admin.email,
    action: ACTIONS.STAGE_COMPLETED,
    resourceType: "stage",
    resourceId: id,
    recruitmentId: stage.recruitmentId,
    details: { assigned: result.assigned, unassigned: result.unassigned },
    ipAddress: getIpAddress(req),
  });

  return NextResponse.json({
    success: true,
    assigned: result.assigned,
    unassigned: result.unassigned,
  });
}
