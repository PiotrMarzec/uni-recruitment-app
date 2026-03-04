import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  assignmentResults,
  stages,
  registrations,
  users,
  destinations,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import {
  sendAssignmentApprovedEmail,
  sendAssignmentUnassignedEmail,
} from "@/lib/email/send";
import { eq, and, gt, inArray, isNotNull, ne } from "drizzle-orm";

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

  const now = new Date();

  // Mark all results as approved and end the stage
  await db
    .update(assignmentResults)
    .set({ approved: true })
    .where(eq(assignmentResults.stageId, id));

  await db
    .update(stages)
    .set({ endDate: now, status: "completed", updatedAt: now })
    .where(eq(stages.id, id));

  // Find the next pending stage by order
  const [nextStage] = await db
    .select({ id: stages.id, name: stages.name })
    .from(stages)
    .where(
      and(
        eq(stages.recruitmentId, stage.recruitmentId),
        eq(stages.status, "pending"),
        gt(stages.order, stage.order)
      )
    )
    .orderBy(stages.order)
    .limit(1);

  // Fetch all results with student and destination info for emails
  const results = await db
    .select({
      id: assignmentResults.id,
      registrationId: assignmentResults.registrationId,
      destinationId: assignmentResults.destinationId,
      studentName: users.fullName,
      studentEmail: users.email,
      destinationName: destinations.name,
      destinationDescription: destinations.description,
    })
    .from(assignmentResults)
    .innerJoin(registrations, eq(assignmentResults.registrationId, registrations.id))
    .innerJoin(users, eq(registrations.studentId, users.id))
    .leftJoin(destinations, eq(assignmentResults.destinationId, destinations.id))
    .where(eq(assignmentResults.stageId, id));

  // Find registrations that already had an approved assignment from a previous stage
  const registrationIds = results.map((r) => r.registrationId);
  const previouslyAssigned = new Set<string>();
  if (registrationIds.length > 0) {
    const previousAssignments = await db
      .select({ registrationId: assignmentResults.registrationId })
      .from(assignmentResults)
      .where(
        and(
          inArray(assignmentResults.registrationId, registrationIds),
          ne(assignmentResults.stageId, id),
          eq(assignmentResults.approved, true),
          isNotNull(assignmentResults.destinationId)
        )
      );
    for (const row of previousAssignments) {
      previouslyAssigned.add(row.registrationId);
    }
  }

  // Send emails only to students newly assigned in this stage
  let emailsSent = 0;
  for (const result of results) {
    if (previouslyAssigned.has(result.registrationId)) continue;

    if (result.destinationId && result.destinationName) {
      await sendAssignmentApprovedEmail({
        email: result.studentEmail,
        fullName: result.studentName,
        recruitmentName: stage.name,
        destinationName: result.destinationName,
        destinationDescription: result.destinationDescription || "",
      });
    } else {
      await sendAssignmentUnassignedEmail({
        email: result.studentEmail,
        fullName: result.studentName,
        recruitmentName: stage.name,
      });
    }
    emailsSent++;
  }

  await logAuditEvent({
    actorType: "admin",
    actorId: admin.userId,
    actorLabel: admin.email,
    action: ACTIONS.ASSIGNMENT_APPROVED,
    resourceType: "stage",
    resourceId: id,
    recruitmentId: stage.recruitmentId,
    details: { emailsSent, totalResults: results.length, nextStageId: nextStage?.id ?? null },
    ipAddress: getIpAddress(req),
  });

  return NextResponse.json({
    success: true,
    emailsSent,
    nextStage: nextStage ?? null,
  });
}
