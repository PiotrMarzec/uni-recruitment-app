import { db } from "@/db";
import {
  registrations,
  stages,
  destinations,
  stageEnrollments,
  assignmentResults,
  users,
  slots,
} from "@/db/schema";
import { eq, and, inArray, isNotNull } from "drizzle-orm";
import { logAuditEvent, ACTIONS } from "@/lib/audit";

interface SlotCounts {
  bachelor: number;
  master: number;
  any: number;
}

function levelCategory(level: string | null): "bachelor" | "master" {
  if (!level) return "bachelor";
  return level.startsWith("master") ? "master" : "bachelor";
}

interface StudentForAssignment {
  registrationId: string;
  studentId: string;
  email: string;
  fullName: string;
  level: string | null;
  destinationPreferences: string[]; // ordered destination UUIDs
  averageResult: number;
  additionalActivities: number;
  recommendationLetters: number;
  score: number;
  registrationCompletedAt: Date;
}

export function computeScore(
  averageResult: string | number | null,
  additionalActivities: number | null,
  recommendationLetters: number | null
): number {
  const avg = averageResult ? parseFloat(String(averageResult)) : 0;
  const activities = additionalActivities ?? 0;
  const letters = recommendationLetters ?? 0;
  return 3 * avg + activities + letters;
}

export async function runAssignmentAlgorithm(stageId: string): Promise<{
  assigned: number;
  unassigned: number;
}> {
  // 1. Get all enrollments for this stage
  const enrollments = await db
    .select({
      registrationId: stageEnrollments.registrationId,
    })
    .from(stageEnrollments)
    .where(eq(stageEnrollments.stageId, stageId));

  if (enrollments.length === 0) {
    return { assigned: 0, unassigned: 0 };
  }

  const registrationIds = enrollments.map((e) => e.registrationId);

  // 2. Get stage info to find the recruitment
  const [stage] = await db
    .select()
    .from(stages)
    .where(eq(stages.id, stageId))
    .limit(1);

  if (!stage) throw new Error("Stage not found");

  // 3. Fetch all registrations with student data
  const regData = await db
    .select({
      id: registrations.id,
      studentId: registrations.studentId,
      level: registrations.level,
      destinationPreferences: registrations.destinationPreferences,
      averageResult: registrations.averageResult,
      additionalActivities: registrations.additionalActivities,
      recommendationLetters: registrations.recommendationLetters,
      registrationCompletedAt: registrations.registrationCompletedAt,
      email: users.email,
      fullName: users.fullName,
    })
    .from(registrations)
    .innerJoin(users, eq(registrations.studentId, users.id))
    .where(
      and(
        inArray(registrations.id, registrationIds),
        eq(registrations.registrationCompleted, true)
      )
    );

  // 4. Get all destinations for this recruitment
  const allDestinations = await db
    .select()
    .from(destinations)
    .where(eq(destinations.recruitmentId, stage.recruitmentId));

  // 5. Determine locked assignments from the previous supplementary stage (if any).
  // Students who did NOT cancel during the supplementary stage retain their approved
  // assignment from the admin stage that preceded it — they are excluded from re-run.
  const lockedAssignments = new Map<string, { destinationId: string; score: number }>();

  if (stage.order > 1) {
    const [prevStage] = await db
      .select()
      .from(stages)
      .where(
        and(
          eq(stages.recruitmentId, stage.recruitmentId),
          eq(stages.order, stage.order - 1)
        )
      )
      .limit(1);

    if (prevStage?.type === "supplementary") {
      // Non-cancelled supplementary enrollments = students keeping their placement
      const allSuppEnrollments = await db
        .select({ registrationId: stageEnrollments.registrationId, cancelled: stageEnrollments.cancelled })
        .from(stageEnrollments)
        .where(eq(stageEnrollments.stageId, prevStage.id));

      // If the supplementary stage has no enrollments at all (enrollment creation was missed),
      // treat every student in this stage as non-cancelled (guaranteed) so their previous
      // assignment is preserved — the same outcome as if no one had cancelled.
      const nonCancelledIds = allSuppEnrollments.length === 0
        ? registrationIds
        : allSuppEnrollments.filter((e) => !e.cancelled).map((e) => e.registrationId);

      if (nonCancelledIds.length > 0) {
        // Admin stage that preceded the supplementary stage holds the approved assignments
        const [prevAdminStage] = await db
          .select()
          .from(stages)
          .where(
            and(
              eq(stages.recruitmentId, stage.recruitmentId),
              eq(stages.order, prevStage.order - 1)
            )
          )
          .limit(1);

        if (prevAdminStage) {
          const prevApproved = await db
            .select({
              registrationId: assignmentResults.registrationId,
              destinationId: assignmentResults.destinationId,
              score: assignmentResults.score,
            })
            .from(assignmentResults)
            .where(
              and(
                eq(assignmentResults.stageId, prevAdminStage.id),
                eq(assignmentResults.approved, true),
                isNotNull(assignmentResults.destinationId),
                inArray(assignmentResults.registrationId, nonCancelledIds)
              )
            );

          for (const r of prevApproved) {
            if (r.destinationId) {
              lockedAssignments.set(r.registrationId, {
                destinationId: r.destinationId,
                score: parseFloat(r.score ?? "0"),
              });
            }
          }
        }
      }
    }
  }

  // Build available slot counts, starting from full capacity
  const lockedDestinationCounts = new Map<string, SlotCounts>();

  for (const dest of allDestinations) {
    lockedDestinationCounts.set(dest.id, {
      bachelor: dest.slotsBachelor,
      master: dest.slotsMaster,
      any: dest.slotsAny,
    });
  }

  // Consume slots for locked assignments
  for (const [regId, locked] of lockedAssignments) {
    const regEntry = regData.find((r) => r.id === regId);
    if (!regEntry || !regEntry.level) continue;

    const counts = lockedDestinationCounts.get(locked.destinationId);
    if (!counts) continue;

    if (levelCategory(regEntry.level) === "bachelor") {
      if (counts.bachelor > 0) counts.bachelor--;
      else if (counts.any > 0) counts.any--;
    } else {
      if (counts.master > 0) counts.master--;
      else if (counts.any > 0) counts.any--;
    }
  }

  // 6. Build list of students to assign (exclude those with locked placements)
  const studentsToAssign: StudentForAssignment[] = [];

  for (const reg of regData) {
    if (lockedAssignments.has(reg.id)) continue;
    if (!reg.level) continue;

    const prefs = JSON.parse(reg.destinationPreferences || "[]") as string[];
    const score = computeScore(
      reg.averageResult,
      reg.additionalActivities,
      reg.recommendationLetters
    );

    studentsToAssign.push({
      registrationId: reg.id,
      studentId: reg.studentId,
      email: reg.email,
      fullName: reg.fullName,
      level: reg.level,
      destinationPreferences: prefs,
      averageResult: reg.averageResult ? parseFloat(String(reg.averageResult)) : 0,
      additionalActivities: reg.additionalActivities ?? 0,
      recommendationLetters: reg.recommendationLetters ?? 0,
      score,
      registrationCompletedAt: reg.registrationCompletedAt ?? new Date(),
    });
  }

  // 7. Sort: score DESC, then registrationCompletedAt ASC (earlier = better tiebreak)
  studentsToAssign.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.registrationCompletedAt.getTime() - b.registrationCompletedAt.getTime();
  });

  // 8. Run assignment algorithm
  const availableCounts = new Map(lockedDestinationCounts);
  // Locked assignments go directly into results and get their stageEnrollment updated
  const assignments: Array<{ registrationId: string; destinationId: string | null; score: number }> = [];

  for (const [regId, locked] of lockedAssignments) {
    assignments.push({
      registrationId: regId,
      destinationId: locked.destinationId,
      score: locked.score,
    });
    await db
      .update(stageEnrollments)
      .set({ assignedDestinationId: locked.destinationId })
      .where(
        and(
          eq(stageEnrollments.stageId, stageId),
          eq(stageEnrollments.registrationId, regId)
        )
      );
  }

  for (const student of studentsToAssign) {
    let assigned = false;

    for (const destId of student.destinationPreferences) {
      const counts = availableCounts.get(destId);
      if (!counts) continue;

      const cat = levelCategory(student.level);
      const hasSlot =
        cat === "bachelor"
          ? counts.bachelor > 0 || counts.any > 0
          : counts.master > 0 || counts.any > 0;

      if (hasSlot) {
        // Assign: consume slot
        if (cat === "bachelor") {
          if (counts.bachelor > 0) counts.bachelor--;
          else counts.any--;
        } else {
          if (counts.master > 0) counts.master--;
          else counts.any--;
        }

        assignments.push({
          registrationId: student.registrationId,
          destinationId: destId,
          score: student.score,
        });

        // Update enrollment
        await db
          .update(stageEnrollments)
          .set({ assignedDestinationId: destId })
          .where(
            and(
              eq(stageEnrollments.stageId, stageId),
              eq(stageEnrollments.registrationId, student.registrationId)
            )
          );

        assigned = true;
        break;
      }
    }

    if (!assigned) {
      assignments.push({
        registrationId: student.registrationId,
        destinationId: null,
        score: student.score,
      });
    }
  }

  // 9. Save assignment results
  if (assignments.length > 0) {
    // Delete any existing results for this stage (in case of re-run)
    await db
      .delete(assignmentResults)
      .where(eq(assignmentResults.stageId, stageId));

    await db.insert(assignmentResults).values(
      assignments.map((a) => ({
        stageId,
        registrationId: a.registrationId,
        destinationId: a.destinationId ?? undefined,
        score: String(a.score),
        approved: false,
      }))
    );
  }

  const assignedCount = assignments.filter((a) => a.destinationId !== null).length;
  const unassignedCount = assignments.filter((a) => a.destinationId === null).length;

  await logAuditEvent({
    actorType: "system",
    actorLabel: "System",
    action: ACTIONS.ASSIGNMENT_COMPUTED,
    resourceType: "stage",
    resourceId: stageId,
    recruitmentId: stage.recruitmentId,
    details: {
      assigned: assignedCount,
      unassigned: unassignedCount,
      total: assignments.length,
    },
  });

  return { assigned: assignedCount, unassigned: unassignedCount };
}
