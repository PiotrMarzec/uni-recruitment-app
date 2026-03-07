import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stages, stageEnrollments, registrations, slots, destinations, assignmentResults } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { runAssignmentAlgorithm } from "@/lib/algorithm/assignment";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { broadcastApplicationAssignmentsUpdate } from "@/lib/websocket/events";
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
      { error: "Only admin stages support assignment" },
      { status: 400 }
    );
  }

  if (stage.status !== "active") {
    return NextResponse.json({ error: "Stage is not active" }, { status: 400 });
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

  // Clear previous assignments for a clean re-run (reset assignedDestinationId on all enrollments)
  await db
    .update(stageEnrollments)
    .set({ assignedDestinationId: null })
    .where(eq(stageEnrollments.stageId, id));

  // Run assignment algorithm (saves results to assignmentResults table)
  const result = await runAssignmentAlgorithm(id);

  await logAuditEvent({
    actorType: "admin",
    actorId: admin.userId,
    actorLabel: admin.email,
    action: ACTIONS.ASSIGNMENT_COMPUTED,
    resourceType: "stage",
    resourceId: id,
    recruitmentId: stage.recruitmentId,
    details: { assigned: result.assigned, unassigned: result.unassigned },
    ipAddress: getIpAddress(req),
  });

  // Broadcast updated assignment results so clients can refresh the Assigned column in-place
  const [newAssignments, allDestinations] = await Promise.all([
    db
      .select({
        registrationId: assignmentResults.registrationId,
        destinationId: assignmentResults.destinationId,
      })
      .from(assignmentResults)
      .where(eq(assignmentResults.stageId, id)),
    db
      .select({ id: destinations.id, name: destinations.name })
      .from(destinations)
      .where(eq(destinations.recruitmentId, stage.recruitmentId)),
  ]);
  const destMap = Object.fromEntries(allDestinations.map((d) => [d.id, d.name]));

  broadcastApplicationAssignmentsUpdate({
    type: "application_assignments_update",
    stageId: id,
    assignments: newAssignments.map((a) => ({
      registrationId: a.registrationId,
      assignedDestinationId: a.destinationId ?? null,
      assignedDestinationName: a.destinationId ? (destMap[a.destinationId] ?? null) : null,
    })),
    assigned: result.assigned,
    unassigned: result.unassigned,
    hasAssignments: newAssignments.length > 0,
  });

  return NextResponse.json({
    success: true,
    assigned: result.assigned,
    unassigned: result.unassigned,
  });
}
