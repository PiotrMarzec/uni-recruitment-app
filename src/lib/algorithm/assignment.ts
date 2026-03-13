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
import { eq, and, desc, lt, inArray, isNotNull } from "drizzle-orm";
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

export interface ConflictStudent {
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

export interface ConflictInfo {
  destinationId: string;
  destinationName: string;
  slotType: "bachelor" | "master" | "open";
  availableSlots: number;
  students: ConflictStudent[];
}

export interface ConflictResolution {
  destinationId: string;
  slotType: "bachelor" | "master" | "open";
  winnerIds: string[]; // registration IDs
}

export type AssignmentResult =
  | { assigned: number; unassigned: number }
  | { conflict: ConflictInfo };

export { computeScore } from "./score";
import { computeScore } from "./score";

export async function runAssignmentAlgorithm(
  stageId: string,
  conflictResolutions?: ConflictResolution[]
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
        // Find the most recently completed admin stage before the supplementary stage.
        // This is where the canonical assignment results are stored (the algorithm always
        // runs on admin stages; verification stages only optionally re-run it).
        const [prevAdminStage] = await db
          .select()
          .from(stages)
          .where(
            and(
              eq(stages.recruitmentId, stage.recruitmentId),
              eq(stages.type, "admin"),
              eq(stages.status, "completed"),
              lt(stages.order, prevStage.order)
            )
          )
          .orderBy(desc(stages.order))
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

  // 7. Sort by score DESC, then registrationCompletedAt ASC (deterministic within same score)
  studentsToAssign.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.registrationCompletedAt.getTime() - b.registrationCompletedAt.getTime();
  });

  // Build conflict resolution lookup
  const resolutionMap = new Map<string, ConflictResolution>();
  for (const r of (conflictResolutions ?? [])) {
    resolutionMap.set(`${r.destinationId}:${r.slotType}`, r);
  }

  // Helper: determine if a destination uses open-style slots
  function isOpenDest(destId: string): boolean {
    const d = allDestinations.find((x) => x.id === destId);
    if (!d) return false;
    // Pure open: only slotsAny configured. Mixed/level: has bachelor or master slots.
    return d.slotsAny > 0 && d.slotsBachelor === 0 && d.slotsMaster === 0;
  }

  // Helper: check if a student lost a conflict resolution at a destination
  function isConflictLoser(regId: string, destId: string, studentLevel: string | null): boolean {
    if (isOpenDest(destId)) {
      const res = resolutionMap.get(`${destId}:open`);
      if (res && !res.winnerIds.includes(regId)) return true;
    } else {
      const cat = levelCategory(studentLevel);
      const res = resolutionMap.get(`${destId}:${cat}`);
      if (res && !res.winnerIds.includes(regId)) return true;
    }
    return false;
  }

  // Helper: check if a student has available slots at a destination
  function hasSlotAt(cat: "bachelor" | "master", counts: SlotCounts, destId: string): boolean {
    if (isOpenDest(destId)) {
      return counts.any > 0;
    }
    return cat === "bachelor"
      ? counts.bachelor > 0 || counts.any > 0
      : counts.master > 0 || counts.any > 0;
  }

  // Helper: consume a slot at a destination
  function consumeSlot(cat: "bachelor" | "master", counts: SlotCounts, destId: string): void {
    if (isOpenDest(destId)) {
      counts.any--;
      return;
    }
    if (cat === "bachelor") {
      if (counts.bachelor > 0) counts.bachelor--;
      else counts.any--;
    } else {
      if (counts.master > 0) counts.master--;
      else counts.any--;
    }
  }

  // 8. Run assignment algorithm with group conflict detection
  const availableCounts = new Map(
    Array.from(lockedDestinationCounts.entries()).map(([k, v]) => [k, { ...v }])
  );
  const assignments: Array<{ registrationId: string; destinationId: string | null; score: number }> = [];

  // Record locked assignments
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

  // Group students by score for batch conflict detection
  const scoreGroups: StudentForAssignment[][] = [];
  {
    let currentGroup: StudentForAssignment[] = [];
    let currentScore: number | null = null;
    for (const s of studentsToAssign) {
      if (currentScore !== null && s.score !== currentScore) {
        scoreGroups.push(currentGroup);
        currentGroup = [];
      }
      currentGroup.push(s);
      currentScore = s.score;
    }
    if (currentGroup.length > 0) scoreGroups.push(currentGroup);
  }

  for (const group of scoreGroups) {
    // Compute tentative destination for each student in this score group.
    // All students see the same slot counts (before any in-group assignment).
    const tentative = new Map<string, string>(); // regId → destId

    for (const student of group) {
      const cat = levelCategory(student.level);
      for (const destId of student.destinationPreferences) {
        // Skip destinations where this student lost a conflict resolution
        if (isConflictLoser(student.registrationId, destId, student.level)) continue;

        const counts = availableCounts.get(destId);
        if (!counts) continue;

        if (hasSlotAt(cat, counts, destId)) {
          tentative.set(student.registrationId, destId);
          break;
        }
      }
    }

    // Check for oversubscription at each destination within this score group.
    // Group tentative assignments by (destination, slotType).
    const destSlotGroups = new Map<string, StudentForAssignment[]>();

    for (const [regId, destId] of tentative) {
      const student = group.find((s) => s.registrationId === regId)!;
      const slotType = isOpenDest(destId) ? "open" : levelCategory(student.level);
      const key = `${destId}:${slotType}`;
      const arr = destSlotGroups.get(key) || [];
      arr.push(student);
      destSlotGroups.set(key, arr);
    }

    for (const [key, students] of destSlotGroups) {
      const [destId, slotType] = key.split(":");
      const counts = availableCounts.get(destId)!;

      let available: number;
      if (slotType === "open") {
        available = counts.any;
      } else if (slotType === "bachelor") {
        available = counts.bachelor;
      } else {
        available = counts.master;
      }

      if (students.length > available) {
        // Check if a resolution already exists for this conflict
        const resolution = resolutionMap.get(key);
        if (!resolution) {
          // Return conflict for teacher resolution
          return {
            conflict: {
              destinationId: destId,
              destinationName: destNameMap.get(destId) ?? destId,
              slotType: slotType as "bachelor" | "master" | "open",
              availableSlots: available,
              students: students.map((s) => ({
                registrationId: s.registrationId,
                fullName: s.fullName,
                level: s.level,
                spokenLanguages: s.spokenLanguages,
                averageResult: s.averageResult,
                additionalActivities: s.additionalActivities,
                recommendationLetters: s.recommendationLetters,
                score: s.score,
                destinationPreferences: s.destinationPreferences,
                destinationNames: s.destinationPreferences.map((id) => destNameMap.get(id) ?? id),
                notes: s.notes,
              })),
            },
          };
        }
        // Resolution exists — losers were already skipped in tentative computation above.
        // The remaining students in this group are either winners or non-competitors.
      }
    }

    // No conflicts in this score group — assign all tentatively assigned students.
    // Sort within group by registration time for determinism.
    const groupSorted = [...group].sort(
      (a, b) => a.registrationCompletedAt.getTime() - b.registrationCompletedAt.getTime()
    );

    for (const student of groupSorted) {
      const destId = tentative.get(student.registrationId);
      if (destId) {
        const cat = levelCategory(student.level);
        const counts = availableCounts.get(destId)!;
        consumeSlot(cat, counts, destId);

        assignments.push({
          registrationId: student.registrationId,
          destinationId: destId,
          score: student.score,
        });

        await db
          .update(stageEnrollments)
          .set({ assignedDestinationId: destId })
          .where(
            and(
              eq(stageEnrollments.stageId, stageId),
              eq(stageEnrollments.registrationId, student.registrationId)
            )
          );
      } else {
        // No eligible destination found
        assignments.push({
          registrationId: student.registrationId,
          destinationId: null,
          score: student.score,
        });
      }
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
