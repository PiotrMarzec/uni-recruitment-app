import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  assignmentResults,
  stages,
  registrations,
  users,
  destinations,
  slots,
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

  // Find the next supplementary stage (if any) to include in emails
  const [supplementaryStage] = await db
    .select({ startDate: stages.startDate, endDate: stages.endDate, status: stages.status })
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

  // Find the nearest verification stage end date
  const [verificationStage] = await db
    .select({ endDate: stages.endDate })
    .from(stages)
    .where(
      and(
        eq(stages.recruitmentId, stage.recruitmentId),
        eq(stages.type, "verification"),
        gt(stages.order, stage.order)
      )
    )
    .orderBy(stages.order)
    .limit(1);

  // Fetch all results with student, registration, and destination info for emails
  const results = await db
    .select({
      id: assignmentResults.id,
      registrationId: assignmentResults.registrationId,
      destinationId: assignmentResults.destinationId,
      score: assignmentResults.score,
      studentName: users.fullName,
      studentEmail: users.email,
      studentLocale: users.locale,
      destinationName: destinations.name,
      destinationDescription: destinations.description,
      slotId: slots.id,
      spokenLanguages: registrations.spokenLanguages,
      averageResult: registrations.averageResult,
      recommendationLetters: registrations.recommendationLetters,
      additionalActivities: registrations.additionalActivities,
    })
    .from(assignmentResults)
    .innerJoin(registrations, eq(assignmentResults.registrationId, registrations.id))
    .innerJoin(users, eq(registrations.studentId, users.id))
    .innerJoin(slots, eq(registrations.slotId, slots.id))
    .leftJoin(destinations, eq(assignmentResults.destinationId, destinations.id))
    .where(eq(assignmentResults.stageId, id));

  // Find registrations that already had an approved assignment from a previous stage,
  // but exclude students who re-registered after that previous stage ended — they
  // changed their preferences and deserve a fresh notification.
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
      // If the student re-registered after the previous stage closed, treat them
      // as new: their assignment changed and they need a fresh email.
      if (row.registrationCompletedAt && row.stageEndDate && row.registrationCompletedAt > row.stageEndDate) {
        continue;
      }
      previouslyAssigned.add(row.registrationId);
    }
  }

  // Send emails only to students newly assigned in this stage
  let emailsSent = 0;
  const suppStageData = supplementaryStage
    ? { startDate: supplementaryStage.startDate, endDate: supplementaryStage.endDate, isActive: supplementaryStage.status === "active" }
    : undefined;

  for (const result of results) {
    if (previouslyAssigned.has(result.registrationId)) continue;

    const spokenLanguages: string[] = (() => {
      try { return JSON.parse(result.spokenLanguages); } catch { return []; }
    })();
    const registrationLink = result.slotId ? getStudentRegistrationLink(result.slotId) : undefined;

    if (result.destinationId && result.destinationName) {
      await sendAssignmentApprovedEmail({
        email: result.studentEmail,
        fullName: result.studentName,
        recruitmentName: getStageName(stage),
        destinationName: result.destinationName,
        destinationDescription: result.destinationDescription || "",
        spokenLanguages,
        averageScore: result.averageResult,
        recommendationLetters: result.recommendationLetters,
        additionalActivities: result.additionalActivities,
        finalScore: result.score,
        verificationEndDate: verificationStage?.endDate ?? null,
        supplementaryStage: suppStageData,
        registrationLink,
        locale: result.studentLocale,
      });
    } else {
      await sendAssignmentUnassignedEmail({
        email: result.studentEmail,
        fullName: result.studentName,
        recruitmentName: getStageName(stage),
        spokenLanguages,
        averageScore: result.averageResult,
        recommendationLetters: result.recommendationLetters,
        additionalActivities: result.additionalActivities,
        finalScore: result.score,
        verificationEndDate: verificationStage?.endDate ?? null,
        supplementaryStage: suppStageData,
        registrationLink,
        locale: result.studentLocale,
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
