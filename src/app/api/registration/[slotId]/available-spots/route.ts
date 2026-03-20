import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  slots,
  stages,
  destinations,
  stageEnrollments,
  assignmentResults,
  registrations,
} from "@/db/schema";
import { eq, and, or, desc, isNotNull, inArray } from "drizzle-orm";

/**
 * Returns destinations with available (unassigned) spots for the recruitment
 * linked to the given slot. Only meaningful during an active supplementary stage.
 *
 * Available spots = total destination capacity − students with locked assignments
 * (i.e. students assigned in the most recent completed admin stage who have NOT
 * cancelled in the current supplementary stage).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slotId: string }> }
) {
  const { slotId } = await params;

  // Get slot
  const [slot] = await db
    .select({ recruitmentId: slots.recruitmentId })
    .from(slots)
    .where(eq(slots.id, slotId))
    .limit(1);

  if (!slot) {
    return NextResponse.json({ error: "Slot not found" }, { status: 404 });
  }

  // Check for active supplementary stage
  const [suppStage] = await db
    .select({ id: stages.id, order: stages.order })
    .from(stages)
    .where(
      and(
        eq(stages.recruitmentId, slot.recruitmentId),
        eq(stages.type, "supplementary"),
        eq(stages.status, "active")
      )
    )
    .limit(1);

  if (!suppStage) {
    return NextResponse.json({ destinations: [] });
  }

  // Get all destinations for this recruitment
  const allDestinations = await db
    .select({
      id: destinations.id,
      name: destinations.name,
      slotsBachelor: destinations.slotsBachelor,
      slotsMaster: destinations.slotsMaster,
      slotsAny: destinations.slotsAny,
    })
    .from(destinations)
    .where(eq(destinations.recruitmentId, slot.recruitmentId));

  if (allDestinations.length === 0) {
    return NextResponse.json({ destinations: [] });
  }

  // Find the most recent completed admin/verification stage (the one whose assignments are active)
  const [completedAdminStage] = await db
    .select({ id: stages.id })
    .from(stages)
    .where(
      and(
        eq(stages.recruitmentId, slot.recruitmentId),
        or(eq(stages.type, "admin"), eq(stages.type, "verification")),
        eq(stages.status, "completed")
      )
    )
    .orderBy(desc(stages.order))
    .limit(1);

  // Build a map of destination ID → number of locked students by level category
  const lockedCounts = new Map<
    string,
    { bachelor: number; master: number }
  >();

  if (completedAdminStage) {
    // Get approved assignment results with a destination
    const approvedResults = await db
      .select({
        registrationId: assignmentResults.registrationId,
        destinationId: assignmentResults.destinationId,
      })
      .from(assignmentResults)
      .where(
        and(
          eq(assignmentResults.stageId, completedAdminStage.id),
          eq(assignmentResults.approved, true),
          isNotNull(assignmentResults.destinationId)
        )
      );

    if (approvedResults.length > 0) {
      // Check which of these students cancelled in the current supplementary stage
      const regIds = approvedResults.map((r) => r.registrationId);

      const suppEnrollments = await db
        .select({
          registrationId: stageEnrollments.registrationId,
          cancelled: stageEnrollments.cancelled,
        })
        .from(stageEnrollments)
        .where(
          and(
            eq(stageEnrollments.stageId, suppStage.id),
            inArray(stageEnrollments.registrationId, regIds)
          )
        );

      const cancelledSet = new Set(
        suppEnrollments.filter((e) => e.cancelled).map((e) => e.registrationId)
      );

      // Get levels for the assigned registrations
      const regLevels = await db
        .select({ id: registrations.id, level: registrations.level })
        .from(registrations)
        .where(inArray(registrations.id, regIds));

      const levelMap = new Map(regLevels.map((r) => [r.id, r.level]));

      // Count locked assignments per destination by level
      for (const result of approvedResults) {
        if (!result.destinationId) continue;
        // Skip students who cancelled — their spots are freed
        if (cancelledSet.has(result.registrationId)) continue;

        const level = levelMap.get(result.registrationId);
        const cat = level?.startsWith("master") ? "master" : "bachelor";

        if (!lockedCounts.has(result.destinationId)) {
          lockedCounts.set(result.destinationId, { bachelor: 0, master: 0 });
        }
        const counts = lockedCounts.get(result.destinationId)!;
        if (cat === "bachelor") counts.bachelor++;
        else counts.master++;
      }
    }
  }

  // Compute available spots per destination
  const result = allDestinations.map((dest) => {
    const locked = lockedCounts.get(dest.id) ?? { bachelor: 0, master: 0 };

    // Consume level-specific slots first, overflow to slotsAny
    let bachelorRemaining = dest.slotsBachelor - locked.bachelor;
    let masterRemaining = dest.slotsMaster - locked.master;
    let anyRemaining = dest.slotsAny;

    // If level-specific slots went negative, the overflow consumed slotsAny
    if (bachelorRemaining < 0) {
      anyRemaining += bachelorRemaining; // subtract overflow
      bachelorRemaining = 0;
    }
    if (masterRemaining < 0) {
      anyRemaining += masterRemaining;
      masterRemaining = 0;
    }

    // Clamp
    anyRemaining = Math.max(0, anyRemaining);

    const totalAvailable = bachelorRemaining + masterRemaining + anyRemaining;

    return {
      id: dest.id,
      name: dest.name,
      availableBachelor: bachelorRemaining,
      availableMaster: masterRemaining,
      availableOpen: anyRemaining,
      totalAvailable,
    };
  });

  // Only return destinations that have at least one available spot
  const available = result.filter((d) => d.totalAvailable > 0);

  return NextResponse.json({ destinations: available });
}
