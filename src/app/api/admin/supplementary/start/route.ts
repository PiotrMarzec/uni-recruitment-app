import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  stages,
  registrations,
  stageEnrollments,
  assignmentResults,
  users,
  destinations,
  supplementaryTokens,
  slots,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { sendSupplementaryStageEmail } from "@/lib/email/send";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { nanoid } from "nanoid";

const schema = z.object({
  recruitmentId: z.string().uuid(),
  supplementaryStageId: z.string().uuid(),
  adminStageId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { recruitmentId, supplementaryStageId, adminStageId } = parsed.data;

  // Activate supplementary stage
  await db
    .update(stages)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(stages.id, supplementaryStageId));

  // Get supplementary stage for end date
  const [suppStage] = await db
    .select()
    .from(stages)
    .where(eq(stages.id, supplementaryStageId))
    .limit(1);

  // Enroll all registered students in the supplementary stage
  const completedRegistrations = await db
    .select({
      id: registrations.id,
      studentId: registrations.studentId,
    })
    .from(registrations)
    .innerJoin(slots, eq(registrations.slotId, slots.id))
    .where(
      and(
        eq(slots.recruitmentId, recruitmentId),
        eq(registrations.registrationCompleted, true)
      )
    );

  for (const reg of completedRegistrations) {
    await db
      .insert(stageEnrollments)
      .values({ stageId: supplementaryStageId, registrationId: reg.id })
      .onConflictDoNothing();
  }

  // Get the previous admin stage results to include current assignments in emails
  // Find the most recently completed admin stage
  const [prevAdminStage] = await db
    .select()
    .from(stages)
    .where(
      and(
        eq(stages.recruitmentId, recruitmentId),
        eq(stages.type, "admin"),
        eq(stages.status, "completed")
      )
    )
    .orderBy(desc(stages.order))
    .limit(1);

  // Send emails to all enrolled students
  let emailsSent = 0;
  for (const reg of completedRegistrations) {
    // Get student info
    const [student] = await db
      .select({ email: users.email, fullName: users.fullName, locale: users.locale })
      .from(users)
      .where(eq(users.id, reg.studentId))
      .limit(1);

    if (!student) continue;

    // Get current assignment (if any)
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

    // Generate supplementary token
    const token = nanoid(48);
    const expiresAt = suppStage?.endDate ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(supplementaryTokens).values({
      token,
      registrationId: reg.id,
      stageId: supplementaryStageId,
      expiresAt,
    });

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const studentLocale = student.locale || "en";
    const registrationLink = `${appUrl}/${studentLocale}/supplementary/${token}`;

    await sendSupplementaryStageEmail({
      email: student.email,
      fullName: student.fullName,
      recruitmentName: suppStage?.name || "Recruitment",
      currentDestination: currentDestinationName,
      registrationLink,
      stageEndDate: expiresAt,
      locale: studentLocale,
    });

    emailsSent++;
  }

  await logAuditEvent({
    actorType: "admin",
    actorId: admin.userId,
    actorLabel: admin.email,
    action: ACTIONS.SUPPLEMENTARY_STAGE_STARTED,
    resourceType: "stage",
    resourceId: supplementaryStageId,
    recruitmentId,
    details: { adminStageId, emailsSent },
    ipAddress: getIpAddress(req),
  });

  return NextResponse.json({ success: true, emailsSent });
}
