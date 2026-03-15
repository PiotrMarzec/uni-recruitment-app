import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stages } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { eq } from "drizzle-orm";
import { syncRecruitmentDates } from "@/lib/recruitment-dates";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const [stage] = await db
    .select()
    .from(stages)
    .where(eq(stages.id, id))
    .limit(1);

  if (!stage) {
    return NextResponse.json({ error: "Stage not found" }, { status: 404 });
  }

  const updates: { startDate?: Date; endDate?: Date; updatedAt: Date } = {
    updatedAt: new Date(),
  };

  if (body.startDate) {
    const parsed = new Date(body.startDate);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Invalid startDate" }, { status: 400 });
    }
    updates.startDate = parsed;
  }

  if (body.endDate) {
    const parsed = new Date(body.endDate);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Invalid endDate" }, { status: 400 });
    }
    updates.endDate = parsed;
  }

  if (!updates.startDate && !updates.endDate) {
    return NextResponse.json({ error: "No dates provided" }, { status: 400 });
  }

  await db
    .update(stages)
    .set(updates)
    .where(eq(stages.id, id));

  await syncRecruitmentDates(stage.recruitmentId);

  await logAuditEvent({
    actorType: "admin",
    actorId: admin.userId,
    actorLabel: admin.email,
    action: ACTIONS.STAGE_UPDATED,
    resourceType: "stage",
    resourceId: id,
    recruitmentId: stage.recruitmentId,
    details: {
      startDate: updates.startDate?.toISOString(),
      endDate: updates.endDate?.toISOString(),
    },
    ipAddress: getIpAddress(req),
  });

  return NextResponse.json({ success: true });
}
