import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { destinations, SUPPORTED_LANGUAGES } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { z } from "zod";
import { eq, and } from "drizzle-orm";

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  slotsBachelor: z.number().int().min(0).optional(),
  slotsMaster: z.number().int().min(0).optional(),
  slotsAny: z.number().int().min(0).optional(),
  requiredLanguages: z.array(z.enum(SUPPORTED_LANGUAGES)).min(1).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; destId: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, destId } = await params;

  const [existing] = await db
    .select()
    .from(destinations)
    .where(and(eq(destinations.id, destId), eq(destinations.recruitmentId, id)))
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

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.slotsBachelor !== undefined) updates.slotsBachelor = parsed.data.slotsBachelor;
  if (parsed.data.slotsMaster !== undefined) updates.slotsMaster = parsed.data.slotsMaster;
  if (parsed.data.slotsAny !== undefined) updates.slotsAny = parsed.data.slotsAny;
  if (parsed.data.requiredLanguages !== undefined)
    updates.requiredLanguages = JSON.stringify(parsed.data.requiredLanguages);

  const [updated] = await db
    .update(destinations)
    .set(updates)
    .where(eq(destinations.id, destId))
    .returning();

  await logAuditEvent({
    actorType: "admin",
    actorId: admin.userId,
    actorLabel: admin.email,
    action: ACTIONS.DESTINATION_UPDATED,
    resourceType: "destination",
    resourceId: destId,
    recruitmentId: id,
    details: {
      before: { ...existing, requiredLanguages: JSON.parse(existing.requiredLanguages) },
      after: { ...updated, requiredLanguages: parsed.data.requiredLanguages ?? JSON.parse(existing.requiredLanguages) },
    },
    ipAddress: getIpAddress(req),
  });

  return NextResponse.json({
    ...updated,
    requiredLanguages: JSON.parse(updated.requiredLanguages),
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; destId: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, destId } = await params;

  const [existing] = await db
    .select()
    .from(destinations)
    .where(and(eq(destinations.id, destId), eq(destinations.recruitmentId, id)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(destinations).where(eq(destinations.id, destId));

  await logAuditEvent({
    actorType: "admin",
    actorId: admin.userId,
    actorLabel: admin.email,
    action: ACTIONS.DESTINATION_REMOVED,
    resourceType: "destination",
    resourceId: destId,
    recruitmentId: id,
    details: { name: existing.name },
    ipAddress: getIpAddress(req),
  });

  return NextResponse.json({ success: true });
}
