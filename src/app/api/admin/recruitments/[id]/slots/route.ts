import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { slots } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { z } from "zod";
import { eq, max } from "drizzle-orm";
import { signTeacherLink, getStudentRegistrationLink, getTeacherLink } from "@/lib/auth/hmac";

const addSlotsSchema = z.object({
  count: z.number().int().min(1).max(500),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const allSlots = await db
    .select()
    .from(slots)
    .where(eq(slots.recruitmentId, id))
    .orderBy(slots.number);

  // Attach derived links
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const slotsWithLinks = allSlots.map((slot) => ({
    ...slot,
    studentRegistrationLink: getStudentRegistrationLink(slot.id),
    teacherManagementLink: getTeacherLink(slot.id),
  }));

  return NextResponse.json(slotsWithLinks);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const parsed = addSlotsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Get max current slot number
  const [maxResult] = await db
    .select({ maxNumber: max(slots.number) })
    .from(slots)
    .where(eq(slots.recruitmentId, id));

  const startNumber = (maxResult?.maxNumber ?? -1) + 1;

  const newSlots = Array.from({ length: parsed.data.count }, (_, i) => ({
    recruitmentId: id,
    number: startNumber + i,
    status: "open" as const,
  }));

  const insertedSlots = await db.insert(slots).values(newSlots).returning();

  await logAuditEvent({
    actorType: "admin",
    actorId: admin.userId,
    actorLabel: admin.email,
    action: ACTIONS.SLOT_ADDED,
    resourceType: "slot",
    resourceId: id,
    recruitmentId: id,
    details: { count: parsed.data.count, startNumber },
    ipAddress: getIpAddress(req),
  });

  return NextResponse.json(
    insertedSlots.map((slot) => ({
      ...slot,
      studentRegistrationLink: getStudentRegistrationLink(slot.id),
      teacherManagementLink: getTeacherLink(slot.id),
    })),
    { status: 201 }
  );
}
