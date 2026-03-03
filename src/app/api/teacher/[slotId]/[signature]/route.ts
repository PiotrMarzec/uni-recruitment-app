import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { slots, registrations, users } from "@/db/schema";
import { verifyTeacherSignature } from "@/lib/auth/hmac";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { z } from "zod";
import { eq } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slotId: string; signature: string }> }
) {
  const { slotId, signature } = await params;

  if (!verifyTeacherSignature(slotId, signature)) {
    return NextResponse.json({ error: "Invalid link" }, { status: 403 });
  }

  const [slot] = await db
    .select()
    .from(slots)
    .where(eq(slots.id, slotId))
    .limit(1);

  if (!slot) {
    return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  }

  let registration = null;
  let student = null;

  if (slot.status === "registered") {
    const [reg] = await db
      .select()
      .from(registrations)
      .where(eq(registrations.slotId, slotId))
      .limit(1);

    if (reg) {
      registration = {
        ...reg,
        spokenLanguages: JSON.parse(reg.spokenLanguages || "[]"),
        destinationPreferences: JSON.parse(reg.destinationPreferences || "[]"),
      };

      if (reg.studentId) {
        const [s] = await db
          .select()
          .from(users)
          .where(eq(users.id, reg.studentId))
          .limit(1);
        student = s;
      }
    }
  }

  return NextResponse.json({ slot, registration, student });
}

const updateSchema = z.object({
  fullName: z.string().min(1).max(255).optional(),
  enrollmentId: z.string().regex(/^[1-9]\d{5}$/).optional(),
  level: z.enum(["bachelor", "master"]).optional(),
  spokenLanguages: z.array(z.string()).optional(),
  destinationPreferences: z.array(z.string().uuid()).optional(),
  averageResult: z.number().min(0).max(6).nullable().optional(),
  additionalActivities: z.number().int().min(0).max(4).nullable().optional(),
  recommendationLetters: z.number().int().min(0).max(10).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slotId: string; signature: string }> }
) {
  const { slotId, signature } = await params;

  if (!verifyTeacherSignature(slotId, signature)) {
    return NextResponse.json({ error: "Invalid link" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const [slot] = await db
    .select()
    .from(slots)
    .where(eq(slots.id, slotId))
    .limit(1);

  if (!slot) {
    return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  }

  const [existingReg] = await db
    .select()
    .from(registrations)
    .where(eq(registrations.slotId, slotId))
    .limit(1);

  if (!existingReg) {
    return NextResponse.json(
      { error: "No registration found for this slot" },
      { status: 404 }
    );
  }

  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  const data = parsed.data;

  if (data.fullName !== undefined) {
    before.fullName = existingReg.studentId;
    updates.fullName = data.fullName;
    after.fullName = data.fullName;

    // Also update user's name
    if (existingReg.studentId) {
      await db
        .update(users)
        .set({ fullName: data.fullName })
        .where(eq(users.id, existingReg.studentId));
    }
  }

  if (data.enrollmentId !== undefined) {
    before.enrollmentId = existingReg.enrollmentId;
    updates.enrollmentId = data.enrollmentId;
    after.enrollmentId = data.enrollmentId;
  }

  if (data.level !== undefined) {
    before.level = existingReg.level;
    updates.level = data.level;
    after.level = data.level;
  }

  if (data.spokenLanguages !== undefined) {
    before.spokenLanguages = JSON.parse(existingReg.spokenLanguages || "[]");
    updates.spokenLanguages = JSON.stringify(data.spokenLanguages);
    after.spokenLanguages = data.spokenLanguages;
  }

  if (data.destinationPreferences !== undefined) {
    before.destinationPreferences = JSON.parse(existingReg.destinationPreferences || "[]");
    updates.destinationPreferences = JSON.stringify(data.destinationPreferences);
    after.destinationPreferences = data.destinationPreferences;
  }

  const hasScores = data.averageResult !== undefined || data.additionalActivities !== undefined || data.recommendationLetters !== undefined;
  if (data.averageResult !== undefined) {
    before.averageResult = existingReg.averageResult;
    updates.averageResult = data.averageResult !== null ? String(data.averageResult) : null;
    after.averageResult = data.averageResult;
  }
  if (data.additionalActivities !== undefined) {
    before.additionalActivities = existingReg.additionalActivities;
    updates.additionalActivities = data.additionalActivities;
    after.additionalActivities = data.additionalActivities;
  }
  if (data.recommendationLetters !== undefined) {
    before.recommendationLetters = existingReg.recommendationLetters;
    updates.recommendationLetters = data.recommendationLetters;
    after.recommendationLetters = data.recommendationLetters;
  }

  await db
    .update(registrations)
    .set(updates)
    .where(eq(registrations.id, existingReg.id));

  await logAuditEvent({
    actorType: "teacher",
    actorLabel: `Teacher via slot #${slot.number}`,
    action: hasScores ? ACTIONS.TEACHER_SCORES_ENTERED : ACTIONS.REGISTRATION_TEACHER_EDITED,
    resourceType: "registration",
    resourceId: existingReg.id,
    recruitmentId: slot.recruitmentId,
    details: { before, after, slotId, slotNumber: slot.number },
    ipAddress: getIpAddress(req),
  });

  return NextResponse.json({ success: true });
}
