import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stages, recruitments } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { z } from "zod";
import { eq, asc } from "drizzle-orm";

const stageInputSchema = z.object({
  name: z.string().min(1).max(255),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

const createSchema = z.object({
  supplementaryStage: stageInputSchema,
  adminStage: stageInputSchema,
  description: z.string().default(""),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const allStages = await db
    .select()
    .from(stages)
    .where(eq(stages.recruitmentId, id))
    .orderBy(asc(stages.order));

  return NextResponse.json(allStages);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify recruitment exists
  const [recruitment] = await db
    .select()
    .from(recruitments)
    .where(eq(recruitments.id, id))
    .limit(1);

  if (!recruitment) {
    return NextResponse.json({ error: "Recruitment not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Validate that last existing stage is an admin stage (supplementary must follow admin)
  const existingStages = await db
    .select()
    .from(stages)
    .where(eq(stages.recruitmentId, id))
    .orderBy(asc(stages.order));

  const validationError = validateSupplementaryAddition(existingStages);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const nextOrder = existingStages.length;
  const { supplementaryStage, adminStage, description } = parsed.data;

  const [suppStage, admStage] = await db.transaction(async (tx) => {
    const [supp] = await tx
      .insert(stages)
      .values({
        recruitmentId: id,
        name: supplementaryStage.name,
        description,
        startDate: new Date(supplementaryStage.startDate),
        endDate: new Date(supplementaryStage.endDate),
        order: nextOrder,
        type: "supplementary",
        status: "pending",
      })
      .returning();

    const [adm] = await tx
      .insert(stages)
      .values({
        recruitmentId: id,
        name: adminStage.name,
        description: "",
        startDate: new Date(adminStage.startDate),
        endDate: new Date(adminStage.endDate),
        order: nextOrder + 1,
        type: "admin",
        status: "pending",
      })
      .returning();

    // Update recruitment endDate to match admin stage endDate
    await tx
      .update(recruitments)
      .set({ endDate: new Date(adminStage.endDate) })
      .where(eq(recruitments.id, id));

    return [supp, adm];
  });

  await logAuditEvent({
    actorType: "admin",
    actorId: admin.userId,
    actorLabel: admin.email,
    action: ACTIONS.STAGE_CREATED,
    resourceType: "stage",
    resourceId: suppStage.id,
    recruitmentId: id,
    details: { type: "supplementary", order: suppStage.order, pairedAdminStageId: admStage.id },
    ipAddress: getIpAddress(req),
  });

  return NextResponse.json({ supplementaryStage: suppStage, adminStage: admStage }, { status: 201 });
}

function validateSupplementaryAddition(
  existingStages: typeof stages.$inferSelect[]
): string | null {
  if (existingStages.length === 0) {
    return "Cannot add a supplementary stage before the initial and admin stages exist";
  }

  const lastStage = existingStages[existingStages.length - 1];
  if (lastStage.type !== "admin") {
    return "A supplementary stage must follow an admin stage";
  }

  return null;
}
