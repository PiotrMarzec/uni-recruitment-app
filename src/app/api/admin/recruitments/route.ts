import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { recruitments } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { z } from "zod";
import { desc } from "drizzle-orm";

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().default(""),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  maxDestinationChoices: z.number().int().min(1).default(3),
});

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allRecruitments = await db
    .select()
    .from(recruitments)
    .orderBy(desc(recruitments.createdAt));

  return NextResponse.json(allRecruitments);
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const [recruitment] = await db
    .insert(recruitments)
    .values({
      name: parsed.data.name,
      description: parsed.data.description,
      startDate: new Date(parsed.data.startDate),
      endDate: new Date(parsed.data.endDate),
      maxDestinationChoices: parsed.data.maxDestinationChoices,
    })
    .returning();

  await logAuditEvent({
    actorType: "admin",
    actorId: admin.userId,
    actorLabel: admin.email,
    action: ACTIONS.RECRUITMENT_CREATED,
    resourceType: "recruitment",
    resourceId: recruitment.id,
    recruitmentId: recruitment.id,
    details: { name: recruitment.name },
    ipAddress: getIpAddress(req),
  });

  return NextResponse.json(recruitment, { status: 201 });
}
