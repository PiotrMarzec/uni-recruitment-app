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
  spokenLanguages: string[];
  averageResult: number;
  additionalActivities: number;
  recommendationLetters: number;
  score: number;
  registrationCompletedAt: Date;
  notes: string | null;
}

export interface TieStudent {
  registrationId: string;
  fullName: string;
  level: string | null;
  spokenLanguages: string[];
  averageResult: number;
  additionalActivities: number;
  recommendationLetters: number;
  score: number;
  destinationPreferences: string[];
  destinationNames: string[];
  notes: string | null;
}

export interface TieInfo {
  /** Student who goes first by score sort (earlier registration or designated by previous tiebreaker). */
  studentA: TieStudent;
  /** Student competing with same score. */
  studentB: TieStudent;
  destinationId: string;
  destinationName: string;
  /** What happens to studentB if studentA wins the spot. */
  outcomeIfAWins: { destinationId: string | null; destinationName: string | null };
  /** What happens to studentA if studentB wins the spot. */
  outcomeIfBWins: { destinationId: string | null; destinationName: string | null };
}

export type AssignmentResult =
  | { assigned: number; unassigned: number }
  | { tie: TieInfo };

export { computeScore } from "./score";
import { computeScore } from "./score";

export async function runAssignmentAlgorithm(
  stageId: string,
  /** Registration ID of the student who wins the tiebreaker, if admin has resolved one. */
  tiebreakerWinnerId?: string
): Promise<AssignmentResult> {
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
      spokenLanguages: registrations.spokenLanguages,
      averageResult: registrations.averageResult,
      additionalActivities: registrations.additionalActivities,
      recommendationLetters: registrations.recommendationLetters,
      registrationCompletedAt: registrations.registrationCompletedAt,
      notes: registrations.notes,
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

  const destNameMap = new Map(allDestinations.map((d) => [d.id, d.name]));

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
      spokenLanguages: (() => { try { return JSON.parse(reg.spokenLanguages || "[]") as string[]; } catch { return []; } })(),
      averageResult: reg.averageResult ? parseFloat(String(reg.averageResult)) : 0,
      additionalActivities: reg.additionalActivities ?? 0,
      recommendationLetters: reg.recommendationLetters ?? 0,
      score,
      registrationCompletedAt: reg.registrationCompletedAt ?? new Date(),
      notes: reg.notes ?? null,
    });
  }

  // 7. Sort: score DESC, winner first within same-score group, then registrationCompletedAt ASC
  studentsToAssign.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (tiebreakerWinnerId) {
      if (a.registrationId === tiebreakerWinnerId) return -1;
      if (b.registrationId === tiebreakerWinnerId) return 1;
    }
    return a.registrationCompletedAt.getTime() - b.registrationCompletedAt.getTime();
  });

  // Helper: find first eligible destination for a student, skipping excludeDestId
  function findNextEligibleDest(
    student: StudentForAssignment,
    counts: Map<string, SlotCounts>,
    excludeDestId: string
  ): string | null {
    const cat = levelCategory(student.level);
    for (const dId of student.destinationPreferences) {
      if (dId === excludeDestId) continue;
      const c = counts.get(dId);
      if (!c) continue;
      if (cat === "bachelor" ? c.bachelor > 0 || c.any > 0 : c.master > 0 || c.any > 0) return dId;
    }
    return null;
  }

  // 8. Run assignment algorithm with tie detection
  const availableCounts = new Map(
    Array.from(lockedDestinationCounts.entries()).map(([k, v]) => [k, { ...v }])
  );
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

  for (let i = 0; i < studentsToAssign.length; i++) {
    const student = studentsToAssign[i];
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
        // --- Tie detection (skip if this student is the designated winner) ---
        if (student.registrationId !== tiebreakerWinnerId) {
          // Simulate consuming the slot
          const hypothetical = { ...counts };
          if (cat === "bachelor") {
            if (hypothetical.bachelor > 0) hypothetical.bachelor--;
            else hypothetical.any--;
          } else {
            if (hypothetical.master > 0) hypothetical.master--;
            else hypothetical.any--;
          }

          for (let j = i + 1; j < studentsToAssign.length; j++) {
            const other = studentsToAssign[j];
            if (other.score !== student.score) break; // sorted, no more ties in this group

            if (!other.destinationPreferences.includes(destId)) continue;

            // Would `other` lose their slot at destId after student takes one?
            const otherCat = levelCategory(other.level);
            const otherHasSlotAfter =
              otherCat === "bachelor"
                ? hypothetical.bachelor > 0 || hypothetical.any > 0
                : hypothetical.master > 0 || hypothetical.any > 0;

            if (!otherHasSlotAfter) {
              // Tie detected — build outcomes and return without saving
              const countsSnapshotForA = new Map(
                Array.from(availableCounts.entries()).map(([k, v]) => [k, { ...v }])
              );
              // If A wins: consume destId for A, then find B's next
              const cA = countsSnapshotForA.get(destId)!;
              if (cat === "bachelor") { if (cA.bachelor > 0) cA.bachelor--; else cA.any--; }
              else { if (cA.master > 0) cA.master--; else cA.any--; }
              const bNextDestId = findNextEligibleDest(other, countsSnapshotForA, destId);

              const countsSnapshotForB = new Map(
                Array.from(availableCounts.entries()).map(([k, v]) => [k, { ...v }])
              );
              // If B wins: consume destId for B (using other's category), then find A's next
              const cB = countsSnapshotForB.get(destId)!;
              const otherCatConsume = levelCategory(other.level);
              if (otherCatConsume === "bachelor") { if (cB.bachelor > 0) cB.bachelor--; else cB.any--; }
              else { if (cB.master > 0) cB.master--; else cB.any--; }
              const aNextDestId = findNextEligibleDest(student, countsSnapshotForB, destId);

              const tieInfo: TieInfo = {
                studentA: {
                  registrationId: student.registrationId,
                  fullName: student.fullName,
                  level: student.level,
                  spokenLanguages: student.spokenLanguages,
                  averageResult: student.averageResult,
                  additionalActivities: student.additionalActivities,
                  recommendationLetters: student.recommendationLetters,
                  score: student.score,
                  destinationPreferences: student.destinationPreferences,
                  destinationNames: student.destinationPreferences.map((id) => destNameMap.get(id) ?? id),
                  notes: student.notes,
                },
                studentB: {
                  registrationId: other.registrationId,
                  fullName: other.fullName,
                  level: other.level,
                  spokenLanguages: other.spokenLanguages,
                  averageResult: other.averageResult,
                  additionalActivities: other.additionalActivities,
                  recommendationLetters: other.recommendationLetters,
                  score: other.score,
                  destinationPreferences: other.destinationPreferences,
                  destinationNames: other.destinationPreferences.map((id) => destNameMap.get(id) ?? id),
                  notes: other.notes,
                },
                destinationId: destId,
                destinationName: destNameMap.get(destId) ?? destId,
                outcomeIfAWins: {
                  destinationId: bNextDestId,
                  destinationName: bNextDestId ? (destNameMap.get(bNextDestId) ?? bNextDestId) : null,
                },
                outcomeIfBWins: {
                  destinationId: aNextDestId,
                  destinationName: aNextDestId ? (destNameMap.get(aNextDestId) ?? aNextDestId) : null,
                },
              };

              return { tie: tieInfo };
            }
          }
        }
        // --- End tie detection ---

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
