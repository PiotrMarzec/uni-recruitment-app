import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  slots,
  recruitments,
  stages,
  registrations,
  users,
  destinations,
} from "@/db/schema";
import { broadcastSlotStatusUpdate } from "@/lib/websocket/events";
import { eq, and, count } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slotId: string }> }
) {
  const { slotId } = await params;

  // Get slot with recruitment info
  const [slot] = await db
    .select({
      id: slots.id,
      number: slots.number,
      status: slots.status,
      studentId: slots.studentId,
      recruitmentId: slots.recruitmentId,
    })
    .from(slots)
    .where(eq(slots.id, slotId))
    .limit(1);

  if (!slot) {
    return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  }

  // Get recruitment
  const [recruitment] = await db
    .select()
    .from(recruitments)
    .where(eq(recruitments.id, slot.recruitmentId))
    .limit(1);

  if (!recruitment) {
    return NextResponse.json({ error: "Recruitment not found" }, { status: 404 });
  }

  // Find active initial stage
  const [initialStage] = await db
    .select()
    .from(stages)
    .where(
      and(
        eq(stages.recruitmentId, slot.recruitmentId),
        eq(stages.type, "initial")
      )
    )
    .limit(1);

  const isInitialActive = initialStage?.status === "active";

  // Mark slot as registration_started when the link is opened (only from "open")
  if (isInitialActive && slot.status === "open") {
    await db
      .update(slots)
      .set({ status: "registration_started" })
      .where(and(eq(slots.id, slotId), eq(slots.status, "open")));

    slot.status = "registration_started";

    // Broadcast updated counts to admin dashboard
    const counts = await db
      .select({ status: slots.status, n: count() })
      .from(slots)
      .where(eq(slots.recruitmentId, slot.recruitmentId))
      .groupBy(slots.status);

    const byStatus = Object.fromEntries(counts.map((r) => [r.status, Number(r.n)]));

    if (initialStage) {
      broadcastSlotStatusUpdate({
        type: "slot_status_update",
        stageId: initialStage.id,
        openSlotsCount: byStatus["open"] ?? 0,
        startedSlotsCount: byStatus["registration_started"] ?? 0,
      });
    }
  }

  // Get existing registration if any
  let registration = null;
  let student = null;

  if (slot.status === "registered" && slot.studentId) {
    const regResult = await db
      .select()
      .from(registrations)
      .where(eq(registrations.slotId, slotId))
      .limit(1);

    if (regResult.length > 0) {
      registration = {
        ...regResult[0],
        spokenLanguages: JSON.parse(regResult[0].spokenLanguages || "[]"),
        destinationPreferences: JSON.parse(regResult[0].destinationPreferences || "[]"),
      };

      const [studentResult] = await db
        .select()
        .from(users)
        .where(eq(users.id, slot.studentId))
        .limit(1);
      student = studentResult;
    }
  }

  return NextResponse.json({
    slot,
    recruitment: {
      id: recruitment.id,
      name: recruitment.name,
      description: recruitment.description,
      maxDestinationChoices: recruitment.maxDestinationChoices,
    },
    initialStage: initialStage
      ? { id: initialStage.id, status: initialStage.status, endDate: initialStage.endDate }
      : null,
    isInitialActive,
    registration,
    student,
  });
}
