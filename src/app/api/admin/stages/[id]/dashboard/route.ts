import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  stages,
  stageEnrollments,
  registrations,
  users,
  slots,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { eq, and, count, desc } from "drizzle-orm";

export async function GET(
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

  // Count total and open slots for this recruitment
  const allSlots = await db
    .select({ status: slots.status })
    .from(slots)
    .where(eq(slots.recruitmentId, stage.recruitmentId));

  const totalSlots = allSlots.length;
  const openSlots = allSlots.filter((s) => s.status === "open").length;
  const registeredSlots = totalSlots - openSlots;

  // Get recent registrations (completed, newest first)
  const recentRegistrations = await db
    .select({
      slotNumber: slots.number,
      studentName: users.fullName,
      studentEmail: users.email,
      completedAt: registrations.registrationCompletedAt,
    })
    .from(registrations)
    .innerJoin(users, eq(registrations.studentId, users.id))
    .innerJoin(slots, eq(registrations.slotId, slots.id))
    .where(
      and(
        eq(slots.recruitmentId, stage.recruitmentId),
        eq(registrations.registrationCompleted, true)
      )
    )
    .orderBy(desc(registrations.registrationCompletedAt))
    .limit(50);

  return NextResponse.json({
    stage,
    stats: {
      totalSlots,
      openSlots,
      registeredSlots,
    },
    recentRegistrations,
  });
}
