import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stages, stageEnrollments, registrations, slots, users, assignmentResults, destinations } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { eq, and, desc } from "drizzle-orm";
import { syncRecruitmentDates } from "@/lib/recruitment-dates";
import { sendInitialStageClosedEmail, sendSupplementaryStageClosedEmail, sendSupplementaryStageEmail } from "@/lib/email/send";
import { getStageName } from "@/lib/stage-name";
import { getRootT } from "@/lib/email/translations";
import { getStudentRegistrationLink } from "@/lib/auth/hmac";

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

  if (stage.status !== "active") {
    return NextResponse.json({ error: "Stage is not active" }, { status: 400 });
  }

  const now = new Date();

  // Set endDate to now and mark as completed
  await db
    .update(stages)
    .set({ endDate: now, status: "completed", updatedAt: now })
    .where(eq(stages.id, id));

  // Find the next pending stage by order
  const [nextStage] = await db
    .select()
    .from(stages)
    .where(
      and(
        eq(stages.recruitmentId, stage.recruitmentId),
        eq(stages.status, "pending")
      )
    )
    .orderBy(stages.order)
    .limit(1);

  if (nextStage && nextStage.order > stage.order) {
    await db
      .update(stages)
      .set({ startDate: now, status: "active", updatedAt: now })
      .where(eq(stages.id, nextStage.id));
  }

  // For initial/supplementary stages: enroll completed registrations and send emails
  if ((stage.type === "initial" || stage.type === "supplementary") && nextStage && nextStage.order > stage.order) {
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
        .values({ stageId: nextStage.id, registrationId: reg.id })
        .onConflictDoNothing();
    }

    if (stage.type === "initial") {
      const enrolledStudents = await db
        .select({ email: users.email, fullName: users.fullName, locale: users.locale })
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
          recruitmentName: getStageName(stage, getRootT(student.locale)),
          adminStageEndDate: nextStage.endDate,
          locale: student.locale,
        });
      }
    }

    if (stage.type === "supplementary") {
      const enrolledStudents = await db
        .select({ email: users.email, fullName: users.fullName, locale: users.locale })
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
        await sendSupplementaryStageClosedEmail({
          email: student.email,
          fullName: student.fullName,
          recruitmentName: getStageName(stage, getRootT(student.locale)),
          adminStageEndDate: nextStage.endDate,
          locale: student.locale,
        });
      }
    }
  }

  // When an admin stage ends and the next activated stage is verification,
  // enroll all students into the verification stage
  if (stage.type === "admin" && nextStage && nextStage.type === "verification" && nextStage.order > stage.order) {
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
        .values({ stageId: nextStage.id, registrationId: reg.id })
        .onConflictDoNothing();
    }
  }

  await logAuditEvent({
    actorType: "admin",
    actorId: admin.userId,
    actorLabel: admin.email,
    action: ACTIONS.STAGE_TRANSITIONED,
    resourceType: "stage",
    resourceId: id,
    recruitmentId: stage.recruitmentId,
    details: {
      endedEarly: true,
      nextStageId: nextStage?.id ?? null,
    },
    ipAddress: getIpAddress(req),
  });

  // Sync recruitment dates after changing this stage's endDate (and possibly the next stage's startDate)
  await syncRecruitmentDates(stage.recruitmentId);

  return NextResponse.json({ success: true, nextStageId: nextStage?.id ?? null });
}
