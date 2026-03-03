import { db } from "@/db";
import {
  stages,
  registrations,
  stageEnrollments,
  users,
  slots,
} from "@/db/schema";
import { eq, and, lt, inArray } from "drizzle-orm";
import { logAuditEvent, ACTIONS } from "@/lib/audit";
import {
  sendInitialStageClosedEmail,
} from "@/lib/email/send";

export async function processStageTransitions(): Promise<void> {
  const now = new Date();

  // 1. Find active initial stages that have passed their end_date
  const expiredInitialStages = await db
    .select()
    .from(stages)
    .where(
      and(
        eq(stages.type, "initial"),
        eq(stages.status, "active"),
        lt(stages.endDate, now)
      )
    );

  for (const stage of expiredInitialStages) {
    try {
      await transitionInitialToAdmin(stage);
    } catch (err) {
      console.error(`[Stage Transitions] Error transitioning stage ${stage.id}:`, err);
    }
  }

  // 2. Find active supplementary stages that have passed their end_date
  const expiredSupplementaryStages = await db
    .select()
    .from(stages)
    .where(
      and(
        eq(stages.type, "supplementary"),
        eq(stages.status, "active"),
        lt(stages.endDate, now)
      )
    );

  for (const stage of expiredSupplementaryStages) {
    try {
      await transitionSupplementaryToAdmin(stage);
    } catch (err) {
      console.error(`[Stage Transitions] Error transitioning supplementary stage ${stage.id}:`, err);
    }
  }
}

async function transitionInitialToAdmin(stage: typeof stages.$inferSelect): Promise<void> {
  console.log(`[Stage Transitions] Transitioning initial stage ${stage.id} → admin`);

  // Mark initial stage as completed
  await db
    .update(stages)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(stages.id, stage.id));

  // Find next admin stage (order = 1, same recruitment)
  const [nextStage] = await db
    .select()
    .from(stages)
    .where(
      and(
        eq(stages.recruitmentId, stage.recruitmentId),
        eq(stages.type, "admin"),
        eq(stages.status, "pending")
      )
    )
    .orderBy(stages.order)
    .limit(1);

  if (nextStage) {
    await db
      .update(stages)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(stages.id, nextStage.id));

    // Enroll completed registrations in the admin stage
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

    if (completedRegistrations.length > 0) {
      const enrollmentValues = completedRegistrations.map((r) => ({
        stageId: nextStage.id,
        registrationId: r.id,
      }));

      // Batch insert enrollments (ignore duplicates)
      for (const val of enrollmentValues) {
        await db
          .insert(stageEnrollments)
          .values(val)
          .onConflictDoNothing();
      }
    }

    await logAuditEvent({
      actorType: "system",
      actorLabel: "System",
      action: ACTIONS.STAGE_TRANSITIONED,
      resourceType: "stage",
      resourceId: nextStage.id,
      recruitmentId: stage.recruitmentId,
      details: {
        from: stage.id,
        fromType: "initial",
        to: nextStage.id,
        toType: "admin",
        enrolledCount: completedRegistrations.length,
      },
    });

    // Send emails to all enrolled students
    const enrolledStudents = await db
      .select({
        email: users.email,
        fullName: users.fullName,
      })
      .from(registrations)
      .innerJoin(users, eq(registrations.studentId, users.id))
      .innerJoin(slots, eq(registrations.slotId, slots.id))
      .where(
        and(
          eq(slots.recruitmentId, stage.recruitmentId),
          eq(registrations.registrationCompleted, true)
        )
      );

    for (const student of enrolledStudents) {
      await sendInitialStageClosedEmail({
        email: student.email,
        fullName: student.fullName,
        recruitmentName: stage.name || "Recruitment",
        adminStageEndDate: nextStage.endDate,
      });
    }
  }
}

async function transitionSupplementaryToAdmin(stage: typeof stages.$inferSelect): Promise<void> {
  console.log(`[Stage Transitions] Transitioning supplementary stage ${stage.id} → admin`);

  // Mark supplementary stage as completed
  await db
    .update(stages)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(stages.id, stage.id));

  // Find next admin stage
  const [nextStage] = await db
    .select()
    .from(stages)
    .where(
      and(
        eq(stages.recruitmentId, stage.recruitmentId),
        eq(stages.order, stage.order + 1)
      )
    )
    .limit(1);

  if (nextStage && nextStage.type === "admin") {
    await db
      .update(stages)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(stages.id, nextStage.id));

    await logAuditEvent({
      actorType: "system",
      actorLabel: "System",
      action: ACTIONS.STAGE_TRANSITIONED,
      resourceType: "stage",
      resourceId: nextStage.id,
      recruitmentId: stage.recruitmentId,
      details: {
        from: stage.id,
        fromType: "supplementary",
        to: nextStage.id,
        toType: "admin",
      },
    });
  }
}
