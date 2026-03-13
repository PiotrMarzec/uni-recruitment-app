import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { destinations, SUPPORTED_LANGUAGES } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { logAuditEvent, ACTIONS, getIpAddress } from "@/lib/audit";
import { z } from "zod";
import { eq } from "drizzle-orm";

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().default(""),
  slotsBachelor: z.number().int().min(0).default(0),
  slotsMaster: z.number().int().min(0).default(0),
  slotsAny: z.number().int().min(0).default(0),
  requiredLanguages: z
    .array(z.enum(SUPPORTED_LANGUAGES))
    .min(1, "At least one language is required"),
}).refine(
  (data) => {
    const hasLevelSlots = data.slotsBachelor > 0 || data.slotsMaster > 0;
    const hasOpenSlots = data.slotsAny > 0;
    return !(hasLevelSlots && hasOpenSlots);
  },
  { message: "Cannot have both level-specific slots (bachelor/master) and open slots" }
);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const allDestinations = await db
    .select()
    .from(destinations)
    .where(eq(destinations.recruitmentId, id));

  return NextResponse.json(
    allDestinations.map((d) => ({
      ...d,
      requiredLanguages: JSON.parse(d.requiredLanguages),
    }))
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const [destination] = await db
    .insert(destinations)
    .values({
      recruitmentId: id,
      name: parsed.data.name,
      description: parsed.data.description,
      slotsBachelor: parsed.data.slotsBachelor,
      slotsMaster: parsed.data.slotsMaster,
      slotsAny: parsed.data.slotsAny,
      requiredLanguages: JSON.stringify(parsed.data.requiredLanguages),
    })
    .returning();

  await logAuditEvent({
    actorType: "admin",
    actorId: admin.userId,
    actorLabel: admin.email,
    action: ACTIONS.DESTINATION_CREATED,
    resourceType: "destination",
    resourceId: destination.id,
    recruitmentId: id,
    details: { name: destination.name },
    ipAddress: getIpAddress(req),
  });

  return NextResponse.json(
    { ...destination, requiredLanguages: parsed.data.requiredLanguages },
    { status: 201 }
  );
}
