import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stages, registrations, slots, users, assignmentResults, destinations } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { sendSupplementaryStageEmail } from "@/lib/email/send";
import { getStudentRegistrationLink } from "@/lib/auth/hmac";
import { eq, and, desc } from "drizzle-orm";

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

  if (stage.status !== "pending") {
    return NextResponse.json({ error: "Stage is not pending" }, { status: 400 });
  }

  const now = new Date();

  await db
    .update(stages)
    .set({ startDate: now, status: "active", updatedAt: now })
    .where(eq(stages.id, id));

  await logAuditEvent({
    actorType: "admin",
    actorId: admin.userId,
    actorLabel: admin.email,
    action: ACTIONS.STAGE_TRANSITIONED,
    resourceType: "stage",
    resourceId: id,
    recruitmentId: stage.recruitmentId,
    details: { activatedManually: true },
    ipAddress: getIpAddress(req),
  });

  // Send emails to all students when a supplementary stage is activated
  if (stage.type === "supplementary") {
    // Find the most recently completed admin stage to look up current assignments
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

    const completedRegistrations = await db
      .select({
        id: registrations.id,
        studentId: registrations.studentId,
        slotId: registrations.slotId,
        studentEmail: users.email,
        studentName: users.fullName,
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

    for (const reg of completedRegistrations) {
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
        recruitmentName: stage.name || "Recruitment",
        currentDestination: currentDestinationName,
        registrationLink: getStudentRegistrationLink(reg.slotId),
        stageEndDate: stage.endDate ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
    }
  }

  return NextResponse.json({ success: true });
}
