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
  sendSupplementaryStageEmail,
} from "@/lib/email/send";
import { getStageName } from "@/lib/stage-name";
import { getStudentRegistrationLink } from "@/lib/auth/hmac";
import { eq, and, gt, lt, desc, inArray, isNotNull, ne } from "drizzle-orm";

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

  if (stage.type !== "admin" && stage.type !== "verification") {
    return NextResponse.json(
      { error: "Only admin and verification stages can be manually completed" },
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

  // Fetch results with student, registration, and destination info for emails
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

  // Check if this is a supplementary admin stage (admin stage that follows a supplementary stage)
  const [precedingSupplementaryStage] = await db
    .select({ id: stages.id })
    .from(stages)
    .where(
      and(
        eq(stages.recruitmentId, stage.recruitmentId),
        eq(stages.type, "supplementary"),
        lt(stages.order, stage.order)
      )
    )
    .orderBy(stages.order)
    .limit(1);
  const isSupplementaryAdminStage = !!precedingSupplementaryStage;

  // Find the next supplementary stage (if any) to include in unassigned emails
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

  // Determine students previously assigned in an earlier stage (skip re-sending email)
  // For supplementary admin stages, all students receive their final assignment result
  const registrationIds = results.map((r) => r.registrationId);
  const previouslyAssigned = new Set<string>();
  if (registrationIds.length > 0 && !isSupplementaryAdminStage) {
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

  // Find the next pending stage
  const [nextStage] = await db
    .select()
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

  // For verification stages: activate the next stage and handle transition
  if (stage.type === "verification" && nextStage && nextStage.order > stage.order) {
    await db
      .update(stages)
      .set({ startDate: now, status: "active", updatedAt: now })
      .where(eq(stages.id, nextStage.id));

    // If next stage is supplementary, enroll all students and send supplementary emails
    if (nextStage.type === "supplementary") {
      const allCompletedRegistrations = await db
        .select({
          id: registrations.id,
          slotId: registrations.slotId,
          studentEmail: users.email,
          studentName: users.fullName,
          studentLocale: users.locale,
        })
        .from(registrations)
        .innerJoin(slots, eq(registrations.slotId, slots.id))
        .innerJoin(users, eq(registrations.studentId, users.id))
        .where(
          and(
            eq(slots.recruitmentId, stage.recruitmentId),
            eq(registrations.registrationCompleted, true)
          )
        );

      for (const reg of allCompletedRegistrations) {
        await db
          .insert(stageEnrollments)
          .values({ stageId: nextStage.id, registrationId: reg.id })
          .onConflictDoNothing();
      }

      // Find most recently completed admin stage to get current assignment
      const [prevAdminStage] = await db
        .select()
        .from(stages)
        .where(
          and(
            eq(stages.recruitmentId, stage.recruitmentId),
            eq(stages.type, "admin"),
            eq(stages.status, "completed")
          )
        )
        .orderBy(desc(stages.order))
        .limit(1);

      for (const reg of allCompletedRegistrations) {
        let currentDestinationName: string | null = null;
        if (prevAdminStage) {
          const [result] = await db
            .select({ destinationName: destinations.name })
            .from(assignmentResults)
            .leftJoin(destinations, eq(assignmentResults.destinationId, destinations.id))
            .where(
              and(
                eq(assignmentResults.stageId, prevAdminStage.id),
                eq(assignmentResults.registrationId, reg.id),
                eq(assignmentResults.approved, true)
              )
            )
            .limit(1);
          currentDestinationName = result?.destinationName ?? null;
        }

        await sendSupplementaryStageEmail({
          email: reg.studentEmail,
          fullName: reg.studentName,
          recruitmentName: getStageName(nextStage),
          currentDestination: currentDestinationName,
          registrationLink: getStudentRegistrationLink(reg.slotId),
          stageEndDate: nextStage.endDate ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          locale: reg.studentLocale,
        });
      }
    }
  }

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

  return NextResponse.json({ success: true, emailsSent, nextStage: nextStage ? { id: nextStage.id, name: nextStage.name } : null });
}
