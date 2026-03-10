import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  stages,
  stageEnrollments,
  registrations,
  slots,
  assignmentResults,
  users,
  destinations,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import {
  sendAssignmentApprovedEmail,
  sendAssignmentUnassignedEmail,
} from "@/lib/email/send";
import { getStageName } from "@/lib/stage-name";
import { getStudentRegistrationLink } from "@/lib/auth/hmac";
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

  const now = new Date();

  // Mark stage as completed
  await db
    .update(stages)
    .set({ status: "completed", endDate: now, updatedAt: now })
    .where(eq(stages.id, id));

  // Auto-approve all assignment results for this stage
  await db
    .update(assignmentResults)
    .set({ approved: true })
    .where(eq(assignmentResults.stageId, id));

  // Fetch results with student and destination info for emails
  const results = await db
    .select({
      id: assignmentResults.id,
      registrationId: assignmentResults.registrationId,
      destinationId: assignmentResults.destinationId,
      studentName: users.fullName,
      studentEmail: users.email,
      studentLocale: users.locale,
      destinationName: destinations.name,
      destinationDescription: destinations.description,
      slotId: slots.id,
    })
    .from(assignmentResults)
    .innerJoin(registrations, eq(assignmentResults.registrationId, registrations.id))
    .innerJoin(users, eq(registrations.studentId, users.id))
    .innerJoin(slots, eq(registrations.slotId, slots.id))
    .leftJoin(destinations, eq(assignmentResults.destinationId, destinations.id))
    .where(eq(assignmentResults.stageId, id));

  // Find the next supplementary stage (if any) to include in unassigned emails
  const [supplementaryStage] = await db
    .select({ startDate: stages.startDate, endDate: stages.endDate })
    .from(stages)
    .where(
      and(
        eq(stages.recruitmentId, stage.recruitmentId),
        eq(stages.type, "supplementary"),
        gt(stages.order, stage.order)
      )
    )
    .orderBy(stages.order)
    .limit(1);

  // Determine students previously assigned in an earlier stage (skip re-sending email)
  const registrationIds = results.map((r) => r.registrationId);
  const previouslyAssigned = new Set<string>();
  if (registrationIds.length > 0) {
    const previousAssignments = await db
      .select({
        registrationId: assignmentResults.registrationId,
        registrationCompletedAt: registrations.registrationCompletedAt,
        stageEndDate: stages.endDate,
      })
      .from(assignmentResults)
      .innerJoin(registrations, eq(assignmentResults.registrationId, registrations.id))
      .innerJoin(stages, eq(assignmentResults.stageId, stages.id))
      .where(
        and(
          inArray(assignmentResults.registrationId, registrationIds),
          ne(assignmentResults.stageId, id),
          eq(assignmentResults.approved, true),
          isNotNull(assignmentResults.destinationId)
        )
      );
    for (const row of previousAssignments) {
      if (row.registrationCompletedAt && row.stageEndDate && row.registrationCompletedAt > row.stageEndDate) {
        continue;
      }
      previouslyAssigned.add(row.registrationId);
    }
  }

  // Send emails to newly assigned/unassigned students
  let emailsSent = 0;
  for (const result of results) {
    if (previouslyAssigned.has(result.registrationId)) continue;
    if (result.destinationId && result.destinationName) {
      await sendAssignmentApprovedEmail({
        email: result.studentEmail,
        fullName: result.studentName,
        recruitmentName: getStageName(stage),
        destinationName: result.destinationName,
        destinationDescription: result.destinationDescription || "",
        supplementaryStage: supplementaryStage ?? undefined,
        locale: result.studentLocale,
      });
    } else {
      await sendAssignmentUnassignedEmail({
        email: result.studentEmail,
        fullName: result.studentName,
        recruitmentName: getStageName(stage),
        supplementaryStage: supplementaryStage ?? undefined,
        registrationLink: result.slotId ? getStudentRegistrationLink(result.slotId) : undefined,
        locale: result.studentLocale,
      });
    }
    emailsSent++;
  }

  // Find the next pending stage
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

  await logAuditEvent({
    actorType: "admin",
    actorId: admin.userId,
    actorLabel: admin.email,
    action: ACTIONS.STAGE_COMPLETED,
    resourceType: "stage",
    resourceId: id,
    recruitmentId: stage.recruitmentId,
    details: { emailsSent, totalResults: results.length },
    ipAddress: getIpAddress(req),
  });

  return NextResponse.json({ success: true, emailsSent, nextStage: nextStage ?? null });
}
