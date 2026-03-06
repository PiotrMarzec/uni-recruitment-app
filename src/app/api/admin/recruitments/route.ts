import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { recruitments, stages } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { z } from "zod";
import { desc } from "drizzle-orm";

const stageSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().default(""),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().default(""),
  maxDestinationChoices: z.number().int().min(1).default(3),
  initialStage: stageSchema,
  adminStage: stageSchema,
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

  const { initialStage: initialStageData, adminStage: adminStageData } = parsed.data;
  const startDate = new Date(initialStageData.startDate);
  const endDate = new Date(adminStageData.endDate);

  const { recruitment, initialStage, adminStage } = await db.transaction(async (tx) => {
    const [recruitment] = await tx
      .insert(recruitments)
      .values({
        name: parsed.data.name,
        description: parsed.data.description,
        startDate,
        endDate,
        maxDestinationChoices: parsed.data.maxDestinationChoices,
      })
      .returning();

    const [initialStage] = await tx
      .insert(stages)
      .values({
        recruitmentId: recruitment.id,
        name: initialStageData.name,
        description: initialStageData.description,
        startDate: new Date(initialStageData.startDate),
        endDate: new Date(initialStageData.endDate),
        order: 0,
        type: "initial",
        status: startDate <= new Date() ? "active" : "pending",
      })
      .returning();

    const [adminStage] = await tx
      .insert(stages)
      .values({
        recruitmentId: recruitment.id,
        name: adminStageData.name,
        description: adminStageData.description,
        startDate: new Date(adminStageData.startDate),
        endDate: new Date(adminStageData.endDate),
        order: 1,
        type: "admin",
        status: "pending",
      })
      .returning();

    return { recruitment, initialStage, adminStage };
  });

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

  return NextResponse.json({ ...recruitment, stages: [initialStage, adminStage] }, { status: 201 });
}
