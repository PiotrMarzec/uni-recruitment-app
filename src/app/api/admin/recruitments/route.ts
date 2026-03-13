import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { recruitments, stages, destinations, slots } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { STUDENT_LEVELS, StudentLevel } from "@/db/schema/registrations";
import { getStageName } from "@/lib/stage-name";
import { z } from "zod";
import { desc } from "drizzle-orm";
import type { Stage } from "@/db/schema/stages";
import type { RecruitmentStatus } from "@/db/schema/recruitments";

function computeRecruitmentStatus(
  archivedAt: Date | null,
  recruitmentStages: Stage[]
): RecruitmentStatus {
  if (archivedAt) return "archived";
  if (recruitmentStages.some((s) => s.status === "active")) return "current";
  if (recruitmentStages.some((s) => s.status === "pending")) return "upcoming";
  return "completed";
}

const stageSchema = z.object({
  description: z.string().default(""),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().default(""),
  maxDestinationChoices: z.number().int().min(1).default(3),
  eligibleLevels: z.array(z.enum([...STUDENT_LEVELS] as [StudentLevel, ...StudentLevel[]])).optional(),
  initialStage: stageSchema,
  adminStage: stageSchema,
  verificationStage: stageSchema,
});

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [allRecruitments, allStages, allDestinations, allSlots] = await Promise.all([
    db.select().from(recruitments).orderBy(desc(recruitments.createdAt)),
    db.select().from(stages),
    db.select({ recruitmentId: destinations.recruitmentId, name: destinations.name }).from(destinations),
    db.select({ recruitmentId: slots.recruitmentId, status: slots.status }).from(slots),
  ]);

  const stagesByRecruitment = new Map<string, Stage[]>();
  for (const stage of allStages) {
    const list = stagesByRecruitment.get(stage.recruitmentId) ?? [];
    list.push(stage);
    stagesByRecruitment.set(stage.recruitmentId, list);
  }

  const destinationsByRecruitment = new Map<string, string[]>();
  for (const dest of allDestinations) {
    const list = destinationsByRecruitment.get(dest.recruitmentId) ?? [];
    list.push(dest.name);
    destinationsByRecruitment.set(dest.recruitmentId, list);
  }

  const slotsByRecruitment = new Map<string, { total: number; open: number; registered: number }>();
  for (const slot of allSlots) {
    const counts = slotsByRecruitment.get(slot.recruitmentId) ?? { total: 0, open: 0, registered: 0 };
    counts.total++;
    if (slot.status === "open") counts.open++;
    else if (slot.status === "registered") counts.registered++;
    slotsByRecruitment.set(slot.recruitmentId, counts);
  }

  return NextResponse.json(
    allRecruitments.map((rec) => {
      const recStages = stagesByRecruitment.get(rec.id) ?? [];
      const activeStage = recStages.find((s) => s.status === "active") ?? null;
      const nextStage = recStages
        .filter((s) => s.status === "pending")
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())[0] ?? null;
      const slotCounts = slotsByRecruitment.get(rec.id) ?? { total: 0, open: 0, registered: 0 };
      return {
        ...rec,
        status: computeRecruitmentStatus(rec.archivedAt, recStages),
        destinationNames: destinationsByRecruitment.get(rec.id) ?? [],
        totalSlots: slotCounts.total,
        openSlots: slotCounts.open,
        registeredSlots: slotCounts.registered,
        activeStage: activeStage ? { name: activeStage.name, startDate: activeStage.startDate, endDate: activeStage.endDate, type: activeStage.type } : null,
        nextStage: nextStage ? { name: nextStage.name, startDate: nextStage.startDate, endDate: nextStage.endDate } : null,
      };
    })
  );
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

  const { initialStage: initialStageData, adminStage: adminStageData, verificationStage: verificationStageData } = parsed.data;
  const startDate = new Date(initialStageData.startDate);
  const endDate = new Date(verificationStageData.endDate);

  const { recruitment, initialStage, adminStage, verificationStage } = await db.transaction(async (tx) => {
    const eligibleLevels = parsed.data.eligibleLevels ?? [...STUDENT_LEVELS];
    const [recruitment] = await tx
      .insert(recruitments)
      .values({
        name: parsed.data.name,
        description: parsed.data.description,
        startDate,
        endDate,
        maxDestinationChoices: parsed.data.maxDestinationChoices,
        eligibleLevels: JSON.stringify(eligibleLevels),
      })
      .returning();

    const [initialStage] = await tx
      .insert(stages)
      .values({
        recruitmentId: recruitment.id,
        name: getStageName({ type: "initial", order: 0 }),
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
        name: getStageName({ type: "admin", order: 1 }),
        description: adminStageData.description,
        startDate: new Date(adminStageData.startDate),
        endDate: new Date(adminStageData.endDate),
        order: 1,
        type: "admin",
        status: "pending",
      })
      .returning();

    const [verificationStage] = await tx
      .insert(stages)
      .values({
        recruitmentId: recruitment.id,
        name: getStageName({ type: "verification", order: 2 }),
        description: verificationStageData.description,
        startDate: new Date(verificationStageData.startDate),
        endDate: new Date(verificationStageData.endDate),
        order: 2,
        type: "verification",
        status: "pending",
      })
      .returning();

    return { recruitment, initialStage, adminStage, verificationStage };
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

  return NextResponse.json({ ...recruitment, stages: [initialStage, adminStage, verificationStage] }, { status: 201 });
}
