import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { recruitments, registrations, destinations, slots } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { STUDENT_LEVELS, StudentLevel } from "@/db/schema/registrations";
import { z } from "zod";
import { eq, and, count, sql } from "drizzle-orm";

function parseLevels(raw: string): StudentLevel[] {
  try {
    return JSON.parse(raw) as StudentLevel[];
  } catch {
    return [...STUDENT_LEVELS];
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [recruitment] = await db
    .select()
    .from(recruitments)
    .where(eq(recruitments.id, id))
    .limit(1);

  if (!recruitment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const eligibleLevels = parseLevels(recruitment.eligibleLevels);

  // Count completed registrations per level
  const regCounts = await db
    .select({ level: registrations.level, n: count() })
    .from(registrations)
    .innerJoin(slots, eq(slots.id, registrations.slotId))
    .where(
      and(
        eq(slots.recruitmentId, id),
        eq(registrations.registrationCompleted, true)
      )
    )
    .groupBy(registrations.level);

  const completedByLevel: Record<string, number> = {};
  for (const row of regCounts) {
    if (row.level) completedByLevel[row.level] = Number(row.n);
  }

  // Sum destination slots per category
  const destSums = await db
    .select({
      slotsBachelor: sql<number>`sum(${destinations.slotsBachelor})`,
      slotsMaster: sql<number>`sum(${destinations.slotsMaster})`,
      slotsAny: sql<number>`sum(${destinations.slotsAny})`,
    })
    .from(destinations)
    .where(eq(destinations.recruitmentId, id));

  const totalBachelorSlots = Number(destSums[0]?.slotsBachelor ?? 0) + Number(destSums[0]?.slotsAny ?? 0);
  const totalMasterSlots = Number(destSums[0]?.slotsMaster ?? 0) + Number(destSums[0]?.slotsAny ?? 0);

  const levelStats: Record<string, { completedRegistrations: number; totalSlots: number }> = {};
  for (const level of STUDENT_LEVELS) {
    const isMaster = level.startsWith("master");
    levelStats[level] = {
      completedRegistrations: completedByLevel[level] ?? 0,
      totalSlots: isMaster ? totalMasterSlots : totalBachelorSlots,
    };
  }

  return NextResponse.json({ eligibleLevels, levelStats });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [recruitment] = await db
    .select()
    .from(recruitments)
    .where(eq(recruitments.id, id))
    .limit(1);

  if (!recruitment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = z
    .object({ eligibleLevels: z.array(z.enum([...STUDENT_LEVELS] as [StudentLevel, ...StudentLevel[]])) })
    .safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const prevLevels = parseLevels(recruitment.eligibleLevels);
  const newLevels = parsed.data.eligibleLevels;

  await db
    .update(recruitments)
    .set({ eligibleLevels: JSON.stringify(newLevels), updatedAt: new Date() })
    .where(eq(recruitments.id, id));

  await logAuditEvent({
    actorType: "admin",
    actorId: admin.userId,
    actorLabel: admin.email,
    action: ACTIONS.RECRUITMENT_UPDATED,
    resourceType: "recruitment",
    resourceId: id,
    recruitmentId: id,
    details: { before: { eligibleLevels: prevLevels }, after: { eligibleLevels: newLevels } },
    ipAddress: getIpAddress(req),
  });

  return NextResponse.json({ eligibleLevels: newLevels });
}
