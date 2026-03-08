import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { slots, destinations, registrations, assignmentResults, stages, stageEnrollments } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slotId: string }> }
) {
  const { slotId } = await params;
  const { searchParams } = req.nextUrl;
  const levelParam = searchParams.get("level");
  const levelCategory = levelParam?.startsWith("master") ? "master" : levelParam ? "bachelor" : null;
  const level = levelCategory;
  const langsParam = searchParams.get("languages");
  const spokenLanguages: string[] = langsParam ? JSON.parse(langsParam) : [];

  const [slot] = await db
    .select()
    .from(slots)
    .where(eq(slots.id, slotId))
    .limit(1);

  if (!slot) {
    return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  }

  // Get all destinations for this recruitment
  const allDestinations = await db
    .select()
    .from(destinations)
    .where(eq(destinations.recruitmentId, slot.recruitmentId));

  // Count how many slots are already consumed for each destination
  // Find the active admin stage (if any) to check assigned slots
  // For now, compute available counts from assignment results in the latest approved stage

  // Find current stage to understand slot availability
  // Slot availability is computed based on actual assignments in approved stages

  // Build response with filtering
  const filtered = allDestinations
    .map((dest) => {
      const requiredLangs = JSON.parse(dest.requiredLanguages || "[]") as string[];

      // Language filter: student speaks at least one required language
      const languageMatch =
        spokenLanguages.length === 0 ||
        requiredLangs.some((lang) => spokenLanguages.includes(lang));

      if (!languageMatch) return null;

      // Slot availability for student's level
      let hasAvailableSlots = false;
      if (level === "bachelor") {
        hasAvailableSlots = dest.slotsBachelor > 0 || dest.slotsAny > 0;
      } else if (level === "master") {
        hasAvailableSlots = dest.slotsMaster > 0 || dest.slotsAny > 0;
      } else {
        hasAvailableSlots = dest.slotsBachelor > 0 || dest.slotsMaster > 0 || dest.slotsAny > 0;
      }

      if (!hasAvailableSlots) return null;

      return {
        id: dest.id,
        name: dest.name,
        description: dest.description,
        requiredLanguages: requiredLangs,
        slotsBachelor: dest.slotsBachelor,
        slotsMaster: dest.slotsMaster,
        slotsAny: dest.slotsAny,
      };
    })
    .filter(Boolean);

  return NextResponse.json(filtered);
}
