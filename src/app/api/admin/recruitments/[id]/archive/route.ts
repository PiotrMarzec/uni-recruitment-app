import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { recruitments } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { eq } from "drizzle-orm";
import { z } from "zod";

const schema = z.object({
  action: z.enum(["archive", "unarchive"]),
});

export async function POST(
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

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  const archivedAt = parsed.data.action === "archive" ? new Date() : null;

  const [updated] = await db
    .update(recruitments)
    .set({ archivedAt, updatedAt: new Date() })
    .where(eq(recruitments.id, id))
    .returning();

  await logAuditEvent({
    actorType: "admin",
    actorId: admin.userId,
    actorLabel: admin.email,
    action: parsed.data.action === "archive" ? ACTIONS.RECRUITMENT_ARCHIVED : ACTIONS.RECRUITMENT_UNARCHIVED,
    resourceType: "recruitment",
    resourceId: id,
    recruitmentId: id,
    details: { name: existing.name },
    ipAddress: getIpAddress(req),
  });

  return NextResponse.json(updated);
}
