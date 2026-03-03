import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { slots } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { eq, and } from "drizzle-orm";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; slotId: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, slotId } = await params;

  const [slot] = await db
    .select()
    .from(slots)
    .where(and(eq(slots.id, slotId), eq(slots.recruitmentId, id)))
    .limit(1);

  if (!slot) {
    return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  }

  if (slot.status === "registered") {
    return NextResponse.json(
      { error: "Cannot delete a slot that has a registered student" },
      { status: 409 }
    );
  }

  await db.delete(slots).where(eq(slots.id, slotId));

  await logAuditEvent({
    actorType: "admin",
    actorId: admin.userId,
    actorLabel: admin.email,
    action: ACTIONS.SLOT_REMOVED,
    resourceType: "slot",
    resourceId: slotId,
    recruitmentId: id,
    details: { slotNumber: slot.number },
    ipAddress: getIpAddress(req),
  });

  return NextResponse.json({ success: true });
}
