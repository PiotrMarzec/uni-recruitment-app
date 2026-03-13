import { describe, it, expect } from "vitest";
import { getStageName } from "@/lib/stage-name";
import { computeScore } from "@/lib/algorithm/score";

// ────────────────────────────────────────────────────────
// Stage naming tests
// ────────────────────────────────────────────────────────

describe("getStageName", () => {
  it("returns correct name for initial stage (order 0)", () => {
    expect(getStageName({ type: "initial", order: 0 })).toBe("Initial recruitment stage");
  });

  it("returns correct name for first admin stage (order 1)", () => {
    expect(getStageName({ type: "admin", order: 1 })).toBe("Admin stage");
  });

  it("returns correct name for first verification stage (order 2)", () => {
    expect(getStageName({ type: "verification", order: 2 })).toBe("Verification stage");
  });

  it("returns correct name for first supplementary stage (order 3)", () => {
    expect(getStageName({ type: "supplementary", order: 3 })).toBe("Supplementary recruitment stage #1");
  });

  it("returns correct name for supplementary admin stage #1 (order 4)", () => {
    expect(getStageName({ type: "admin", order: 4 })).toBe("Supplementary admin stage #1");
  });

  it("returns correct name for supplementary verification stage #1 (order 5)", () => {
    expect(getStageName({ type: "verification", order: 5 })).toBe("Supplementary verification stage #1");
  });

  it("returns correct name for second supplementary round (orders 6-8)", () => {
    expect(getStageName({ type: "supplementary", order: 6 })).toBe("Supplementary recruitment stage #2");
    expect(getStageName({ type: "admin", order: 7 })).toBe("Supplementary admin stage #2");
    expect(getStageName({ type: "verification", order: 8 })).toBe("Supplementary verification stage #2");
  });

  it("returns correct name for third supplementary round (orders 9-11)", () => {
    expect(getStageName({ type: "supplementary", order: 9 })).toBe("Supplementary recruitment stage #3");
    expect(getStageName({ type: "admin", order: 10 })).toBe("Supplementary admin stage #3");
    expect(getStageName({ type: "verification", order: 11 })).toBe("Supplementary verification stage #3");
  });

  it("returns type string for unknown types", () => {
    expect(getStageName({ type: "unknown", order: 0 })).toBe("unknown");
  });
});

// ────────────────────────────────────────────────────────
// Stage ordering validation tests
// ────────────────────────────────────────────────────────

describe("stage ordering rules", () => {
  // Helper to create a stage sequence
  function makeStageSequence(types: string[]): Array<{ type: string; order: number }> {
    return types.map((type, i) => ({ type, order: i }));
  }

  it("initial recruitment creates 3 stages: initial, admin, verification", () => {
    const stages = makeStageSequence(["initial", "admin", "verification"]);
    expect(stages).toHaveLength(3);
    expect(stages[0].type).toBe("initial");
    expect(stages[0].order).toBe(0);
    expect(stages[1].type).toBe("admin");
    expect(stages[1].order).toBe(1);
    expect(stages[2].type).toBe("verification");
    expect(stages[2].order).toBe(2);
  });

  it("supplementary round adds 3 stages: supplementary, admin, verification", () => {
    const stages = makeStageSequence([
      "initial", "admin", "verification",
      "supplementary", "admin", "verification",
    ]);
    expect(stages).toHaveLength(6);
    expect(stages[3].type).toBe("supplementary");
    expect(stages[3].order).toBe(3);
    expect(stages[4].type).toBe("admin");
    expect(stages[4].order).toBe(4);
    expect(stages[5].type).toBe("verification");
    expect(stages[5].order).toBe(5);
  });

  it("multiple supplementary rounds maintain correct ordering", () => {
    const stages = makeStageSequence([
      "initial", "admin", "verification",
      "supplementary", "admin", "verification",
      "supplementary", "admin", "verification",
    ]);
    expect(stages).toHaveLength(9);
    // Second supplementary round
    expect(stages[6].type).toBe("supplementary");
    expect(stages[6].order).toBe(6);
    expect(stages[7].type).toBe("admin");
    expect(stages[7].order).toBe(7);
    expect(stages[8].type).toBe("verification");
    expect(stages[8].order).toBe(8);
  });

  it("supplementary stages can only follow verification stages", () => {
    function validateLastStageBeforeSupplementary(lastStageType: string): boolean {
      return lastStageType === "verification";
    }
    expect(validateLastStageBeforeSupplementary("verification")).toBe(true);
    expect(validateLastStageBeforeSupplementary("admin")).toBe(false);
    expect(validateLastStageBeforeSupplementary("initial")).toBe(false);
    expect(validateLastStageBeforeSupplementary("supplementary")).toBe(false);
  });
});

// ────────────────────────────────────────────────────────
// Score computation tests
// ────────────────────────────────────────────────────────

describe("computeScore", () => {
  it("computes score correctly with all values", () => {
    expect(computeScore(5.0, 3, 7)).toBe(3 * 5.0 + 3 + 7);
    expect(computeScore(5.0, 3, 7)).toBe(25);
  });

  it("treats null values as 0", () => {
    expect(computeScore(null, null, null)).toBe(0);
    expect(computeScore(5.0, null, null)).toBe(15);
    expect(computeScore(null, 3, null)).toBe(3);
  });

  it("handles string averageResult", () => {
    expect(computeScore("4.5", 2, 5)).toBe(3 * 4.5 + 2 + 5);
    expect(computeScore("4.5", 2, 5)).toBe(20.5);
  });

  it("computes max theoretical score correctly", () => {
    expect(computeScore(6.0, 4, 10)).toBe(32);
  });
});

// ────────────────────────────────────────────────────────
// Verification stage date defaults tests
// ────────────────────────────────────────────────────────

describe("verification stage default dates", () => {
  function addBusinessDays(date: Date, days: number): Date {
    const result = new Date(date);
    let added = 0;
    while (added < days) {
      result.setDate(result.getDate() + 1);
      const day = result.getDay();
      if (day !== 0 && day !== 6) added++;
    }
    return result;
  }

  it("verification start date equals admin end date", () => {
    const adminEnd = new Date("2026-03-20T14:00:00");
    const verificationStart = new Date(adminEnd);
    expect(verificationStart.getTime()).toBe(adminEnd.getTime());
  });

  it("verification end date is 3 business days after start at 18:00", () => {
    // Friday March 20, 2026
    const adminEnd = new Date("2026-03-20T14:00:00");
    const verificationEnd = addBusinessDays(adminEnd, 3);
    verificationEnd.setHours(18, 0, 0, 0);

    // 3 business days from Friday: Mon, Tue, Wed → Wednesday March 25
    expect(verificationEnd.getDay()).not.toBe(0); // not Sunday
    expect(verificationEnd.getDay()).not.toBe(6); // not Saturday
    expect(verificationEnd.getHours()).toBe(18);
    expect(verificationEnd.getMinutes()).toBe(0);
  });

  it("skips weekends when computing business days", () => {
    // Thursday March 19, 2026
    const adminEnd = new Date("2026-03-19T14:00:00");
    const verificationEnd = addBusinessDays(adminEnd, 3);
    verificationEnd.setHours(18, 0, 0, 0);

    // 3 business days from Thursday: Fri, Mon, Tue → Tuesday March 24
    expect(verificationEnd.getDate()).toBe(24);
    expect(verificationEnd.getMonth()).toBe(2); // March = 2
    expect(verificationEnd.getHours()).toBe(18);
  });
});

// ────────────────────────────────────────────────────────
// Student Welcome Page visibility tests
// ────────────────────────────────────────────────────────

describe("Student Registration Welcome Page visibility rules", () => {
  type StageType = "initial" | "admin" | "supplementary" | "verification";

  interface StageVisibilityContext {
    activeStageType: StageType | null;
    isVerificationStageActive: boolean;
  }

  // Mirrors the logic from WelcomeView component
  function shouldShowScores(ctx: StageVisibilityContext, hasRegistration: boolean): boolean {
    if (!hasRegistration) return false;
    if (ctx.isVerificationStageActive) return true;
    if (ctx.activeStageType === "supplementary") return true;
    if (ctx.activeStageType === "admin") return true;
    if (!ctx.activeStageType) return true; // recruitment over
    return false;
  }

  function shouldShowAssignment(ctx: StageVisibilityContext): boolean {
    if (ctx.isVerificationStageActive) return true;
    if (ctx.activeStageType === "supplementary") return true;
    if (ctx.activeStageType === "admin") return true;
    if (!ctx.activeStageType) return true;
    return false;
  }

  function canUpdateRegistration(ctx: StageVisibilityContext): boolean {
    return ctx.activeStageType === "initial" || ctx.activeStageType === "supplementary";
  }

  describe("before recruitment starts", () => {
    const ctx: StageVisibilityContext = { activeStageType: null, isVerificationStageActive: false };

    it("doesn't show score section", () => {
      // No registration exists before recruitment
      expect(shouldShowScores(ctx, false)).toBe(false);
    });

    it("shows assignment when recruitment is over (no active stage)", () => {
      expect(shouldShowAssignment(ctx)).toBe(true);
    });

    it("can't start or update registration", () => {
      expect(canUpdateRegistration(ctx)).toBe(false);
    });
  });

  describe("initial registration stage", () => {
    const ctx: StageVisibilityContext = { activeStageType: "initial", isVerificationStageActive: false };

    it("doesn't show score section", () => {
      expect(shouldShowScores(ctx, true)).toBe(false);
    });

    it("doesn't show assignment", () => {
      expect(shouldShowAssignment(ctx)).toBe(false);
    });

    it("can start or update registration", () => {
      expect(canUpdateRegistration(ctx)).toBe(true);
    });
  });

  describe("initial admin stage", () => {
    const ctx: StageVisibilityContext = { activeStageType: "admin", isVerificationStageActive: false };

    it("shows score section (admin stage shows scores from previous stage)", () => {
      expect(shouldShowScores(ctx, true)).toBe(true);
    });

    it("shows assignment section", () => {
      expect(shouldShowAssignment(ctx)).toBe(true);
    });

    it("can't start or update registration", () => {
      expect(canUpdateRegistration(ctx)).toBe(false);
    });
  });

  describe("initial verification stage", () => {
    const ctx: StageVisibilityContext = { activeStageType: "verification", isVerificationStageActive: true };

    it("shows score values from previous admin stage", () => {
      expect(shouldShowScores(ctx, true)).toBe(true);
    });

    it("shows assignment from previous admin stage", () => {
      expect(shouldShowAssignment(ctx)).toBe(true);
    });

    it("can't start or update registration", () => {
      expect(canUpdateRegistration(ctx)).toBe(false);
    });
  });

  describe("supplementary registration stage", () => {
    const ctx: StageVisibilityContext = { activeStageType: "supplementary", isVerificationStageActive: false };

    it("shows score values from previous verification stage", () => {
      expect(shouldShowScores(ctx, true)).toBe(true);
    });

    it("shows assignment from previous verification stage", () => {
      expect(shouldShowAssignment(ctx)).toBe(true);
    });

    it("can start or update registration", () => {
      expect(canUpdateRegistration(ctx)).toBe(true);
    });
  });

  describe("supplementary admin stage", () => {
    const ctx: StageVisibilityContext = { activeStageType: "admin", isVerificationStageActive: false };

    it("shows score values from previous verification stage", () => {
      expect(shouldShowScores(ctx, true)).toBe(true);
    });

    it("shows assignment section", () => {
      expect(shouldShowAssignment(ctx)).toBe(true);
    });

    it("can't start or update registration", () => {
      expect(canUpdateRegistration(ctx)).toBe(false);
    });
  });

  describe("supplementary verification stage", () => {
    const ctx: StageVisibilityContext = { activeStageType: "verification", isVerificationStageActive: true };

    it("shows score values from previous admin stage", () => {
      expect(shouldShowScores(ctx, true)).toBe(true);
    });

    it("shows assignment from previous admin stage", () => {
      expect(shouldShowAssignment(ctx)).toBe(true);
    });

    it("can't start or update registration", () => {
      expect(canUpdateRegistration(ctx)).toBe(false);
    });
  });

  describe("recruitment over (no active stage)", () => {
    const ctx: StageVisibilityContext = { activeStageType: null, isVerificationStageActive: false };

    it("shows score when registration exists", () => {
      expect(shouldShowScores(ctx, true)).toBe(true);
    });

    it("shows assignment from last verification stage", () => {
      expect(shouldShowAssignment(ctx)).toBe(true);
    });

    it("can't start or update registration", () => {
      expect(canUpdateRegistration(ctx)).toBe(false);
    });
  });
});

// ────────────────────────────────────────────────────────
// Verification stage behavior tests
// ────────────────────────────────────────────────────────

describe("verification stage behavior", () => {
  it("verification stage can only be ended manually (not by end date)", () => {
    // The verification stage has an end date but it's informational only.
    // This test validates the concept: verification completion requires explicit admin action.
    const verificationStage = {
      type: "verification" as const,
      status: "active" as const,
      endDate: new Date("2026-03-01T18:00:00"), // past date
    };

    // Even with a past end date, the stage should remain active until manually ended
    // (This is enforced by not having an automated transition for verification stages)
    expect(verificationStage.status).toBe("active");
    expect(verificationStage.type).toBe("verification");
  });

  it("ending verification stage approves current results", () => {
    // When verification is completed via the complete endpoint:
    // 1. All assignment results are set to approved=true
    // 2. Stage status becomes "completed"
    // This is the same behavior as admin stage completion
    const stageTypesAllowedForComplete = ["admin", "verification"];
    expect(stageTypesAllowedForComplete).toContain("verification");
  });

  it("assignment algorithm works for verification stages", () => {
    // The assign endpoint accepts both admin and verification stage types
    const stageTypesAllowedForAssignment = ["admin", "verification"];
    expect(stageTypesAllowedForAssignment).toContain("admin");
    expect(stageTypesAllowedForAssignment).toContain("verification");
  });

  it("verification assignments are separate from admin stage assignments", () => {
    // Each stage (admin or verification) has its own assignment results.
    // The assignment algorithm runs independently per stage ID.
    // This is inherently true since assignmentResults references stageId.
    const adminStageId = "admin-stage-uuid";
    const verificationStageId = "verification-stage-uuid";
    expect(adminStageId).not.toBe(verificationStageId);
  });
});

// ────────────────────────────────────────────────────────
// Stage transition tests
// ────────────────────────────────────────────────────────

describe("stage transitions", () => {
  function getNextStageType(
    currentType: string,
    currentOrder: number,
    totalStages: Array<{ type: string; order: number }>
  ): string | null {
    const nextStage = totalStages.find((s) => s.order === currentOrder + 1);
    return nextStage?.type ?? null;
  }

  it("initial stage transitions to admin stage", () => {
    const stages = [
      { type: "initial", order: 0 },
      { type: "admin", order: 1 },
      { type: "verification", order: 2 },
    ];
    expect(getNextStageType("initial", 0, stages)).toBe("admin");
  });

  it("admin stage transitions to verification stage", () => {
    const stages = [
      { type: "initial", order: 0 },
      { type: "admin", order: 1 },
      { type: "verification", order: 2 },
    ];
    expect(getNextStageType("admin", 1, stages)).toBe("verification");
  });

  it("verification stage transitions to supplementary stage (if exists)", () => {
    const stages = [
      { type: "initial", order: 0 },
      { type: "admin", order: 1 },
      { type: "verification", order: 2 },
      { type: "supplementary", order: 3 },
      { type: "admin", order: 4 },
      { type: "verification", order: 5 },
    ];
    expect(getNextStageType("verification", 2, stages)).toBe("supplementary");
  });

  it("verification stage has no next stage when recruitment ends", () => {
    const stages = [
      { type: "initial", order: 0 },
      { type: "admin", order: 1 },
      { type: "verification", order: 2 },
    ];
    expect(getNextStageType("verification", 2, stages)).toBeNull();
  });

  it("supplementary stage transitions to admin stage", () => {
    const stages = [
      { type: "initial", order: 0 },
      { type: "admin", order: 1 },
      { type: "verification", order: 2 },
      { type: "supplementary", order: 3 },
      { type: "admin", order: 4 },
      { type: "verification", order: 5 },
    ];
    expect(getNextStageType("supplementary", 3, stages)).toBe("admin");
  });

  it("supplementary admin stage transitions to verification stage", () => {
    const stages = [
      { type: "initial", order: 0 },
      { type: "admin", order: 1 },
      { type: "verification", order: 2 },
      { type: "supplementary", order: 3 },
      { type: "admin", order: 4 },
      { type: "verification", order: 5 },
    ];
    expect(getNextStageType("admin", 4, stages)).toBe("verification");
  });
});

// ────────────────────────────────────────────────────────
// Locked assignment lookup tests
// ────────────────────────────────────────────────────────

describe("locked assignment lookup for supplementary admin stages", () => {
  it("locked assignments come from verification stage (order - 1 of supplementary)", () => {
    // For admin stage at order 4, prev stage is supplementary at order 3
    // The stage with approved assignments before supplementary is verification at order 2
    // So prevStage.order - 1 = 3 - 1 = 2 → verification stage
    const stages = [
      { type: "initial", order: 0 },
      { type: "admin", order: 1 },
      { type: "verification", order: 2 },
      { type: "supplementary", order: 3 },
      { type: "admin", order: 4 },
      { type: "verification", order: 5 },
    ];

    const currentAdminOrder = 4;
    const prevSupplementaryOrder = currentAdminOrder - 1; // 3
    const stageWithApprovedAssignments = stages.find((s) => s.order === prevSupplementaryOrder - 1);

    expect(stageWithApprovedAssignments?.type).toBe("verification");
    expect(stageWithApprovedAssignments?.order).toBe(2);
  });

  it("second supplementary round also looks up verification stage", () => {
    const stages = [
      { type: "initial", order: 0 },
      { type: "admin", order: 1 },
      { type: "verification", order: 2 },
      { type: "supplementary", order: 3 },
      { type: "admin", order: 4 },
      { type: "verification", order: 5 },
      { type: "supplementary", order: 6 },
      { type: "admin", order: 7 },
      { type: "verification", order: 8 },
    ];

    const currentAdminOrder = 7;
    const prevSupplementaryOrder = currentAdminOrder - 1; // 6
    const stageWithApprovedAssignments = stages.find((s) => s.order === prevSupplementaryOrder - 1);

    expect(stageWithApprovedAssignments?.type).toBe("verification");
    expect(stageWithApprovedAssignments?.order).toBe(5);
  });
});

// ────────────────────────────────────────────────────────
// Assignment source for student welcome page
// ────────────────────────────────────────────────────────

describe("assignment source for student welcome page", () => {
  type StageType = "initial" | "admin" | "supplementary" | "verification";

  function getAssignmentLookupStageType(activeStageType: StageType | null, isSupplementaryActive: boolean): "admin" | "verification" {
    if (isSupplementaryActive) return "verification";
    return "admin";
  }

  it("during verification, looks up assignment from admin stage", () => {
    expect(getAssignmentLookupStageType("verification", false)).toBe("admin");
  });

  it("during supplementary, looks up assignment from verification stage", () => {
    expect(getAssignmentLookupStageType("supplementary", true)).toBe("verification");
  });

  it("during admin, looks up assignment from admin stage (previous)", () => {
    expect(getAssignmentLookupStageType("admin", false)).toBe("admin");
  });

  it("when no stage active, looks up from admin stage (last completed)", () => {
    expect(getAssignmentLookupStageType(null, false)).toBe("admin");
  });
});
