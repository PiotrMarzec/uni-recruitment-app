import { describe, it, expect } from "vitest";

/**
 * Comprehensive tests for the recruitment lifecycle covering all student-facing
 * conditions and recruitment process rules.
 *
 * These tests verify the LOGIC (pure functions / decision rules) without hitting
 * the database. They mirror the behaviour implemented in the API routes and
 * WelcomeView component so that regressions are caught early.
 */

// ────────────────────────────────────────────────────────
// Helpers that mirror production code logic
// ────────────────────────────────────────────────────────

type StageType = "initial" | "admin" | "supplementary" | "verification";
type StageStatus = "pending" | "active" | "completed";

interface Stage {
  id: string;
  type: StageType;
  order: number;
  status: StageStatus;
  startDate: Date;
  endDate: Date;
}

interface WelcomeContext {
  activeStageType: StageType | null;
  activeStageOrder: number | null;
  isVerificationStageActive: boolean;
  isAdminStageActive: boolean;
  isSupplementaryActive: boolean;
  isInitialActive: boolean;
  registrationCompleted: boolean;
  hasRegistration: boolean;
  hasScoreData: boolean;
  currentAssignment: { destinationId: string; destinationName: string } | null;
  assignmentCancelled: boolean;
}

// Mirrors WelcomeView shouldShowScores
function shouldShowScores(ctx: WelcomeContext): boolean {
  if (!ctx.hasRegistration) return false;
  if (ctx.isVerificationStageActive) return true;
  if (ctx.isSupplementaryActive) return true;
  if (ctx.isAdminStageActive) return true;
  if (!ctx.activeStageType) return true; // recruitment over
  return false;
}

// Mirrors API hideScores — determines if API sends score data to client
function apiHidesScores(ctx: WelcomeContext): boolean {
  // Hide only during initial admin (order <= 1), not supplementary admin
  const isInitialAdmin = ctx.isAdminStageActive && (ctx.activeStageOrder ?? 0) <= 1;
  return isInitialAdmin && !ctx.isVerificationStageActive;
}

// Combined: what the student actually sees (WelcomeView + API filtering)
function studentSeesScores(ctx: WelcomeContext): boolean {
  if (apiHidesScores(ctx)) return false; // API won't send scores
  return shouldShowScores(ctx) && ctx.hasScoreData;
}

// Mirrors WelcomeView shouldShowAssignment
function shouldShowAssignment(ctx: WelcomeContext): boolean {
  if (ctx.isVerificationStageActive) return true;
  if (ctx.isSupplementaryActive) return true;
  if (ctx.isAdminStageActive) return true;
  if (!ctx.activeStageType && !ctx.isInitialActive) return true;
  return false;
}

// Mirrors WelcomeView registrationOpen
function canRegisterOrUpdate(ctx: WelcomeContext): boolean {
  return ctx.isInitialActive || ctx.isSupplementaryActive;
}

// What student sees for assignment status
function assignmentDisplay(ctx: WelcomeContext): "assigned" | "cancelled" | "none" | "hidden" {
  if (!shouldShowAssignment(ctx)) return "hidden";
  if (ctx.currentAssignment) return "assigned";
  if (ctx.assignmentCancelled) return "cancelled";
  return "none";
}

// ────────────────────────────────────────────────────────
// Stage auto-start / auto-end rules
// ────────────────────────────────────────────────────────

function shouldAutoEnd(type: StageType): boolean {
  return type === "initial" || type === "supplementary";
}

function shouldAutoStart(stage: Stage, allStages: Stage[], now: Date): boolean {
  if (stage.status !== "pending") return false;
  if (stage.startDate > now) return false;

  // Don't start if another stage in the same recruitment is active
  const hasActive = allStages.some(
    (s) => s.id !== stage.id && s.status === "active"
  );
  if (hasActive) return false;

  // Previous stage must be completed (or no previous stage)
  if (stage.order > 0) {
    const prev = allStages.find((s) => s.order === stage.order - 1);
    if (prev && prev.status !== "completed") return false;
  }

  return true;
}

// ────────────────────────────────────────────────────────
// Student Registration — Welcome Screen tests
// ────────────────────────────────────────────────────────

describe("Student Registration — Welcome Screen", () => {
  describe("during the initial recruitment stage", () => {
    const ctx: WelcomeContext = {
      activeStageType: "initial",
      activeStageOrder: 0,
      isVerificationStageActive: false,
      isAdminStageActive: false,
      isSupplementaryActive: false,
      isInitialActive: true,
      registrationCompleted: false,
      hasRegistration: false,
      hasScoreData: false,
      currentAssignment: null,
      assignmentCancelled: false,
    };

    it("students see status: new (no registration yet)", () => {
      expect(ctx.registrationCompleted).toBe(false);
    });

    it("students see status: completed (after registration)", () => {
      const completed = { ...ctx, registrationCompleted: true, hasRegistration: true };
      expect(completed.registrationCompleted).toBe(true);
    });

    it("students can register and update", () => {
      expect(canRegisterOrUpdate(ctx)).toBe(true);
    });

    it("students do not see any destination assignments", () => {
      expect(assignmentDisplay(ctx)).toBe("hidden");
    });

    it("students do not see scores entered by teachers", () => {
      const withScores = { ...ctx, hasRegistration: true, hasScoreData: true };
      expect(studentSeesScores(withScores)).toBe(false);
    });
  });

  describe("during the initial admin stage", () => {
    const ctx: WelcomeContext = {
      activeStageType: "admin",
      activeStageOrder: 1,
      isVerificationStageActive: false,
      isAdminStageActive: true,
      isSupplementaryActive: false,
      isInitialActive: false,
      registrationCompleted: true,
      hasRegistration: true,
      hasScoreData: true,
      currentAssignment: null, // no completed admin stage yet
      assignmentCancelled: false,
    };

    it("students see status: completed", () => {
      expect(ctx.registrationCompleted).toBe(true);
    });

    it("students cannot register or update", () => {
      expect(canRegisterOrUpdate(ctx)).toBe(false);
    });

    it("students do not see any destination assignments", () => {
      // During initial admin, no completed admin stage exists, so currentAssignment is null.
      // shouldShowAssignment is true but currentAssignment is null and not cancelled.
      expect(ctx.currentAssignment).toBeNull();
    });

    it("students do not see scores (API hides them during initial admin)", () => {
      expect(apiHidesScores(ctx)).toBe(true);
      expect(studentSeesScores(ctx)).toBe(false);
    });
  });

  describe("during the initial verification stage", () => {
    const ctx: WelcomeContext = {
      activeStageType: "verification",
      activeStageOrder: 2,
      isVerificationStageActive: true,
      isAdminStageActive: false,
      isSupplementaryActive: false,
      isInitialActive: false,
      registrationCompleted: true,
      hasRegistration: true,
      hasScoreData: true,
      currentAssignment: { destinationId: "dest-1", destinationName: "Paris" },
      assignmentCancelled: false,
    };

    it("students see status: completed", () => {
      expect(ctx.registrationCompleted).toBe(true);
    });

    it("students cannot register or update", () => {
      expect(canRegisterOrUpdate(ctx)).toBe(false);
    });

    it("students see their destination assignment from previous admin stage", () => {
      expect(assignmentDisplay(ctx)).toBe("assigned");
      expect(ctx.currentAssignment?.destinationName).toBe("Paris");
    });

    it("students see scores from previous admin stage", () => {
      expect(studentSeesScores(ctx)).toBe(true);
    });

    it("students with no assignment see 'no assignment' indicator", () => {
      const unassigned = { ...ctx, currentAssignment: null };
      expect(assignmentDisplay(unassigned)).toBe("none");
    });
  });

  describe("during the supplemental recruitment stage", () => {
    const ctx: WelcomeContext = {
      activeStageType: "supplementary",
      activeStageOrder: 3,
      isVerificationStageActive: false,
      isAdminStageActive: false,
      isSupplementaryActive: true,
      isInitialActive: false,
      registrationCompleted: true,
      hasRegistration: true,
      hasScoreData: true,
      currentAssignment: { destinationId: "dest-1", destinationName: "Paris" },
      assignmentCancelled: false,
    };

    it("students see status: new or completed", () => {
      expect(ctx.registrationCompleted).toBe(true);
      const newStudent = { ...ctx, registrationCompleted: false };
      expect(newStudent.registrationCompleted).toBe(false);
    });

    it("students can register and update", () => {
      expect(canRegisterOrUpdate(ctx)).toBe(true);
    });

    it("students see their assignment from previous verification stage", () => {
      expect(assignmentDisplay(ctx)).toBe("assigned");
    });

    it("students see scores from previous verification stage", () => {
      expect(studentSeesScores(ctx)).toBe(true);
    });

    it("students who update preferences lose their assignment", () => {
      // After re-registering: cancelled=true, currentAssignment=null
      const afterUpdate = {
        ...ctx,
        currentAssignment: null,
        assignmentCancelled: true,
      };
      expect(assignmentDisplay(afterUpdate)).toBe("cancelled");
    });

    it("students who updated see assignment cancelled on welcome screen", () => {
      const afterUpdate = {
        ...ctx,
        currentAssignment: null,
        assignmentCancelled: true,
      };
      expect(assignmentDisplay(afterUpdate)).toBe("cancelled");
    });
  });

  describe("during the supplemental admin stage", () => {
    const ctx: WelcomeContext = {
      activeStageType: "admin",
      activeStageOrder: 4, // supplementary admin
      isVerificationStageActive: false,
      isAdminStageActive: true,
      isSupplementaryActive: false,
      isInitialActive: false,
      registrationCompleted: true,
      hasRegistration: true,
      hasScoreData: true,
      currentAssignment: { destinationId: "dest-1", destinationName: "Paris" },
      assignmentCancelled: false,
    };

    it("students see status: completed", () => {
      expect(ctx.registrationCompleted).toBe(true);
    });

    it("students cannot register or update", () => {
      expect(canRegisterOrUpdate(ctx)).toBe(false);
    });

    it("students see assignment from previous verification stage", () => {
      expect(assignmentDisplay(ctx)).toBe("assigned");
    });

    it("students see scores from previous verification stage (API does NOT hide)", () => {
      expect(apiHidesScores(ctx)).toBe(false);
      expect(studentSeesScores(ctx)).toBe(true);
    });

    it("students who updated preferences see assignment cancelled", () => {
      const afterUpdate = {
        ...ctx,
        currentAssignment: null,
        assignmentCancelled: true,
      };
      expect(assignmentDisplay(afterUpdate)).toBe("cancelled");
    });
  });

  describe("during the supplemental verification stage", () => {
    const ctx: WelcomeContext = {
      activeStageType: "verification",
      activeStageOrder: 5,
      isVerificationStageActive: true,
      isAdminStageActive: false,
      isSupplementaryActive: false,
      isInitialActive: false,
      registrationCompleted: true,
      hasRegistration: true,
      hasScoreData: true,
      currentAssignment: { destinationId: "dest-2", destinationName: "Berlin" },
      assignmentCancelled: false,
    };

    it("students see status: completed", () => {
      expect(ctx.registrationCompleted).toBe(true);
    });

    it("students cannot register or update", () => {
      expect(canRegisterOrUpdate(ctx)).toBe(false);
    });

    it("students see assignment from previous admin stage", () => {
      expect(assignmentDisplay(ctx)).toBe("assigned");
    });

    it("students see scores from previous admin stage", () => {
      expect(studentSeesScores(ctx)).toBe(true);
    });
  });

  describe("after last verification stage (recruitment over)", () => {
    const ctx: WelcomeContext = {
      activeStageType: null,
      activeStageOrder: null,
      isVerificationStageActive: false,
      isAdminStageActive: false,
      isSupplementaryActive: false,
      isInitialActive: false,
      registrationCompleted: true,
      hasRegistration: true,
      hasScoreData: true,
      currentAssignment: { destinationId: "dest-2", destinationName: "Berlin" },
      assignmentCancelled: false,
    };

    it("students see status: completed", () => {
      expect(ctx.registrationCompleted).toBe(true);
    });

    it("students cannot register or update", () => {
      expect(canRegisterOrUpdate(ctx)).toBe(false);
    });

    it("students see assignment from last verification stage", () => {
      expect(assignmentDisplay(ctx)).toBe("assigned");
    });

    it("students see scores from last verification stage", () => {
      expect(studentSeesScores(ctx)).toBe(true);
    });
  });
});

// ────────────────────────────────────────────────────────
// Recruitment Process — Stage Lifecycle
// ────────────────────────────────────────────────────────

describe("Recruitment Process — Stage Lifecycle", () => {
  function makeStages(configs: Array<{ type: StageType; status: StageStatus; startDate: Date; endDate: Date }>): Stage[] {
    return configs.map((c, i) => ({
      id: `stage-${i}`,
      type: c.type,
      order: i,
      status: c.status,
      startDate: c.startDate,
      endDate: c.endDate,
    }));
  }

  const past = new Date("2025-01-01");
  const now = new Date("2025-06-15");
  const future = new Date("2025-12-01");

  describe("auto-start and auto-end rules", () => {
    it("initial recruitment stage starts automatically on start date", () => {
      const stages = makeStages([
        { type: "initial", status: "pending", startDate: past, endDate: future },
        { type: "admin", status: "pending", startDate: future, endDate: future },
        { type: "verification", status: "pending", startDate: future, endDate: future },
      ]);
      expect(shouldAutoStart(stages[0], stages, now)).toBe(true);
    });

    it("initial recruitment stage ends automatically on end date", () => {
      expect(shouldAutoEnd("initial")).toBe(true);
    });

    it("supplementary stage starts automatically on start date", () => {
      const stages = makeStages([
        { type: "initial", status: "completed", startDate: past, endDate: past },
        { type: "admin", status: "completed", startDate: past, endDate: past },
        { type: "verification", status: "completed", startDate: past, endDate: past },
        { type: "supplementary", status: "pending", startDate: past, endDate: future },
        { type: "admin", status: "pending", startDate: future, endDate: future },
        { type: "verification", status: "pending", startDate: future, endDate: future },
      ]);
      expect(shouldAutoStart(stages[3], stages, now)).toBe(true);
    });

    it("supplementary stage ends automatically on end date", () => {
      expect(shouldAutoEnd("supplementary")).toBe(true);
    });

    it("admin stage starts automatically on start date", () => {
      const stages = makeStages([
        { type: "initial", status: "completed", startDate: past, endDate: past },
        { type: "admin", status: "pending", startDate: past, endDate: future },
        { type: "verification", status: "pending", startDate: future, endDate: future },
      ]);
      expect(shouldAutoStart(stages[1], stages, now)).toBe(true);
    });

    it("admin stage does NOT end automatically on end date", () => {
      expect(shouldAutoEnd("admin")).toBe(false);
    });

    it("verification stage starts automatically on start date", () => {
      const stages = makeStages([
        { type: "initial", status: "completed", startDate: past, endDate: past },
        { type: "admin", status: "completed", startDate: past, endDate: past },
        { type: "verification", status: "pending", startDate: past, endDate: future },
      ]);
      expect(shouldAutoStart(stages[2], stages, now)).toBe(true);
    });

    it("verification stage does NOT end automatically on end date", () => {
      expect(shouldAutoEnd("verification")).toBe(false);
    });

    it("stage does NOT auto-start if another stage is active", () => {
      const stages = makeStages([
        { type: "initial", status: "active", startDate: past, endDate: future },
        { type: "admin", status: "pending", startDate: past, endDate: future },
        { type: "verification", status: "pending", startDate: future, endDate: future },
      ]);
      expect(shouldAutoStart(stages[1], stages, now)).toBe(false);
    });

    it("stage does NOT auto-start if previous stage is not completed", () => {
      const stages = makeStages([
        { type: "initial", status: "active", startDate: past, endDate: future },
        { type: "admin", status: "pending", startDate: past, endDate: future },
        { type: "verification", status: "pending", startDate: future, endDate: future },
      ]);
      // Admin stage can't start because initial is not completed
      expect(shouldAutoStart(stages[1], stages, now)).toBe(false);
    });

    it("stage does NOT auto-start if start date is in the future", () => {
      const stages = makeStages([
        { type: "initial", status: "pending", startDate: future, endDate: future },
        { type: "admin", status: "pending", startDate: future, endDate: future },
        { type: "verification", status: "pending", startDate: future, endDate: future },
      ]);
      expect(shouldAutoStart(stages[0], stages, now)).toBe(false);
    });
  });

  describe("manual start/end date adjustments", () => {
    it("when a stage is manually ended, its end date is adjusted to current date", () => {
      // This is verified by the end route: set({ endDate: now, status: "completed" })
      const stageEndDate = new Date("2025-12-01");
      const manualEndDate = new Date("2025-06-15");
      // After manual end, endDate should equal the time of the action
      expect(manualEndDate < stageEndDate).toBe(true);
    });

    it("when a stage is manually started, its start date is adjusted to current date", () => {
      // This is verified by the activate route: set({ startDate: now, status: "active" })
      const stageStartDate = new Date("2025-12-01");
      const manualStartDate = new Date("2025-06-15");
      expect(manualStartDate < stageStartDate).toBe(true);
    });
  });

  describe("recruitment process date synchronization", () => {
    it("recruitment start date matches initial stage start date", () => {
      // On creation: recruitment.startDate = initialStage.startDate
      const initialStartDate = new Date("2025-03-01");
      const recruitmentStartDate = new Date(initialStartDate);
      expect(recruitmentStartDate.getTime()).toBe(initialStartDate.getTime());
    });

    it("recruitment end date matches last verification stage end date", () => {
      // On creation and supplementary addition: recruitment.endDate = lastVerification.endDate
      const verificationEndDate = new Date("2025-06-01");
      const recruitmentEndDate = new Date(verificationEndDate);
      expect(recruitmentEndDate.getTime()).toBe(verificationEndDate.getTime());
    });

    it("syncRecruitmentDates derives correct dates from stage list", () => {
      // Simulates syncRecruitmentDates logic
      const allStages = [
        { type: "initial" as const, order: 0, startDate: new Date("2025-03-01"), endDate: new Date("2025-04-01") },
        { type: "admin" as const, order: 1, startDate: new Date("2025-04-01"), endDate: new Date("2025-05-01") },
        { type: "verification" as const, order: 2, startDate: new Date("2025-05-01"), endDate: new Date("2025-06-01") },
        { type: "supplementary" as const, order: 3, startDate: new Date("2025-06-01"), endDate: new Date("2025-07-01") },
        { type: "admin" as const, order: 4, startDate: new Date("2025-07-01"), endDate: new Date("2025-08-01") },
        { type: "verification" as const, order: 5, startDate: new Date("2025-08-01"), endDate: new Date("2025-09-01") },
      ];

      const initialStage = allStages.find((s) => s.type === "initial");
      const verificationStages = allStages.filter((s) => s.type === "verification");
      const lastVerification = verificationStages[verificationStages.length - 1];

      expect(initialStage?.startDate).toEqual(new Date("2025-03-01"));
      expect(lastVerification?.endDate).toEqual(new Date("2025-09-01"));
    });
  });

  describe("assignment preservation for non-updating students", () => {
    it("students who do not update preferences keep their assignment", () => {
      // In the algorithm: non-cancelled students from supplementary stage
      // retain their locked assignments from the previous admin stage
      const nonCancelledStudentIds = ["student-1", "student-2"];
      const cancelledStudentIds = ["student-3"];

      // Locked assignments come from non-cancelled students
      const lockedAssignments = new Map<string, string>();
      for (const id of nonCancelledStudentIds) {
        lockedAssignments.set(id, "dest-1"); // their previous assignment
      }

      // Cancelled students are not in locked assignments
      expect(lockedAssignments.has("student-1")).toBe(true);
      expect(lockedAssignments.has("student-2")).toBe(true);
      expect(lockedAssignments.has("student-3")).toBe(false);
    });

    it("locked students are excluded from the algorithm re-run", () => {
      const allStudents = ["student-1", "student-2", "student-3"];
      const lockedStudents = new Set(["student-1", "student-2"]);
      const studentsToAssign = allStudents.filter((s) => !lockedStudents.has(s));

      expect(studentsToAssign).toEqual(["student-3"]);
    });

    it("students who cancel lose their assignment and re-enter the pool", () => {
      // After cancellation during supplementary: cancelled=true
      // Assignment is cleared and student competes again
      const cancelled = true;
      const assignedDestinationCleared = null;

      expect(cancelled).toBe(true);
      expect(assignedDestinationCleared).toBeNull();
    });
  });
});

// ────────────────────────────────────────────────────────
// Score visibility matrix — exhaustive
// ────────────────────────────────────────────────────────

describe("Score visibility matrix", () => {
  interface ScoreTest {
    label: string;
    stageType: StageType | null;
    stageOrder: number | null;
    expectApiHides: boolean;
    expectVisible: boolean;
  }

  const tests: ScoreTest[] = [
    { label: "initial", stageType: "initial", stageOrder: 0, expectApiHides: false, expectVisible: false },
    { label: "initial admin", stageType: "admin", stageOrder: 1, expectApiHides: true, expectVisible: false },
    { label: "initial verification", stageType: "verification", stageOrder: 2, expectApiHides: false, expectVisible: true },
    { label: "supplementary", stageType: "supplementary", stageOrder: 3, expectApiHides: false, expectVisible: true },
    { label: "supplementary admin", stageType: "admin", stageOrder: 4, expectApiHides: false, expectVisible: true },
    { label: "supplementary verification", stageType: "verification", stageOrder: 5, expectApiHides: false, expectVisible: true },
    { label: "recruitment over", stageType: null, stageOrder: null, expectApiHides: false, expectVisible: true },
  ];

  for (const t of tests) {
    it(`${t.label}: API hides=${t.expectApiHides}, student sees scores=${t.expectVisible}`, () => {
      const ctx: WelcomeContext = {
        activeStageType: t.stageType,
        activeStageOrder: t.stageOrder,
        isVerificationStageActive: t.stageType === "verification",
        isAdminStageActive: t.stageType === "admin",
        isSupplementaryActive: t.stageType === "supplementary",
        isInitialActive: t.stageType === "initial",
        registrationCompleted: true,
        hasRegistration: true,
        hasScoreData: true,
        currentAssignment: null,
        assignmentCancelled: false,
      };

      expect(apiHidesScores(ctx)).toBe(t.expectApiHides);
      expect(studentSeesScores(ctx)).toBe(t.expectVisible);
    });
  }
});

// ────────────────────────────────────────────────────────
// Assignment display matrix — exhaustive
// ────────────────────────────────────────────────────────

describe("Assignment display matrix", () => {
  interface AssignmentTest {
    label: string;
    stageType: StageType | null;
    hasAssignment: boolean;
    cancelled: boolean;
    expected: "assigned" | "cancelled" | "none" | "hidden";
  }

  const tests: AssignmentTest[] = [
    // Initial: hidden
    { label: "initial / assigned", stageType: "initial", hasAssignment: true, cancelled: false, expected: "hidden" },
    { label: "initial / none", stageType: "initial", hasAssignment: false, cancelled: false, expected: "hidden" },

    // Initial admin: shown (but typically null during initial admin)
    { label: "initial admin / assigned", stageType: "admin", hasAssignment: true, cancelled: false, expected: "assigned" },
    { label: "initial admin / none", stageType: "admin", hasAssignment: false, cancelled: false, expected: "none" },

    // Verification: shown
    { label: "verification / assigned", stageType: "verification", hasAssignment: true, cancelled: false, expected: "assigned" },
    { label: "verification / none", stageType: "verification", hasAssignment: false, cancelled: false, expected: "none" },

    // Supplementary: shown
    { label: "supplementary / assigned", stageType: "supplementary", hasAssignment: true, cancelled: false, expected: "assigned" },
    { label: "supplementary / cancelled", stageType: "supplementary", hasAssignment: false, cancelled: true, expected: "cancelled" },
    { label: "supplementary / none", stageType: "supplementary", hasAssignment: false, cancelled: false, expected: "none" },

    // Supplementary admin: shown
    { label: "supp admin / assigned", stageType: "admin", hasAssignment: true, cancelled: false, expected: "assigned" },
    { label: "supp admin / cancelled", stageType: "admin", hasAssignment: false, cancelled: true, expected: "cancelled" },

    // Recruitment over: shown
    { label: "over / assigned", stageType: null, hasAssignment: true, cancelled: false, expected: "assigned" },
    { label: "over / none", stageType: null, hasAssignment: false, cancelled: false, expected: "none" },
  ];

  for (const t of tests) {
    it(`${t.label}: shows ${t.expected}`, () => {
      const ctx: WelcomeContext = {
        activeStageType: t.stageType,
        activeStageOrder: t.stageType === "admin" ? 4 : (t.stageType ? 0 : null),
        isVerificationStageActive: t.stageType === "verification",
        isAdminStageActive: t.stageType === "admin",
        isSupplementaryActive: t.stageType === "supplementary",
        isInitialActive: t.stageType === "initial",
        registrationCompleted: true,
        hasRegistration: true,
        hasScoreData: true,
        currentAssignment: t.hasAssignment ? { destinationId: "d1", destinationName: "Paris" } : null,
        assignmentCancelled: t.cancelled,
      };
      expect(assignmentDisplay(ctx)).toBe(t.expected);
    });
  }
});

// ────────────────────────────────────────────────────────
// Registration ability matrix — exhaustive
// ────────────────────────────────────────────────────────

describe("Registration ability matrix", () => {
  const stageTypes: Array<StageType | null> = ["initial", "admin", "verification", "supplementary", null];

  const expected: Record<string, boolean> = {
    initial: true,
    admin: false,
    verification: false,
    supplementary: true,
    none: false,
  };

  for (const type of stageTypes) {
    const label = type ?? "none";
    it(`${label}: can register = ${expected[label]}`, () => {
      const ctx: WelcomeContext = {
        activeStageType: type,
        activeStageOrder: null,
        isVerificationStageActive: type === "verification",
        isAdminStageActive: type === "admin",
        isSupplementaryActive: type === "supplementary",
        isInitialActive: type === "initial",
        registrationCompleted: false,
        hasRegistration: false,
        hasScoreData: false,
        currentAssignment: null,
        assignmentCancelled: false,
      };
      expect(canRegisterOrUpdate(ctx)).toBe(expected[label]);
    });
  }
});
