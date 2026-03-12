import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { recruitments, stages, slots, destinations, registrations, admins, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { z } from "zod";
import { eq, asc, inArray } from "drizzle-orm";

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  maxDestinationChoices: z.number().int().min(1).optional(),
});

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

  const [allStages, allSlots, allDestinations] = await Promise.all([
    db.select().from(stages).where(eq(stages.recruitmentId, id)).orderBy(asc(stages.order)),
    db.select().from(slots).where(eq(slots.recruitmentId, id)).orderBy(asc(slots.number)),
    db.select().from(destinations).where(eq(destinations.recruitmentId, id)),
  ]);

  return NextResponse.json({
    ...recruitment,
    stages: allStages,
    slots: allSlots,
    destinations: allDestinations,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [existing] = await db
    .select()
    .from(recruitments)
    .where(eq(recruitments.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updates: Partial<typeof existing> = {
    updatedAt: new Date(),
  };

  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.startDate !== undefined) updates.startDate = new Date(parsed.data.startDate);
  if (parsed.data.endDate !== undefined) updates.endDate = new Date(parsed.data.endDate);
  if (parsed.data.maxDestinationChoices !== undefined)
    updates.maxDestinationChoices = parsed.data.maxDestinationChoices;

  const [updated] = await db
    .update(recruitments)
    .set(updates)
    .where(eq(recruitments.id, id))
    .returning();

  await logAuditEvent({
    actorType: "admin",
    actorId: admin.userId,
    actorLabel: admin.email,
    action: ACTIONS.RECRUITMENT_UPDATED,
    resourceType: "recruitment",
    resourceId: id,
    recruitmentId: id,
    details: { before: existing, after: updated },
    ipAddress: getIpAddress(req),
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [existing] = await db
    .select()
    .from(recruitments)
    .where(eq(recruitments.id, id))
    .limit(1);

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!existing.archivedAt) {
    return NextResponse.json(
      { error: "Only archived recruitments can be deleted" },
      { status: 400 }
    );
  }

  // Collect student IDs before cascade deletion
  const affectedRegistrations = await db
    .select({ studentId: registrations.studentId })
    .from(registrations)
    .innerJoin(slots, eq(registrations.slotId, slots.id))
    .where(eq(slots.recruitmentId, id));

  const studentIds = [...new Set(affectedRegistrations.map((r) => r.studentId))];

  // Delete recruitment — cascades: stages, slots, destinations, registrations,
  // stage_enrollments, assignment_results, supplementary_tokens
  await db.delete(recruitments).where(eq(recruitments.id, id));

  // Clean up orphaned student accounts (no remaining registrations, not admins)
  if (studentIds.length > 0) {
    const [stillRegistered, adminUsers] = await Promise.all([
      db
        .select({ studentId: registrations.studentId })
        .from(registrations)
        .where(inArray(registrations.studentId, studentIds)),
      db
        .select({ userId: admins.userId })
        .from(admins)
        .where(inArray(admins.userId, studentIds)),
    ]);

    const stillRegisteredIds = new Set(stillRegistered.map((r) => r.studentId));
    const adminIds = new Set(adminUsers.map((a) => a.userId));

    const toDelete = studentIds.filter(
      (sid) => !stillRegisteredIds.has(sid) && !adminIds.has(sid)
    );

    if (toDelete.length > 0) {
      await db.delete(users).where(inArray(users.id, toDelete));
    }
  }

  await logAuditEvent({
    actorType: "admin",
    actorId: admin.userId,
    actorLabel: admin.email,
    action: ACTIONS.RECRUITMENT_DELETED,
    resourceType: "recruitment",
    resourceId: id,
    details: { name: existing.name, deletedStudentAccounts: studentIds.length },
    ipAddress: getIpAddress(req),
  });

  return NextResponse.json({ ok: true });
}
