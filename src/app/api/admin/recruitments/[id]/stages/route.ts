import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stages, recruitments } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { z } from "zod";
import { eq, asc, max } from "drizzle-orm";

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().default(""),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  type: z.enum(["initial", "admin", "supplementary"]),
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

  // Validate stage ordering rules
  const existingStages = await db
    .select()
    .from(stages)
    .where(eq(stages.recruitmentId, id))
    .orderBy(asc(stages.order));

  const validationError = validateStageAddition(existingStages, parsed.data.type);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  // Calculate next order
  const nextOrder = existingStages.length;

  // Determine initial status
  // Initial stage: starts pending (transitions when recruitment starts)
  // For now, all new stages are pending
  const [stage] = await db
    .insert(stages)
    .values({
      recruitmentId: id,
      name: parsed.data.name,
      description: parsed.data.description,
      startDate: new Date(parsed.data.startDate),
      endDate: new Date(parsed.data.endDate),
      order: nextOrder,
      type: parsed.data.type,
      status: "pending",
    })
    .returning();

  // If this is the first stage (initial) and start_date is in the past, auto-activate
  if (stage.type === "initial" && stage.startDate <= new Date()) {
    await db
      .update(stages)
      .set({ status: "active" })
      .where(eq(stages.id, stage.id));
    stage.status = "active";
  }

  await logAuditEvent({
    actorType: "admin",
    actorId: admin.userId,
    actorLabel: admin.email,
    action: ACTIONS.STAGE_CREATED,
    resourceType: "stage",
    resourceId: stage.id,
    recruitmentId: id,
    details: { type: stage.type, order: stage.order },
    ipAddress: getIpAddress(req),
  });

  return NextResponse.json(stage, { status: 201 });
}

function validateStageAddition(
  existingStages: typeof stages.$inferSelect[],
  newType: string
): string | null {
  if (existingStages.length === 0) {
    // First stage must be initial
    if (newType !== "initial") {
      return "The first stage must be of type 'initial'";
    }
    return null;
  }

  // Already has initial stage
  const hasInitial = existingStages.some((s) => s.type === "initial");
  if (newType === "initial") {
    return "A recruitment can only have one initial stage";
  }

  // Get last stage type
  const lastStage = existingStages[existingStages.length - 1];

  if (newType === "admin") {
    // Admin can follow initial or supplementary
    if (lastStage.type !== "initial" && lastStage.type !== "supplementary") {
      return "An admin stage must follow the initial stage or a supplementary stage";
    }
    return null;
  }

  if (newType === "supplementary") {
    // Supplementary must follow admin
    if (lastStage.type !== "admin") {
      return "A supplementary stage must follow an admin stage";
    }
    return null;
  }

  return null;
}
