import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  supplementaryTokens,
  registrations,
  stageEnrollments,
  stages,
  assignmentResults,
  destinations,
  users,
  slots,
} from "@/db/schema";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";

async function getTokenData(token: string) {
  const [tokenRecord] = await db
    .select()
    .from(supplementaryTokens)
    .where(eq(supplementaryTokens.token, token))
    .limit(1);

  if (!tokenRecord) {
    return { error: "Invalid token" };
  }

  if (tokenRecord.expiresAt < new Date()) {
    return { error: "Token has expired" };
  }

  // Get stage to verify it's still active
  const [stage] = await db
    .select()
    .from(stages)
    .where(eq(stages.id, tokenRecord.stageId))
    .limit(1);

  if (!stage || stage.status !== "active") {
    return { error: "Supplementary stage is not active" };
  }

  return { tokenRecord, stage };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const result = await getTokenData(token);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const { tokenRecord, stage } = result;

  // Get registration
  const [registration] = await db
    .select()
    .from(registrations)
    .where(eq(registrations.id, tokenRecord.registrationId))
    .limit(1);

  if (!registration) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }

  // Get student
  const [student] = await db
    .select()
    .from(users)
    .where(eq(users.id, registration.studentId))
    .limit(1);

  // Get enrollment for this supplementary stage
  const [enrollment] = await db
    .select()
    .from(stageEnrollments)
    .where(
      and(
        eq(stageEnrollments.stageId, stage.id),
        eq(stageEnrollments.registrationId, tokenRecord.registrationId)
      )
    )
    .limit(1);

  // Get current assignment from previous approved admin stage,
  // but only if the student hasn't cancelled (re-registered) in this supplementary stage.
  let currentDestination = null;
  const isCancelled = enrollment?.cancelled === true;

  if (!isCancelled) {
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

    if (prevAdminStage) {
      const [prevResult] = await db
        .select({
          destinationName: destinations.name,
          destinationId: assignmentResults.destinationId,
        })
        .from(assignmentResults)
        .leftJoin(destinations, eq(assignmentResults.destinationId, destinations.id))
        .where(
          and(
            eq(assignmentResults.stageId, prevAdminStage.id),
            eq(assignmentResults.registrationId, tokenRecord.registrationId),
            eq(assignmentResults.approved, true)
          )
        )
        .limit(1);

      if (prevResult?.destinationId) {
        currentDestination = prevResult;
      }
    }
  }

  return NextResponse.json({
    token,
    stage,
    registration: {
      ...registration,
      spokenLanguages: JSON.parse(registration.spokenLanguages || "[]"),
      destinationPreferences: JSON.parse(registration.destinationPreferences || "[]"),
    },
    student,
    enrollment,
    currentDestination,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const result = await getTokenData(token);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const { tokenRecord, stage } = result;

  // Cancel enrollment
  await db
    .update(stageEnrollments)
    .set({ cancelled: true })
    .where(
      and(
        eq(stageEnrollments.stageId, stage.id),
        eq(stageEnrollments.registrationId, tokenRecord.registrationId)
      )
    );

  // Get slot info for audit
  const [registration] = await db
    .select()
    .from(registrations)
    .where(eq(registrations.id, tokenRecord.registrationId))
    .limit(1);

  const [slot] = registration
    ? await db.select().from(slots).where(eq(slots.id, registration.slotId)).limit(1)
    : [];

  await logAuditEvent({
    actorType: "student",
    actorId: registration?.studentId,
    actorLabel: `Token: ${token.slice(0, 8)}...`,
    action: ACTIONS.ASSIGNMENT_CANCELLED,
    resourceType: "stage_enrollment",
    resourceId: stage.id,
    recruitmentId: stage.recruitmentId,
    details: { stageId: stage.id, registrationId: tokenRecord.registrationId },
    ipAddress: getIpAddress(req),
  });

  return NextResponse.json({ success: true });
}

const prefsSchema = z.object({
  destinationPreferences: z.array(z.string().uuid()).min(1),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const result = await getTokenData(token);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const { tokenRecord, stage } = result;

  const body = await req.json().catch(() => ({}));
  const parsed = prefsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const [existingReg] = await db
    .select()
    .from(registrations)
    .where(eq(registrations.id, tokenRecord.registrationId))
    .limit(1);

  const oldPrefs = JSON.parse(existingReg?.destinationPreferences || "[]");
  const newPrefs = parsed.data.destinationPreferences;

  await db
    .update(registrations)
    .set({
      destinationPreferences: JSON.stringify(newPrefs),
      updatedAt: new Date(),
    })
    .where(eq(registrations.id, tokenRecord.registrationId));

  await logAuditEvent({
    actorType: "student",
    actorId: existingReg?.studentId,
    actorLabel: `Token: ${token.slice(0, 8)}...`,
    action: ACTIONS.PREFERENCES_UPDATED,
    resourceType: "registration",
    resourceId: tokenRecord.registrationId,
    recruitmentId: stage.recruitmentId,
    details: { before: oldPrefs, after: newPrefs },
    ipAddress: getIpAddress(req),
  });

  return NextResponse.json({ success: true });
}
