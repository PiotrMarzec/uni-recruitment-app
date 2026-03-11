import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [target] = await db
    .select()
    .from(admins)
    .where(eq(admins.userId, id));

  if (!target) {
    return NextResponse.json({ error: "Admin not found" }, { status: 404 });
  }

  if (target.disabledAt) {
    return NextResponse.json({ error: "Already disabled" }, { status: 409 });
  }

  await db
    .update(admins)
    .set({ disabledAt: new Date() })
    .where(eq(admins.userId, id));

  await logAuditEvent({
    actorType: "admin",
    actorId: admin.userId,
    actorLabel: admin.email,
    action: ACTIONS.ADMIN_DISABLED,
    resourceType: "admin",
    resourceId: id,
    details: {},
    ipAddress: getIpAddress(req),
  });

  return NextResponse.json({ success: true });
}
